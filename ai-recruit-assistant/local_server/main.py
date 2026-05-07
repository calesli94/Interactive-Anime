from dataclasses import asdict
from datetime import datetime
from hashlib import sha256

from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse

from config import settings
from db import get_connection, init_db
from services.message_service import generate_messages
from services.mode_service import GreetingModeConfig, get_mode_config, init_mode_table, save_mode_config
from services.priority_service import AnalyzeRequest, analyze_priority
from services.stats_service import get_today_stats, init_stats_table, log_event

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

queue_items: list[dict] = []
queue_running = False


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    init_mode_table()
    init_stats_table()
    init_followups_table()


@app.get("/", response_class=HTMLResponse)
def home_page() -> str:
    return """
    <!doctype html>
    <html lang="zh-CN">
    <head><meta charset="utf-8"><title>AI招聘助手本地服务</title></head>
    <body style="font-family: sans-serif; margin: 24px;">
      <h1>AI招聘助手本地服务</h1>
      <p>服务状态：运行中</p>
      <ul>
        <li><a href="/settings">设置页入口 /settings</a></li>
        <li><a href="/health">健康检查入口 /health</a></li>
        <li><a href="/docs">API文档入口 /docs</a></li>
      </ul>
    </body>
    </html>
    """


@app.get("/settings", response_class=HTMLResponse)
def settings_page() -> str:
    m = get_mode_config()
    mode = m.mode.replace("模式", "").lower().replace("自动辅助", "assist").replace("人工", "manual").replace("自动", "auto")
    return f"""
    <!doctype html>
    <html lang="zh-CN">
    <head><meta charset="utf-8"><title>设置</title></head>
    <body style="font-family: sans-serif; margin: 24px;">
      <h1>设置</h1>
      <form method="post" action="/settings/save">
        <label>greet_mode:
          <select name="greet_mode">
            <option value="manual" {"selected" if mode == "manual" else ""}>manual</option>
            <option value="assist" {"selected" if mode == "assist" else ""}>assist</option>
            <option value="auto" {"selected" if mode == "auto" else ""}>auto</option>
          </select>
        </label><br><br>
        <label>auto_enabled: <input type="checkbox" name="auto_enabled" value="true"></label><br><br>
        <label>min_score: <input type="number" name="min_score" value="60"></label><br><br>
        <label>daily_limit: <input type="number" name="daily_limit" value="20"></label><br><br>
        <label>interval_min_seconds: <input type="number" name="interval_min_seconds" value="60"></label><br><br>
        <label>interval_max_seconds: <input type="number" name="interval_max_seconds" value="120"></label><br><br>
        <label>max_continuous_actions: <input type="number" name="max_continuous_actions" value="5"></label><br><br>
        <label>require_confirm_before_auto: <input type="checkbox" name="require_confirm_before_auto" value="true"></label><br><br>
        <button type="submit">保存</button>
      </form>
    </body>
    </html>
    """


@app.post("/settings/save")
def settings_save_form(
    greet_mode: str = Form("assist"),
    auto_enabled: str | None = Form(None),
    min_score: int = Form(60),
    daily_limit: int = Form(20),
    interval_min_seconds: int = Form(60),
    interval_max_seconds: int = Form(120),
    max_continuous_actions: int = Form(5),
    require_confirm_before_auto: str | None = Form(None),
):
    _ = auto_enabled, interval_max_seconds, max_continuous_actions, require_confirm_before_auto
    mode_map = {"manual": "人工模式", "assist": "自动辅助模式", "auto": "自动模式"}
    mode = mode_map.get(greet_mode, "自动辅助模式")
    save_mode_config(GreetingModeConfig(mode=mode, daily_limit=daily_limit, interval_seconds=interval_min_seconds))
    _ = min_score
    return RedirectResponse(url="/settings", status_code=303)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


