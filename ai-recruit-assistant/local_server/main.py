from dataclasses import asdict
from datetime import datetime
from hashlib import sha256
import re

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


def _job_text(job_config: dict) -> str:
    parts: list[str] = []
    for key in ["title", "job_title", "description", "raw_text"]:
        if job_config.get(key):
            parts.append(str(job_config.get(key)))
    for key in ["responsibilities", "requirements", "preferred_keywords", "required_skills"]:
        value = job_config.get(key) or []
        if isinstance(value, list):
            parts.extend(str(item) for item in value)
        else:
            parts.append(str(value))
    return " ".join(parts)


def _infer_job_core_requirements(title: str, job_text: str) -> list[tuple[str, list[str]]]:
    source = f"{title} {job_text}"
    groups: list[tuple[str, list[str]]] = []
    if _contains_any(source, ["技术美术", "TA", "Shader", "Unity", "UE", "材质", "工具链"]):
        groups.extend([
            ("Unity/UE 引擎经验", ["Unity", "UE", "Unreal", "虚幻", "引擎"]),
            ("Shader/材质能力", ["Shader", "着色器", "材质", "渲染"]),
            ("特效或工具链经验", ["特效", "工具链", "TA", "技术美术", "Houdini"]),
        ])
    if _contains_any(source, ["AI视频", "ComfyUI", "Stable Diffusion", "剪辑", "镜头"]):
        groups.extend([
            ("AI视频制作经验", ["AI视频", "视频", "短视频", "生成视频"]),
            ("ComfyUI/Stable Diffusion 工具经验", ["ComfyUI", "Stable Diffusion", "SD", "AI绘画", "AI工具"]),
            ("剪辑/镜头语言能力", ["剪辑", "镜头", "分镜", "成片", "AE", "Premiere"]),
        ])
    if _contains_any(source, ["原画", "角色美宣", "角色设计", "美宣"]):
        groups.extend([
            ("角色原画/角色设计经验", ["原画", "角色原画", "角色设计", "角色"]),
            ("美宣/游戏项目经验", ["美宣", "游戏美术", "游戏", "项目经历"]),
            ("PS/SAI/CSP 绘画工具", ["Photoshop", "PhotoShop", "PS", "SAI", "CSP", "csp"]),
        ])
    # Extract explicit keywords from JD so non-standard roles still compare against requirements.
    explicit = []
    for word in ["Unity", "UE", "Unreal", "虚幻", "Shader", "材质", "工具链", "特效", "TA", "技术美术", "AI视频", "ComfyUI", "Stable Diffusion", "剪辑", "镜头", "原画", "角色原画", "角色设计", "美宣", "Photoshop", "SAI", "CSP", "AE"]:
        if _contains_any(source, [word]):
            explicit.append(word)
    if explicit:
        groups.append(("岗位显性技能关键词", explicit))
    return groups