def _cap_level(level: str, max_level: str) -> str:
    order = {"D": 0, "C": 1, "B": 2, "A": 3, "S": 4}
    reverse = {v: k for k, v in order.items()}
    return reverse[min(order.get(level, 0), order.get(max_level, 0))]


def _candidate_text(candidate: dict) -> str:
    parts: list[str] = []
    for key in ["raw_text", "expected_position", "current_title", "title", "education", "salary_expectation"]:
        value = candidate.get(key)
        if value:
            parts.append(str(value))
    for key in ["skills", "project_keywords", "work_experiences"]:
        value = candidate.get(key) or []
        if isinstance(value, list):
            parts.extend(str(item) for item in value)
        else:
            parts.append(str(value))
    return " ".join(parts)


def _strict_art_score(candidate: dict, job_config: dict) -> dict:
    title = str(job_config.get("title") or job_config.get("job_title") or "").strip()
    text = _candidate_text(candidate)
    reasons: list[str] = []
    score = 20
    severe_risk = False

    if not title:
        return {
            "score": 45,
            "level": "B",
            "priority": "中",
            "recommended_action": "请先确认岗位信息",
            "recommended_mode": "assist",
            "quota_type": "normal",
            "message_strategy": "信息补全型",
            "reasons": ["扣分：缺少当前沟通岗位，无法做岗位约束评分"],
            "candidate_starred": False,
        }

    if len(text.strip()) < 80 or candidate.get("profile_complete") is False:
        reasons.append("扣分：候选人在线简历信息不完整")

    match_groups = [
        ("原画/角色原画/角色设计", ["原画", "角色原画", "角色设计"]),
        ("角色/场景游戏美术", ["游戏美术", "角色", "场景"]),
        ("美宣方向", ["美宣", "宣传图", "角色美宣"]),
        ("绘画风格", ["手绘", "厚涂", "二次元", "写实", "欧美", "日韩"]),
        ("绘画工具", ["Photoshop", "PS", "SAI", "CSP"]),
        ("项目美术职责", ["项目经历", "工作经历", "道具设计", "商业化", "手游", "端游", "游戏"]),
    ]
    missing: list[str] = []
    for label, words in match_groups:
        hits = [word for word in words if _contains_any(text, [word])]
        if hits:
            score += 10 if label != "绘画工具" else 8
            reasons.append(f"匹配：{label}（{ '、'.join(hits[:4]) }）")
        else:
            missing.append(label)

    risk_words = ["AI视频", "技术美术", "TA", "平面设计", "运营", "行政", "程序", "开发", "客服", "销售", "非美术"]
    risks = [word for word in risk_words if _contains_any(text, [word])]
    if risks:
        score -= 25
        severe_risk = True
        reasons.append(f"扣分：岗位要求原画/角色美宣，但候选人偏{'、'.join(risks[:4])}")

    if missing:
        score -= min(25, len(missing) * 5)
        reasons.append(f"缺失：未看到{'、'.join(missing[:4])}")
    if not _contains_any(text, ["作品", "作品集", "链接", "ArtStation", "站酷", "米画师"]):
        reasons.append("风险：未看到完整项目作品链接")

    if "原画" in title or "角色美宣" in title or "角色设计" in title:
        if not _contains_any(text, ["原画", "角色原画", "角色设计", "美宣", "游戏美术", "角色"]):
            score = min(score, 45)
            severe_risk = True
            reasons.append("扣分：当前岗位是原画/角色美宣/角色设计，但简历缺少核心方向关键词")

    score = max(0, min(score, 100))
    level = _level_from_score(score)
    if len(text.strip()) < 80 or candidate.get("profile_complete") is False:
        level = _cap_level(level, "B")
        score = min(score, 69)
    if severe_risk:
        level = _cap_level(level, "B")
        score = min(score, 65)
    if not title:
        level = _cap_level(level, "B")

    priority = _priority_from_level(level)
    if not title or level == "B":
        priority = "中"
    if level in {"C", "D"}:
        priority = "低"

    if not title:
        action = "请先确认岗位信息"
    elif len(text.strip()) < 80 or candidate.get("profile_complete") is False:
        action = "请打开在线简历后重新分析"
    else:
        action = _recommended_action_from_level(level)

    mode = "manual" if level in {"S", "A"} else ("assist" if level == "B" else "observe")
    return {
        "score": score,
        "level": level,
        "priority": priority,
        "recommended_action": action,
        "recommended_mode": mode,
        "quota_type": "priority" if priority == "高" else "normal",
        "message_strategy": "项目驱动型" if level in {"S", "A"} else "信息补全型",
        "reasons": reasons or ["扣分：未读取到足够岗位匹配信息"],
        "candidate_starred": bool(level in {"S", "A"} and not severe_risk),
    }


@app.post("/api/priority/analyze")
def priority_analyze(payload: dict) -> dict:
    candidate = payload.get("candidate", {}) or {}
    job_config = payload.get("job_config", {}) or {}
    context_id = payload.get("context_id", "")
    result = _strict_art_score(candidate, job_config)
    log_event("analyze_candidate", f"{candidate.get('name', '')}:{job_config.get('title', '')}:{context_id}")
    return {**result, "context_id": context_id}


def _contains_any(text: str, keywords: list[str]) -> bool:
    lower_text = text.lower()
    return any(keyword.lower() in lower_text for keyword in keywords)


def _level_from_score(score: int) -> str:
    if score >= 85:
        return "S"
    if score >= 70:
        return "A"
    if score >= 50:
        return "B"
    if score >= 30:
        return "C"
    return "D"


def _recommended_mode_from_level(level: str) -> str:
    if level in {"S", "A"}:
        return "manual"
    if level in {"B", "C"}:
        return "assist"
    return "none"


def _priority_from_level(level: str) -> str:
    if level in {"S", "A"}:
        return "高"
    if level == "B":
        return "中"
    return "低"


def _recommended_action_from_level(level: str) -> str:
    if level == "S":
        return "立即沟通"
    if level == "A":
        return "建议沟通"
    if level == "B":
        return "辅助跟进"
    if level == "C":
        return "低优先级观察"
    return "暂不推荐"


def _analyze_candidate_text(candidate_text: str) -> dict:
    text = candidate_text.strip()
    score = 0
    reasons: list[str] = []

    if _contains_any(text, ["UE", "Unreal", "虚幻"]):
        score += 25
        reasons.append("技能关键词匹配")
    if _contains_any(text, ["Maya"]):
        score += 20
        reasons.append("Maya工具经验匹配")
    if _contains_any(text, ["3A", "次世代", "角色", "场景", "手游"]):
        score += 20
        reasons.append("项目经验匹配")
    if _contains_any(text, ["3年以上", "三年以上", "5年", "五年", "高级"]):
        score += 15
        reasons.append("工作年限符合")
    if _contains_any(text, ["外包", "商业化皮肤", "游戏项目"]):
        score += 10
        reasons.append("有商业项目或游戏项目经历")

    has_relevant_signal = score > 0
    if not text:
        score = 0
        reasons.append("未读取到候选人信息")
    elif not has_relevant_signal:
        score = 20
        reasons.append("候选人信息与当前游戏美术岗位匹配度较低")
    elif _contains_any(text, ["销售", "财务", "行政", "客服", "餐饮", "司机"]):
        score = max(0, score - 25)
        reasons.append("存在明显不相关经历，已降低优先级")

    score = max(0, min(score, 100))
    level = _level_from_score(score)
    return {
        "match_rate": score,
        "level": level,
        "priority": _priority_from_level(level),
        "recommended_mode": _recommended_mode_from_level(level),
        "recommended_action": _recommended_action_from_level(level),
        "reason": reasons,
    }