def _strict_art_score(candidate: dict, job_config: dict) -> dict:
    title = str(job_config.get("title") or job_config.get("job_title") or "").strip()
    c_text = _candidate_text(candidate)
    j_text = _job_text(job_config)
    jd_complete = bool(job_config.get("jd_complete") or job_config.get("description") or job_config.get("requirements") or job_config.get("responsibilities"))
    matched_points: list[str] = []
    missing_points: list[str] = []
    risk_points: list[str] = []

    if not title:
        return {
            "score": 35,
            "level": "C",
            "fit_result": "weak_fit",
            "priority": "低",
            "recommended_action": "请先确认岗位信息",
            "recommended_mode": "observe",
            "message_intent": "ask_more",
            "reasons": ["缺失：未识别当前沟通岗位"],
            "matched_points": [],
            "missing_points": ["缺失：未识别当前沟通岗位"],
            "risk_points": [],
            "reliability": "low",
            "candidate_starred": False,
        }

    requirement_groups = _infer_job_core_requirements(title, j_text)
    if not jd_complete:
        matched = []
        for label, words in requirement_groups:
            hits = [word for word in words if _contains_any(c_text, [word])]
            if hits:
                matched.append(f"匹配：候选人有{label}相关信号（{'、'.join(hits[:3])}）")
        missing = ["缺失：当前页面仅识别到岗位名称，未读取岗位职责/任职要求"]
        score = min(60, 35 + len(matched) * 8)
        level = _cap_level(_level_from_score(score), "B")
        return {
            "score": score,
            "level": level,
            "fit_result": "possible_fit" if matched else "weak_fit",
            "priority": "中" if matched else "低",
            "recommended_action": "补充岗位要求后重新分析",
            "recommended_mode": "assist",
            "message_intent": "ask_more",
            "reasons": matched + missing,
            "matched_points": matched,
            "missing_points": missing,
            "risk_points": [],
            "reliability": "low",
            "candidate_starred": False,
        }

    for label, words in requirement_groups:
        hits = [word for word in words if _contains_any(c_text, [word])]
        if hits:
            matched_points.append(f"匹配：候选人覆盖{label}（{'、'.join(hits[:4])}）")
        else:
            missing_points.append(f"缺失：未看到{label}")

    # Directional mismatch risks.
    if _contains_any(f"{title} {j_text}", ["技术美术", "TA", "Shader", "Unity", "UE"]):
        if _contains_any(c_text, ["原画", "角色原画", "平面设计"]) and not _contains_any(c_text, ["TA", "技术美术", "Shader", "Unity", "UE", "Unreal", "工具链"]):
            risk_points.append("风险：岗位偏技术美术TA，但候选人主要经历偏纯美术/原画，未看到TA、Shader或引擎经验")
    if _contains_any(f"{title} {j_text}", ["AI视频", "ComfyUI", "Stable Diffusion", "剪辑", "镜头"]):
        if not _contains_any(c_text, ["AI视频", "视频", "剪辑", "ComfyUI", "Stable Diffusion", "AI工具", "镜头", "分镜", "AE"]):
            risk_points.append("风险：岗位是AI视频方向，但候选人未体现AI视频、剪辑、AI工具或镜头语言经验")
    if _contains_any(f"{title} {j_text}", ["角色美宣", "角色设计", "原画"]):
        if _contains_any(c_text, ["技术美术", "TA", "程序", "开发", "运营", "行政"]) and not _contains_any(c_text, ["角色原画", "角色设计", "美宣", "Photoshop", "SAI", "CSP"]):
            risk_points.append("风险：岗位偏角色美宣/角色设计，但候选人主要方向不是角色原画或美宣")
    if _contains_any(c_text, ["行政", "运营", "客服", "销售", "财务"]):
        risk_points.append("风险：候选人出现明显非岗位方向经历")

    total = max(1, len(requirement_groups))
    match_ratio = len(matched_points) / total
    score = int(30 + match_ratio * 60 - min(30, len(risk_points) * 20) - min(15, len(missing_points) * 3))
    score = max(0, min(100, score))
    if risk_points and match_ratio < 0.5:
        score = min(score, 40)
    level = _level_from_score(score)

    if score >= 85 and not risk_points:
        fit_result = "strong_fit"
        message_intent = "connect"
        action = "建议建立链接"
        mode = "manual"
    elif score >= 70 and not risk_points:
        fit_result = "strong_fit"
        message_intent = "connect"
        action = "建议建立链接"
        mode = "manual"
    elif score >= 55:
        fit_result = "possible_fit"
        message_intent = "ask_more"
        action = "补充确认关键能力"
        mode = "assist"
    elif score > 40:
        fit_result = "weak_fit"
        message_intent = "observe"
        action = "低压力观察，确认关键能力后再推进"
        mode = "observe"
    else:
        fit_result = "not_fit"
        message_intent = "reject"
        action = "不建议继续推进"
        mode = "none"

    priority = "高" if level in {"S", "A"} and message_intent == "connect" else ("中" if level == "B" else "低")
    reliability = "high" if jd_complete and candidate.get("profile_complete") else "medium"
    reasons = matched_points + missing_points + risk_points
    return {
        "score": score,
        "level": level,
        "fit_result": fit_result,
        "priority": priority,
        "recommended_action": action,
        "recommended_mode": mode,
        "message_intent": message_intent,
        "quota_type": "priority" if priority == "高" else "normal",
        "message_strategy": fit_result,
        "reasons": reasons,
        "matched_points": matched_points,
        "missing_points": missing_points,
        "risk_points": risk_points,
        "reliability": reliability,
        "candidate_starred": bool(message_intent == "connect" and level in {"S", "A"} and not risk_points),
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



def sanitize_text_for_message(text: str) -> str:
    """Remove raw chat/page artifacts before deriving compact summaries for generated messages."""
    cleaned = str(text or "")
    cleaned = re.sub(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", " ", cleaned)
    cleaned = re.sub(r"\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\b", " ", cleaned)
    cleaned = re.sub(r"https?://\S+|www\.\S+", " ", cleaned, flags=re.I)
    blocked_phrases = [
        "沟通的职位", "沟通职位", "已读", "送达", "目前也没计划", "目前没计划", "暂时不看", "不考虑",
        "我们是承接的项目", "您好，我是", "你好，我是", "你熟悉哪个引擎", "BOSS直聘", "职位管理", "推荐牛人",
        "招聘规范", "我的客服", "聊天记录", "系统消息", "查看更多", "点击查看",
    ]
    for phrase in blocked_phrases:
        cleaned = cleaned.replace(phrase, " ")
    lines = []
    for line in cleaned.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        if len(line) > 80:
            line = line[:80]
        if any(x in line for x in ["05-", "2025-", "已读", "送达", "沟通的职位"]):
            continue
        lines.append(line)
        if len(lines) >= 8:
            break
    return " ".join(lines).strip()


def summarize_chat_context(chat_text: str) -> dict:
    raw = str(chat_text or "")
    sanitized = sanitize_text_for_message(raw)
    stage = "未沟通"
    last_candidate_intent = ""
    avoid_repeating: list[str] = []
    known_objections: list[str] = []

    if _contains_any(raw, ["没计划", "暂无计划", "暂时不看", "不考虑", "不找", "不换"]):
        stage = "候选人拒绝" if _contains_any(raw, ["不考虑", "不找", "不换"]) else "候选人观望"
        known_objections.append("不看机会/暂无计划")
        last_candidate_intent = "暂不考虑机会"
    elif _contains_any(raw, ["可以了解", "发我看看", "方便聊", "可以聊", "有兴趣"]):
        stage = "候选人有兴趣"
        last_candidate_intent = "愿意了解岗位"
    elif _contains_any(raw, ["你好", "您好", "打扰", "岗位", "机会"]):
        stage = "已打招呼"

    if _contains_any(raw, ["我们是承接的项目", "外包", "承接项目"]):
        avoid_repeating.append("已介绍过岗位合作形式")
    if _contains_any(raw, ["薪资", "预算"]):
        avoid_repeating.append("已提及薪资/预算")
    if _contains_any(raw, ["面试"]):
        avoid_repeating.append("避免直接推进面试")
    if sanitized and not last_candidate_intent and stage != "未沟通":
        last_candidate_intent = "已有历史沟通，避免重复开场"

    return {
        "stage": stage,
        "last_candidate_intent": last_candidate_intent,
        "avoid_repeating": avoid_repeating,
        "known_objections": known_objections,
    }


def _short_point(value: str, prefix: str = "") -> str:
    text = sanitize_text_for_message(str(value or ""))
    text = text.replace("匹配：", "").replace("缺失：", "").replace("风险：", "").strip(" ：:;；，,。")
    if prefix and text.startswith(prefix):
        text = text[len(prefix):].strip(" ：:;；，,。")
    return text[:36]


def _safe_generated_name(value: str) -> str:
    raw = str(value or "").strip()
    match = re.match(r"^[\u4e00-\u9fa5]{2,4}", raw)
    return match.group(0) if match else sanitize_text_for_message(raw)[:12]


def _safe_generated_job_title(value: str) -> str:
    raw = str(value or "").strip()
    if contains_raw_chat_leak(raw):
        return ""
    cleaned = sanitize_text_for_message(raw)
    if contains_raw_chat_leak(cleaned):
        return ""
    return cleaned[:40]


def build_candidate_fit_summary(candidate: dict, job_config: dict, priority_result: dict) -> dict:
    candidate_name = _safe_generated_name(candidate.get("name") or "候选人") or "候选人"
    job_title = _safe_generated_job_title(job_config.get("title") or job_config.get("job_title") or "") or "该岗位"
    matched = [_short_point(x) for x in (priority_result.get("matched_points") or [])]
    missing = [_short_point(x) for x in (priority_result.get("missing_points") or [])]
    risks = [_short_point(x) for x in (priority_result.get("risk_points") or [])]

    if not matched:
        for key in ["skills", "project_keywords"]:
            for item in candidate.get(key) or []:
                point = _short_point(str(item))
                if point:
                    matched.append(point)
                if len(matched) >= 3:
                    break
            if len(matched) >= 3:
                break
    if not missing:
        missing = [_short_point("岗位关键能力细节")]

    return {
        "candidate_name": candidate_name,
        "job_title": job_title,
        "top_matched_points": [x for x in matched if x][:3],
        "top_missing_points": [x for x in missing if x][:3],
        "risk_points": [x for x in risks if x][:3],
        "message_intent": str(priority_result.get("message_intent") or "ask_more"),
    }


def _job_core_requirement_phrase(job_config: dict, missing_points: list[str]) -> str:
    # Message generation may only use safe job fields, never raw_text/page text.
    safe_job_text = " ".join(
        [str(job_config.get("title") or job_config.get("job_title") or "")]
        + [str(x) for x in (job_config.get("requirements") or [])[:8]]
        + [str(x) for x in (job_config.get("preferred_keywords") or [])[:8]]
    )
    if _contains_any(safe_job_text, ["技术美术", "TA", "Shader", "Unity", "UE"]):
        return "TA、引擎、Shader或工具链经验"
    if _contains_any(safe_job_text, ["AI视频", "ComfyUI", "Stable Diffusion", "剪辑", "镜头"]):
        return "AI视频、剪辑、AI工具和镜头语言经验"
    if _contains_any(safe_job_text, ["角色美宣", "角色设计", "原画"]):
        return "角色原画、美宣和游戏项目经验"
    return missing_points[0] if missing_points else "岗位核心能力"

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


RAW_CHAT_LEAK_PATTERNS = [
    "黄宥源 AI视频 [送达]好滴", "陈婧铭 技术美术-TA [送达]你熟悉哪个引擎？",
    "张建渠 技术美术-动画TA [已读]目前也没计划~", "魏晓飞 高招HR [已读]我们是承接的项目",
    "顾思琪 特效原画/角色美宣/角色设计 [已读]",
    "目前也没计划", "我们是承接的项目", "沟通职位", "沟通的职位", "已读", "送达", "您好，我是", "你熟悉哪个引擎",
]


def contains_raw_chat_leak(message: str, raw_sources: list[str] | None = None) -> bool:
    text = str(message or "")
    if any(pattern in text for pattern in RAW_CHAT_LEAK_PATTERNS):
        return True
    if re.search(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", text) or re.search(r"\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}", text):
        return True
    # Detect a long contiguous fragment copied from raw chat/page text.
    for source in raw_sources or []:
        compact = re.sub(r"\s+", "", str(source or ""))
        if len(compact) < 20:
            continue
        for i in range(0, min(len(compact) - 19, 400), 5):
            fragment = compact[i : i + 20]
            if fragment and fragment in re.sub(r"\s+", "", text):
                return True
    return False


def regenerate_safe_message(safe_input: dict, strategy: str = "低压力观察型") -> str:
    name = safe_input["candidate_name"]
    job_title = safe_input["job_title"]
    core = safe_input.get("core_requirement") or "岗位核心能力"
    stage = safe_input.get("communication_stage") or "未沟通"
    if strategy == "礼貌拒绝型" or safe_input.get("message_intent") == "reject":
        return f"{name}你好，感谢你的回复。当前{job_title}更看重{core}，和你目前方向可能不完全一致，这次先不打扰你，后续有更匹配的方向再联系你。"
    if stage in {"候选人拒绝", "候选人观望"}:
        return f"{name}你好，理解你目前还在观望机会，我先不强推当前{job_title}，后续有更匹配的方向再联系你。"
    return f"{name}你好，看到你的经历和当前{job_title}有一定交集，我想先确认下你是否有{core}相关经验，方便的话可以简单说下吗？"


def final_message_guard(message: str, safe_input: dict, strategy: str, raw_sources: list[str] | None = None) -> str:
    if contains_raw_chat_leak(message, raw_sources):
        return regenerate_safe_message(safe_input, strategy)
    return message


def generate_message_from_safe_input(safe_input: dict, raw_sources: list[str] | None = None) -> dict:
    name = safe_input["candidate_name"]
    job_title = safe_input["job_title"]
    matched_text = "、".join(safe_input.get("matched_points") or []) or "部分项目经历"
    missing_text = "、".join(safe_input.get("missing_points") or []) or safe_input.get("core_requirement") or "岗位关键能力"
    core_requirement = safe_input.get("core_requirement") or "岗位核心能力"
    intent = safe_input.get("message_intent") or "ask_more"
    stage = safe_input.get("communication_stage") or "未沟通"
    objections = safe_input.get("known_objections") or []
    no_push = "不看机会/暂无计划" in objections

    if stage in {"候选人拒绝", "候选人观望"}:
        intent = "reject" if stage == "候选人拒绝" else "observe"

    if intent == "connect" and not no_push:
        strategy = "建立链接型"
        message = f"{name}你好，看到你在{matched_text}方面和我们当前沟通的{job_title}比较接近，想简单和你确认一下近期是否考虑这类机会。"
        reason = f"基于安全摘要生成；沟通阶段：{stage}"
    elif intent == "ask_more" and not no_push:
        strategy = "补充确认型"
        message = f"{name}你好，我看到你有{matched_text}，但还想确认一下你是否有{missing_text}相关经验，方便的话可以简单说下吗？"
        reason = f"仅追问摘要里的关键缺口；沟通阶段：{stage}"
    elif intent == "observe" or no_push:
        strategy = "低压力观察型"
        message = f"{name}你好，理解你目前还在观望机会。我先不强推当前{job_title}，后续如果有更贴合你方向和节奏的机会，再和你同步。"
        reason = f"候选人处于{stage}，避免重复强推"
    else:
        strategy = "礼貌拒绝型"
        message = f"{name}你好，感谢你的回复。我们看了下当前沟通的{job_title}，核心要求更偏{core_requirement}，和你目前方向可能不完全一致，这次先不打扰你，后续有更匹配的方向再联系你。"
        reason = "不适配或风险较高，生成暂不推进话术"

    return {"strategy": strategy, "message": final_message_guard(message, safe_input, strategy, raw_sources), "reason": reason}

@app.post("/api/message/generate")
def message_generate(payload: dict) -> dict:
    candidate = payload.get("candidate", {}) or {}
    priority_result = payload.get("priority_result", {}) or {}
    job_config = payload.get("job_config", {}) or {}
    context_id = payload.get("context_id", "")
    # Message generation must not consume raw chat/page text. The extension may pass
    # only a compact summary produced by the explicit chat analysis flow.
    incoming_chat_context = payload.get("chat_context_summary", {}) or {}
    chat_context = {
        "stage": str(incoming_chat_context.get("stage") or "未沟通"),
        "last_candidate_intent": str(incoming_chat_context.get("last_candidate_intent") or ""),
        "avoid_repeating": list(incoming_chat_context.get("avoid_repeating") or []),
        "known_objections": list(incoming_chat_context.get("known_objections") or []),
    }
    summary = build_candidate_fit_summary(candidate, job_config, priority_result)

    name = summary["candidate_name"]
    job_title = summary["job_title"]
    if not name or name == "候选人" or not job_title or job_title == "该岗位":
        raise HTTPException(status_code=400, detail="缺少候选人姓名或岗位信息，无法生成精准话术")

    safe_input = {
        "candidate_name": name,
        "job_title": job_title,
        "matched_points": summary["top_matched_points"],
        "missing_points": summary["top_missing_points"],
        "risk_points": summary["risk_points"],
        "communication_stage": chat_context["stage"],
        "communication_intent": chat_context["last_candidate_intent"],
        "known_objections": chat_context["known_objections"],
        "message_intent": summary["message_intent"],
        "core_requirement": _job_core_requirement_phrase(job_config, summary["top_missing_points"]),
    }
    # HARD RULE: variants are generated only from SAFE_MESSAGE_INPUT. Raw chat/page/JD
    # text is not accepted here and is never used as generation or guard source.
    variants = [generate_message_from_safe_input(safe_input, [])]

    log_event("generate_message", f"{name}:{job_title}:{context_id}:{safe_input['message_intent']}:{chat_context['stage']}")
    return {"variants": variants, "chat_context": chat_context, "fit_summary": summary}


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