@app.post("/api/analyze_candidate")
def analyze_candidate(payload: dict) -> dict:
    candidate_text = str(payload.get("candidate_text", "")).strip()
    source = str(payload.get("source", "boss_web"))
    result = _analyze_candidate_text(candidate_text)
    log_event("analyze_candidate", f"{source}:{candidate_text[:40]}")
    return result


@app.post("/api/generate_greeting")
def generate_greeting(payload: dict) -> dict:
    candidate_text = str(payload.get("candidate_text", "")).strip()
    analysis_result = payload.get("analysis_result", {}) or {}
    level = analysis_result.get("level", "B")
    priority = analysis_result.get("priority", "中")
    mode = analysis_result.get("recommended_mode", "assist")
    reason = "、".join(analysis_result.get("reason", [])[:2]) or "你的项目经历和岗位方向有一定契合"
    role_hint = "游戏美术/TA方向"
    if _contains_any(candidate_text, ["角色"]):
        role_hint = "游戏角色美术方向"
    elif _contains_any(candidate_text, ["场景"]):
        role_hint = "游戏场景美术方向"
    elif _contains_any(candidate_text, ["TA", "技术美术"]):
        role_hint = "技术美术方向"

    messages = [
        {
            "type": "项目驱动型",
            "text": f"你好，我看到你在{role_hint}的经历，尤其是{reason}，和我们正在推进的游戏项目比较贴近。想简单了解下你近期是否会关注新的机会？方便的话我可以先发你岗位信息。",
        },
        {
            "type": "低压力型",
            "text": f"你好，打扰一下。我这边在看{role_hint}候选人，你的背景匹配度评估为{level}级、优先级{priority}。如果你最近不着急也没关系，可以先简单了解下团队和项目方向。",
        },
        {
            "type": "好奇心型",
            "text": f"你好，我注意到你简历里有一些和我们项目相关的关键词，系统建议用{mode}模式跟进。我比较好奇你更偏向哪类游戏项目或美术风格？如果方向合适，我们可以再细聊。",
        },
    ]
    log_event("generate_greeting", candidate_text[:40])
    return {"messages": messages}


def _matching_points(candidate: dict, job_title: str) -> list[str]:
    text = _candidate_text(candidate)
    points: list[str] = []
    for label, words in [
        ("原画师经历", ["原画", "角色原画"]),
        ("角色设计经历", ["角色设计", "角色"]),
        ("角色美宣经验", ["美宣", "角色美宣", "宣传图"]),
        ("道具/项目美术设计", ["道具设计", "项目经历", "游戏"]),
        ("Photoshop/SAI/CSP 技能", ["Photoshop", "PS", "SAI", "CSP"]),
        ("手绘/厚涂等绘画风格", ["手绘", "厚涂", "二次元", "写实", "欧美", "日韩"]),
    ]:
        if _contains_any(text, words):
            points.append(label)
    if not points and candidate.get("expected_position"):
        points.append(f"期望职位是{candidate.get('expected_position')}")
    if not points and candidate.get("current_title"):
        points.append(f"当前经历包含{candidate.get('current_title')}")
    return points[:3]


@app.post("/api/message/generate")
def message_generate(payload: dict) -> dict:
    candidate = payload.get("candidate", {}) or {}
    priority_result = payload.get("priority_result", {}) or {}
    job_config = payload.get("job_config", {}) or {}
    context_id = payload.get("context_id", "")
    name = str(candidate.get("name") or "").strip()
    job_title = str(job_config.get("title") or job_config.get("job_title") or "").strip()
    if not name or not job_title:
        raise HTTPException(status_code=400, detail="缺少候选人姓名或岗位信息，无法生成精准话术")
    points = _matching_points(candidate, job_title)
    if not points:
        points = ["简历中暂未提取到明确匹配点，建议先打开在线简历确认"]
    point_text = "，也".join(points)
    strategy = priority_result.get("message_strategy", "项目驱动型")
    variants = [
        {
            "strategy": "项目驱动型",
            "message": f"{name}你好，看到你有{point_text}。我们当前沟通的是{job_title}岗位，方向上和你的相关经历比较接近，想和你简单确认下近期是否考虑这类机会？",
            "reason": f"绑定当前候选人{name}、当前沟通岗位{job_title}和简历匹配点：{'、'.join(points)}",
        },
        {
            "strategy": "低压力型",
            "message": f"{name}你好，打扰一下。我这边当前沟通的是{job_title}岗位，看到你简历里有{point_text}，所以想先和你低压力同步下岗位方向；如果你近期不考虑也没关系。",
            "reason": "保留具体岗位和真实匹配点，同时降低回复压力",
        },
        {
            "strategy": "确认意向型",
            "message": f"{name}你好，看到你简历中的{point_text}和{job_title}有一定关联。我想先确认下，你现在是否还关注原画/角色美宣/角色设计这类机会？如果方向合适我再发你岗位细节。",
            "reason": f"当前推荐策略：{strategy}，先确认候选人对当前岗位的真实意向",
        },
    ]
    log_event("generate_message", f"{name}:{job_title}:{context_id}")
    return {"variants": variants}


@app.get("/api/settings")
def settings_get() -> dict:
    m = get_mode_config()
    return {"mode": m.mode.replace("模式", "").lower().replace("自动辅助", "assist").replace("人工", "manual").replace("自动", "auto"), "min_score": 60}


@app.post("/api/settings")
def settings_save(payload: dict) -> dict:
    mode_map = {"manual": "人工模式", "assist": "自动辅助模式", "auto": "自动模式"}
    mode = mode_map.get(payload.get("mode", "assist"), "自动辅助模式")
    save_mode_config(GreetingModeConfig(mode=mode, daily_limit=20, interval_seconds=60))
    return {"status": "ok", "mode": payload.get("mode", "assist"), "min_score": payload.get("min_score", 60)}


@app.post("/api/queue/add")
def queue_add(payload: dict) -> dict:
    queue_items.append(payload)
    return {"status": "ok", "queue_count": len(queue_items)}


@app.post("/api/queue/start")
def queue_start() -> dict:
    global queue_running
    queue_running = True
    return {"status": "ok"}


@app.post("/api/queue/pause")
def queue_pause() -> dict:
    global queue_running
    queue_running = False
    return {"status": "ok"}


@app.post("/api/queue/clear")
def queue_clear() -> dict:
    queue_items.clear()
    return {"status": "ok", "queue_count": 0}


@app.post("/api/queue/stop")
def queue_stop() -> dict:
    global queue_running
    queue_running = False
    return {"status": "ok"}


@app.get("/api/queue/status")
def queue_status() -> dict:
    return {"running": queue_running, "queue_count": len(queue_items), "items": queue_items}


def _candidate_hash(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()[:12]


def init_followups_table() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS followups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_hash TEXT NOT NULL UNIQUE,
            candidate_name TEXT NOT NULL,
            candidate_text TEXT,
            job_title TEXT,
            context_id TEXT,
            status TEXT NOT NULL,
            last_contact_at TEXT,
            priority TEXT NOT NULL,
            next_action TEXT NOT NULL,
            suggested_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(followups)").fetchall()}
    for column, ddl in {
        "job_title": "ALTER TABLE followups ADD COLUMN job_title TEXT",
        "context_id": "ALTER TABLE followups ADD COLUMN context_id TEXT",
        "suggested_message": "ALTER TABLE followups ADD COLUMN suggested_message TEXT",
    }.items():
        if column not in existing:
            conn.execute(ddl)
    conn.commit()
    conn.close()


def _analyze_chat_text(chat_text: str) -> dict:
    text = chat_text.strip()
    if not text:
        status = "未回复"
    elif _contains_any(text, ["可以了解", "感兴趣", "怎么聊", "发我看看", "方便"]):
        status = "有兴趣"
    elif _contains_any(text, ["暂时不看", "不考虑", "没兴趣", "已找到"]):
        status = "拒绝"
    elif _contains_any(text, ["先看看", "后面再说", "最近忙", "了解一下"]):
        status = "观望"
    else:
        status = "未回复"

    stage_map = {"有兴趣": "推进面试", "观望": "激发兴趣", "拒绝": "挽回", "未回复": "挽回"}
    priority_map = {"有兴趣": "高", "观望": "中", "未回复": "中", "拒绝": "低"}
    action_map = {
        "有兴趣": "尽快补充岗位信息并推动约面",
        "观望": "补充项目亮点和团队优势，降低沟通压力",
        "未回复": "建议二次轻触达，不要连续施压",
        "拒绝": "记录原因，不再打扰",
    }
    replies_map = {
        "有兴趣": [
            "太好了，我先把岗位核心信息和项目方向发你，你看完后我们可以约个10分钟简单沟通。",
            "方便的话我可以先了解下你更关注项目类型、团队氛围还是薪资空间，再给你匹配重点信息。",
        ],
        "观望": [
            "理解，你可以先简单看看。我补充下项目亮点和团队情况，如果方向不合适也没关系。",
            "没问题，不着急决定。我先发你几个关键信息，你有兴趣时我们再继续聊。",
        ],
        "未回复": [
            "你好，怕你消息太多没看到，我再轻轻跟进一下。这个岗位和你的经历有些契合，方便时可以看下。",
            "打扰啦，我把岗位方向再简短补充一下；如果暂时不看机会也没关系，告诉我一声即可。",
        ],
        "拒绝": [
            "理解，感谢回复。后续如果你开始关注新机会，也欢迎再联系我。",
            "好的，不打扰你了。祝你当前工作顺利，后续有合适机会再交流。",
        ],
    }
    return {
        "status": status,
        "stage": stage_map[status],
        "priority": priority_map[status],
        "next_action": action_map[status],
        "reply_variants": replies_map[status],
    }


def _suggested_followup_message(status: str, candidate_name: str, next_action: str) -> str:
    name_prefix = f"{candidate_name}，" if candidate_name and not candidate_name.startswith("candidate_") else "你好，"
    if status == "未回复":
        return f"{name_prefix}怕你消息太多没看到，我再轻轻跟进一下。这个岗位和你的项目经历有一定契合，方便时可以看下。"
    if status == "观望":
        return f"{name_prefix}理解你想先看看。我补充下项目亮点和团队情况，你可以低压力了解一下，方向合适再继续聊。"
    if status == "有兴趣":
        return f"{name_prefix}我把岗位核心信息整理给你，如果你方便，我们可以约个10分钟沟通项目方向和团队情况。"
    if status == "拒绝":
        return "记录原因，不再打扰"
    return next_action or "建议跟进"


@app.post("/api/chat/analyze")
def chat_analyze(payload: dict) -> dict:
    return _analyze_chat_text(str(payload.get("chat_text", "")))


@app.post("/api/followup/add")
def followup_add(payload: dict) -> dict:
    init_followups_table()
    candidate_text = str(payload.get("candidate_text", "")).strip()
    candidate_name = str(payload.get("candidate_name", "")).strip()
    job_title = str(payload.get("job_title", "")).strip()
    context_id = str(payload.get("context_id", "")).strip()
    candidate_hash = _candidate_hash(context_id or candidate_name or candidate_text or datetime.utcnow().isoformat())
    if not candidate_name:
        candidate_name = f"candidate_{candidate_hash}"
    status = str(payload.get("status", "未回复")).strip() or "未回复"
    priority = str(payload.get("priority", "中")).strip() or "中"
    next_action = str(payload.get("next_action", "建议跟进")).strip() or "建议跟进"
    suggested_message = str(payload.get("suggested_message", "")).strip() or _suggested_followup_message(status, candidate_name, next_action)
    last_contact_at = str(payload.get("last_contact_at", "")).strip() or datetime.utcnow().isoformat()
    now = datetime.utcnow().isoformat()

    conn = get_connection()
    conn.execute(
        """
        INSERT INTO followups (candidate_hash, candidate_name, candidate_text, job_title, context_id, status, last_contact_at, priority, next_action, suggested_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_hash) DO UPDATE SET
            candidate_name = excluded.candidate_name,
            candidate_text = excluded.candidate_text,
            job_title = excluded.job_title,
            context_id = excluded.context_id,
            status = excluded.status,
            last_contact_at = excluded.last_contact_at,
            priority = excluded.priority,
            next_action = excluded.next_action,
            suggested_message = excluded.suggested_message,
            updated_at = excluded.updated_at
        """,
        (candidate_hash, candidate_name, candidate_text, job_title, context_id, status, last_contact_at, priority, next_action, suggested_message, now, now),
    )
    conn.commit()
    conn.close()
    log_event("followup_saved", f"{candidate_name}:{job_title}:{context_id}:{status}")
    return {"status": "ok", "candidate_hash": candidate_hash, "candidate_name": candidate_name}


@app.get("/api/followup/today")
def followup_today() -> dict:
    init_followups_table()
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT candidate_name, job_title, context_id, status, priority, next_action, suggested_message, candidate_text, updated_at
        FROM followups
        WHERE date(updated_at) = date('now')
        ORDER BY
            CASE priority WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END,
            updated_at DESC
        """
    ).fetchall()
    conn.close()
    items = []
    for row in rows:
        items.append(
            {
                "candidate_name": row["candidate_name"],
                "job_title": row["job_title"],
                "context_id": row["context_id"],
                "status": row["status"],
                "priority": row["priority"],
                "next_action": row["next_action"],
                "suggested_message": row["suggested_message"] or _suggested_followup_message(row["status"], row["candidate_name"], row["next_action"]),
            }
        )
    return {"items": items}


@app.post("/api/events/track")
def events_track(payload: dict) -> dict:
    event_type = payload.get("event_type", "unknown")
    event_payload = payload.get("payload", {})
    payload_json = str(event_payload)
    init_stats_table()
    conn = get_connection()
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(operation_logs)").fetchall()}
    if "payload_json" not in existing:
        conn.execute("ALTER TABLE operation_logs ADD COLUMN payload_json TEXT")
    conn.execute(
        "INSERT INTO operation_logs (event_type, event_value, payload_json, created_at) VALUES (?, ?, ?, ?)",
        (event_type, payload_json, payload_json, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/stats/today")
def stats_today() -> dict:
    init_stats_table()
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT event_type, event_value, COUNT(*) AS cnt
        FROM operation_logs
        WHERE date(created_at) = date('now')
        GROUP BY event_type, event_value
        """
    ).fetchall()
    conn.close()
    counts: dict[str, int] = {}
    status_counts = {"有兴趣": 0, "观望": 0, "未回复": 0, "拒绝": 0}
    for row in rows:
        event_type = row["event_type"]
        counts[event_type] = counts.get(event_type, 0) + row["cnt"]
        if event_type == "status_updated":
            for status in status_counts:
                if status in (row["event_value"] or ""):
                    status_counts[status] += row["cnt"]
    return {
        "today_analyzed": counts.get("priority_analyzed", 0),
        "today_generated": counts.get("message_generated", 0),
        "today_filled": counts.get("fill_message", 0) + counts.get("fill_input", 0),
        "today_sent_marked": counts.get("manual_sent_marked", 0),
        "today_auto_executed": counts.get("auto_mode_operation", 0),
        "status_counts": status_counts,
        "today_followup_added": counts.get("followup_added", 0),
        "today_followup_handled": counts.get("followup_handled", 0),
        "today_reply_rate": 0,
    }
