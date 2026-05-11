from dataclasses import asdict
from datetime import datetime
from hashlib import sha256
import json
import re

from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse

from config import settings
from db import get_connection, init_db
from database import init_recruitment_db
from routes import assert_asset_routes_registered, register_asset_routes
from services.message_service import generate_messages
from services.mode_service import GreetingModeConfig, get_mode_config, init_mode_table, save_mode_config
from services.priority_service import AnalyzeRequest, analyze_priority
from services.stats_service import get_today_stats, init_stats_table, log_event

app = FastAPI(title=settings.APP_NAME)
register_asset_routes(app)
assert_asset_routes_registered(app)

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
    init_job_profiles_table()
    init_recruitment_db()


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


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _normalize_job_title_for_match(title: str) -> str:
    text = re.sub(r"\s+", "", str(title or "").strip().lower())
    text = text.replace("高级", "").replace("资深", "").replace("经理", "").replace("主管", "")
    if any(word in text for word in ["高招", "高端招聘", "招聘hr", "招聘", "猎头", "hrbp", "人力资源"]):
        return "recruitment_high_end"
    if any(word in text for word in ["技术美术", "ta", "shader", "unity", "ue", "unreal", "虚幻"]):
        return "technical_art"
    if any(word in text for word in ["ai视频", "aigc", "comfyui", "stable", "分镜", "剪辑", "镜头"]):
        return "ai_video"
    if any(word in text for word in ["原画", "角色", "美宣", "场景", "3d", "游戏美术"]):
        return "art"
    return re.sub(r"[^0-9a-z\u4e00-\u9fa5]+", "", text)


def init_job_profiles_table() -> None:
    conn = get_connection()
    desired_columns = {
        "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
        "title": "TEXT NOT NULL",
        "normalized_title": "TEXT DEFAULT ''",
        "city": "TEXT DEFAULT ''",
        "salary": "TEXT DEFAULT ''",
        "experience_required": "TEXT DEFAULT ''",
        "education_required": "TEXT DEFAULT ''",
        "description": "TEXT DEFAULT ''",
        "responsibilities": "TEXT DEFAULT ''",
        "requirements": "TEXT DEFAULT ''",
        "preferred_keywords": "TEXT DEFAULT '[]'",
        "raw_text": "TEXT DEFAULT ''",
        "source": "TEXT DEFAULT 'manual'",
        "created_at": "TEXT NOT NULL",
        "updated_at": "TEXT NOT NULL",
    }
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS job_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            normalized_title TEXT DEFAULT '',
            city TEXT DEFAULT '',
            salary TEXT DEFAULT '',
            experience_required TEXT DEFAULT '',
            education_required TEXT DEFAULT '',
            description TEXT DEFAULT '',
            responsibilities TEXT DEFAULT '',
            requirements TEXT DEFAULT '',
            preferred_keywords TEXT DEFAULT '[]',
            raw_text TEXT DEFAULT '',
            source TEXT DEFAULT 'manual',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(title, city)
        )
        """
    )
    existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(job_profiles)").fetchall()}
    for column, ddl in desired_columns.items():
        if column not in existing_columns:
            conn.execute(f"ALTER TABLE job_profiles ADD COLUMN {column} {ddl}")
    # Older builds created title as UNIQUE, which blocks multiple cities. Rebuild once
    # when the autoindex list suggests a single-column title unique constraint.
    indexes = conn.execute("PRAGMA index_list(job_profiles)").fetchall()
    needs_rebuild = False
    for idx in indexes:
        idx_name = idx[1]
        is_unique = bool(idx[2])
        if not is_unique:
            continue
        cols = [info[2] for info in conn.execute(f"PRAGMA index_info({idx_name})").fetchall()]
        if cols == ["title"]:
            needs_rebuild = True
            break
    if needs_rebuild:
        now = _now_iso()
        conn.execute("ALTER TABLE job_profiles RENAME TO job_profiles_legacy")
        conn.execute(
            """
            CREATE TABLE job_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                normalized_title TEXT DEFAULT '',
                city TEXT DEFAULT '',
                salary TEXT DEFAULT '',
                experience_required TEXT DEFAULT '',
                education_required TEXT DEFAULT '',
                description TEXT DEFAULT '',
                responsibilities TEXT DEFAULT '',
                requirements TEXT DEFAULT '',
                preferred_keywords TEXT DEFAULT '[]',
                raw_text TEXT DEFAULT '',
                source TEXT DEFAULT 'manual',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(title, city)
            )
            """
        )
        legacy_cols = {row[1] for row in conn.execute("PRAGMA table_info(job_profiles_legacy)").fetchall()}
        rows = conn.execute("SELECT * FROM job_profiles_legacy").fetchall()
        for row in rows:
            data = {key: row[key] for key in legacy_cols}
            title = str(data.get("title") or "").strip()
            if not title:
                continue
            conn.execute(
                """
                INSERT OR REPLACE INTO job_profiles
                (title, normalized_title, city, salary, experience_required, education_required, description, responsibilities, requirements, preferred_keywords, raw_text, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    title,
                    data.get("normalized_title") or _normalize_job_title_for_match(title),
                    data.get("city") or "",
                    data.get("salary") or "",
                    data.get("experience_required") or "",
                    data.get("education_required") or "",
                    data.get("description") or "",
                    data.get("responsibilities") or "",
                    data.get("requirements") or "",
                    data.get("preferred_keywords") or "[]",
                    data.get("raw_text") or "",
                    data.get("source") or "manual",
                    data.get("created_at") or now,
                    data.get("updated_at") or now,
                ),
            )
        conn.execute("DROP TABLE job_profiles_legacy")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profiles_title_city ON job_profiles(title, city)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_job_profiles_normalized_title ON job_profiles(normalized_title)")
    rows = conn.execute("SELECT id, title, normalized_title FROM job_profiles WHERE normalized_title = '' OR normalized_title IS NULL").fetchall()
    for row in rows:
        conn.execute("UPDATE job_profiles SET normalized_title = ? WHERE id = ?", (_normalize_job_title_for_match(row["title"]), row["id"]))
    conn.commit()
    conn.close()


def _normalise_title(title: str) -> str:
    return re.sub(r"\s+", " ", str(title or "")).strip()


def _keywords_to_list(value) -> list[str]:
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        raw = value.strip()
        if raw.startswith("["):
            try:
                decoded = json.loads(raw)
                items = decoded if isinstance(decoded, list) else [raw]
            except Exception:
                items = re.split(r"[,，;；\n]+", raw)
        else:
            items = re.split(r"[,，;；\n]+", raw)
    else:
        items = []
    return [re.sub(r"\s+", " ", str(item)).strip() for item in items if str(item).strip()]



def _text_block(value) -> str:
    if isinstance(value, list):
        return "\n".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "").strip()

def _profile_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "normalized_title": row["normalized_title"] or _normalize_job_title_for_match(row["title"]),
        "city": row["city"] or "",
        "salary": row["salary"] or "",
        "experience_required": row["experience_required"] or "",
        "education_required": row["education_required"] or "",
        "description": row["description"] or "",
        "responsibilities": row["responsibilities"] or "",
        "requirements": row["requirements"] or "",
        "preferred_keywords": _keywords_to_list(row["preferred_keywords"] or "[]"),
        "raw_text": row["raw_text"] or "",
        "source": row["source"] or "manual",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "jd_complete": bool(row["description"] or row["responsibilities"] or row["requirements"]),
    }


def _job_profile_find_row(conn, title: str, city: str = ""):
    row, _ = _job_profile_find_row_with_match_type(conn, title, city)
    return row


def _job_profile_find_row_with_match_type(conn, title: str, city: str = ""):
    normalized_title = _normalise_title(title)
    normalized_match = _normalize_job_title_for_match(normalized_title)
    city = str(city or "").strip()
    if normalized_title and city:
        row = conn.execute("SELECT * FROM job_profiles WHERE title = ? AND city = ?", (normalized_title, city)).fetchone()
        if row:
            return row, "title_city"
    if normalized_title:
        row = conn.execute("SELECT * FROM job_profiles WHERE title = ? ORDER BY CASE WHEN city = ? THEN 0 WHEN city = '' THEN 1 ELSE 2 END, updated_at DESC", (normalized_title, city)).fetchone()
        if row:
            return row, "title"
    if normalized_match:
        row = conn.execute("SELECT * FROM job_profiles WHERE normalized_title = ? ORDER BY CASE WHEN city = ? THEN 0 WHEN city = '' THEN 1 ELSE 2 END, updated_at DESC", (normalized_match, city)).fetchone()
        if row:
            return row, "normalized_title"
    return None, "none"


@app.get("/api/job-profile")
def job_profile_get(title: str, city: str = "") -> dict:
    init_job_profiles_table()
    normalized = _normalise_title(title)
    if not normalized:
        raise HTTPException(status_code=400, detail="缺少岗位名称")
    conn = get_connection()
    row, match_type = _job_profile_find_row_with_match_type(conn, normalized, city)
    conn.close()
    if not row:
        return {"ok": False, "profile": None, "message": "未找到该岗位配置"}
    return {"ok": True, "profile": _profile_row_to_dict(row), "match_type": match_type}


def _profile_match_score(profile: dict, title: str, city: str, query_keywords: list[str]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    normalized_title = _normalise_title(title)
    normalized_match = _normalize_job_title_for_match(normalized_title)
    if normalized_title and profile.get("title") == normalized_title:
        score += 50
        reasons.append("标题相同")
    if normalized_match and profile.get("normalized_title") == normalized_match:
        score += 40
        reasons.append("归一标题相同")
    if city and profile.get("city") == city:
        score += 20
        reasons.append("同城市")
    profile_keywords = set(_keywords_to_list(profile.get("preferred_keywords") or []))
    query_set = set(query_keywords)
    overlap = sorted(profile_keywords & query_set)
    if overlap:
        score += min(20, len(overlap) * 5) or 20
        reasons.append(f"关键词重合：{'、'.join(overlap[:4])}")
    return score, reasons


@app.get("/api/job-profile/match")
def job_profile_match(title: str, city: str = "", keywords: str = "") -> dict:
    init_job_profiles_table()
    query_keywords = _keywords_to_list(keywords)
    normalized_title = _normalise_title(title)
    if normalized_title:
        query_keywords.extend(re.split(r"[-_/｜|\s]+", normalized_title))
    conn = get_connection()
    rows = conn.execute("SELECT * FROM job_profiles ORDER BY updated_at DESC").fetchall()
    conn.close()
    matches = []
    for row in rows:
        profile = _profile_row_to_dict(row)
        score, reasons = _profile_match_score(profile, normalized_title, city, query_keywords)
        if score >= 40:
            matches.append({
                "id": profile["id"],
                "title": profile["title"],
                "city": profile["city"],
                "salary": profile["salary"],
                "score": score,
                "reason": "/".join(reasons) or "标题相似",
                "profile": profile,
            })
    matches.sort(key=lambda item: item["score"], reverse=True)
    return {"ok": True, "matches": matches[:5]}


@app.get("/api/job-profiles")
def job_profiles_list() -> dict:
    init_job_profiles_table()
    conn = get_connection()
    rows = conn.execute("SELECT * FROM job_profiles ORDER BY updated_at DESC, title ASC").fetchall()
    conn.close()
    return {"ok": True, "profiles": [_profile_row_to_dict(row) for row in rows]}


@app.post("/api/job-profile/save")
def job_profile_save(payload: dict) -> dict:
    init_job_profiles_table()
    title = _normalise_title(payload.get("title", ""))
    if not title:
        raise HTTPException(status_code=400, detail="缺少岗位名称，无法保存岗位配置")
    now = _now_iso()
    normalized_title = _normalize_job_title_for_match(title)
    city = str(payload.get("city") or "").strip()
    salary = str(payload.get("salary") or "").strip()
    experience_required = str(payload.get("experience_required") or "").strip()
    education_required = str(payload.get("education_required") or "").strip()
    description = _text_block(payload.get("description"))
    responsibilities = _text_block(payload.get("responsibilities"))
    requirements = _text_block(payload.get("requirements"))
    preferred_keywords = json.dumps(_keywords_to_list(payload.get("preferred_keywords") or []), ensure_ascii=False)
    raw_text = _text_block(payload.get("raw_text"))
    source = str(payload.get("source") or "manual").strip() or "manual"
    conn = get_connection()
    existing = None
    if city:
        existing = conn.execute("SELECT * FROM job_profiles WHERE title = ? AND city = ?", (title, city)).fetchone()
    if not existing:
        existing = conn.execute("SELECT * FROM job_profiles WHERE title = ? AND (city = '' OR ? = '') ORDER BY updated_at DESC", (title, city)).fetchone()
    if not existing:
        existing = conn.execute("SELECT * FROM job_profiles WHERE normalized_title = ? AND (city = ? OR city = '' OR ? = '') ORDER BY updated_at DESC", (normalized_title, city, city)).fetchone()
    created_at = existing["created_at"] if existing else now
    target_id = existing["id"] if existing else None
    values = (title, normalized_title, city, salary, experience_required, education_required, description, responsibilities, requirements, preferred_keywords, raw_text, source, created_at, now)
    if target_id:
        conn.execute(
            """
            UPDATE job_profiles SET
                title = ?, normalized_title = ?, city = ?, salary = ?, experience_required = ?, education_required = ?,
                description = ?, responsibilities = ?, requirements = ?, preferred_keywords = ?, raw_text = ?, source = ?,
                created_at = ?, updated_at = ?
            WHERE id = ?
            """,
            values + (target_id,),
        )
    else:
        conn.execute(
            """
            INSERT INTO job_profiles
            (title, normalized_title, city, salary, experience_required, education_required, description, responsibilities, requirements, preferred_keywords, raw_text, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(title, city) DO UPDATE SET
                normalized_title = excluded.normalized_title,
                salary = excluded.salary,
                experience_required = excluded.experience_required,
                education_required = excluded.education_required,
                description = excluded.description,
                responsibilities = excluded.responsibilities,
                requirements = excluded.requirements,
                preferred_keywords = excluded.preferred_keywords,
                raw_text = excluded.raw_text,
                source = excluded.source,
                updated_at = excluded.updated_at
            """,
            values,
        )
    conn.commit()
    row = _job_profile_find_row(conn, title, city)
    conn.close()
    profile = _profile_row_to_dict(row)
    log_event("job_profile_saved", f"{title}:{city}:{source}")
    return {"ok": True, "profile": profile}


def _cap_level(level: str, max_level: str) -> str:
    order = {"D": 0, "C": 1, "B": 2, "A": 3, "S": 4}
    reverse = {v: k for k, v in order.items()}
    return reverse[min(order.get(level, 0), order.get(max_level, 0))]


def _candidate_text(candidate: dict) -> str:
    parts: list[str] = []
    structured = candidate.get("structured_resume") or candidate.get("resume_structured") or {}
    if isinstance(structured, dict):
        for key in ["current_title", "city", "education", "industries", "roles", "skills", "companies", "projects", "keywords", "recruiting_domains"]:
            value = structured.get(key)
            if isinstance(value, list):
                parts.extend(str(item) for item in value if str(item).strip())
            elif value:
                parts.append(str(value))
        for key in ["game_related", "ai_related", "tech_related"]:
            if structured.get(key):
                parts.append(key)
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
    # Extract explicit keywords from JD / Job Profile Store so non-standard roles still compare against requirements.
    explicit = []
    for word in [
        "Unity", "UE", "Unreal", "虚幻", "Shader", "材质", "工具链", "特效", "TA", "技术美术",
        "AI视频", "ComfyUI", "Stable Diffusion", "可灵", "即梦", "剪辑", "镜头", "镜头语言", "分镜", "角色演出", "动画", "游戏美术",
        "原画", "角色原画", "角色设计", "美宣", "Photoshop", "SAI", "CSP", "AE", "Premiere",
    ]:
        if _contains_any(source, [word]):
            explicit.append(word)
    if explicit:
        groups.append(("岗位显性技能关键词", explicit))
    if not groups and source.strip():
        words = [item for item in re.split(r"[,，;；、\s]+", source) if 2 <= len(item) <= 30]
        groups.append(("岗位要求关键词", words[:12] or [title]))
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
            "recommended_action": "请补充岗位要求后重新分析",
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




# ---- AI semantic intelligence layer (rule-based now, LLM-ready later) ----
# The functions below intentionally keep inputs/outputs JSON-serializable so an
# OpenAI/DeepSeek client can replace the rule bodies without changing API callers.

ROLE_TYPE_LABELS = {
    "recruitment": "招聘/猎头",
    "technical_art": "技术美术/TA",
    "ai_video": "AI视频",
    "art": "美术/原画",
    "unknown": "未知岗位",
}


def _join_values(*values) -> str:
    parts: list[str] = []
    for value in values:
        if isinstance(value, list):
            parts.extend(str(item) for item in value if str(item).strip())
        elif isinstance(value, dict):
            parts.extend(str(item) for item in value.values() if str(item).strip())
        elif value:
            parts.append(str(value))
    return " ".join(parts)


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = str(value or "").strip()
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _llm_job_parse_placeholder(payload: dict) -> dict | None:
    """Reserved extension point for OpenAI/DeepSeek job parsing."""
    _ = payload
    return None


def _llm_candidate_parse_placeholder(payload: dict) -> dict | None:
    """Reserved extension point for OpenAI/DeepSeek candidate parsing."""
    _ = payload
    return None


def _llm_match_analyze_placeholder(payload: dict) -> dict | None:
    """Reserved extension point for OpenAI/DeepSeek match reasoning."""
    _ = payload
    return None


def _word_hits(text: str, words: list[str]) -> list[str]:
    return [word for word in words if _contains_any(text, [word])]


def parse_job_profile(job_config: dict) -> dict:
    """Parse a job into a semantic role profile using rules only.

    Recruitment roles are detected before art/TA/AIGC keywords so phrases like
    “招聘TA / 招聘美术负责人 / 招聘AIGC专家” describe recruiting targets rather
    than the candidate's own required production skill set.
    """
    llm_result = _llm_job_parse_placeholder(job_config)
    if llm_result:
        return llm_result

    title = str(job_config.get("title") or job_config.get("job_title") or "").strip()
    text = _join_values(
        title,
        job_config.get("description"),
        job_config.get("responsibilities"),
        job_config.get("requirements"),
        job_config.get("preferred_keywords"),
        job_config.get("required_skills"),
        job_config.get("raw_text"),
    )
    title_text = title or text
    keywords = _keywords_to_list(job_config.get("preferred_keywords") or [])

    recruitment_words = ["高招HR", "高招", "招聘", "猎头", "recruit", "HR", "HRBP", "人力资源", "人才资源", "人才地图", "mapping", "Mapping", "访寻", "寻访", "招聘交付", "候选人沟通"]
    ta_words = ["技术美术", "TA", "Shader", "Unity", "UE", "Unreal", "虚幻", "工具链", "材质", "渲染"]
    ai_video_words = ["AI视频", "ComfyUI", "Stable Diffusion", "SD", "可灵", "即梦", "剪辑", "镜头语言", "镜头", "分镜", "短视频"]
    artist_words = ["原画", "角色", "角色设计", "角色原画", "角色美宣", "美宣", "场景", "3D", "道具", "游戏美术"]

    role_type = "unknown"
    role_summary = f"负责{title or '当前岗位'}相关工作"
    core_competencies: list[str] = []
    must_have: list[str] = []
    nice_to_have: list[str] = []
    anti_patterns: list[str] = []
    target_profile = ""

    if _contains_any(title_text, recruitment_words) or _contains_any(text, ["高端招聘", "人才地图", "招聘交付", "猎头", "HRBP", "人力资源"]):
        role_type = "recruitment"
        role_summary = "负责游戏行业高端岗位招聘、人才地图/Mapping、候选人沟通和复杂岗位交付"
        core_competencies = ["招聘经验", "游戏行业经验", "高端岗位交付", "人才地图/Mapping", "候选人沟通", "人才资源覆盖"]
        must_have = ["招聘/猎头/HR经验", "游戏行业或泛娱乐行业招聘经验", "高端岗位交付经验", "人才地图/Mapping能力"]
        nice_to_have = ["TA/AIGC/美术负责人等岗位招聘经验", "头部游戏公司或猎头资源", "复杂岗位跨部门推进经验"]
        anti_patterns = ["纯技术美术/TA背景", "纯原画/美术背景", "纯工程开发背景", "无招聘交付经验"]
        target_profile = "有游戏行业招聘或猎头经验，做过高端岗位交付、人才地图和候选人沟通的人。"
        keywords = _dedupe_keep_order(keywords + ["招聘", "猎头", "高招", "高端招聘", "人才地图", "Mapping", "候选人沟通", "人才资源", "游戏行业"])
    elif _contains_any(text, ai_video_words):
        role_type = "ai_video"
        role_summary = "负责AI视频内容制作、分镜设计、镜头语言、剪辑节奏和AI生成工具流程"
        core_competencies = ["AI视频制作", "分镜设计", "镜头语言", "剪辑节奏", "ComfyUI/Stable Diffusion流程"]
        must_have = ["AI视频制作经验", "分镜/剪辑/镜头语言经验", "ComfyUI或Stable Diffusion经验"]
        nice_to_have = ["游戏美术或动画经验", "可灵/即梦等视频生成工具经验", "角色演出经验"]
        anti_patterns = ["纯招聘/HR背景", "无视频或动画经验", "无AI生成工具经验"]
        target_profile = "做过AI视频、分镜剪辑或生成式影像流程，能把控镜头节奏和成片质量的人。"
        keywords = _dedupe_keep_order(keywords + ["AI视频", "ComfyUI", "Stable Diffusion", "分镜", "镜头语言", "剪辑", "动画"])
    elif _contains_any(text, ta_words):
        role_type = "technical_art"
        role_summary = "负责技术美术、引擎表现、Shader材质或美术工具链相关工作"
        core_competencies = ["技术美术/TA", "Unity/UE引擎经验", "Shader/材质", "工具链", "美术管线协作"]
        must_have = ["Unity/UE引擎经验", "Shader或材质经验", "TA或工具链经验"]
        nice_to_have = ["性能优化经验", "Houdini/特效经验", "跨美术和程序协作经验"]
        anti_patterns = ["纯招聘/HR背景", "无引擎或技术美术经验", "纯平面或纯原画经历"]
        target_profile = "有TA、Shader、引擎或美术工具链经验，能连接美术和程序流程的人。"
        keywords = _dedupe_keep_order(keywords + ["技术美术", "TA", "Unity", "UE", "Shader", "工具链"])
    elif _contains_any(text, artist_words):
        role_type = "art"
        role_summary = "负责游戏美术、角色/场景/美宣等视觉设计工作"
        core_competencies = ["游戏美术", "角色/场景设计", "美宣表现", "绘画基础", "项目风格适配"]
        must_have = ["游戏美术项目经验", "角色/场景/原画能力", "PS/SAI/CSP等绘画工具"]
        nice_to_have = ["二次元/写实等风格经验", "商业化项目经验", "美宣经验"]
        anti_patterns = ["纯招聘/HR背景", "无美术作品经验", "纯技术开发背景"]
        target_profile = "有游戏美术项目经历和作品积累，能承担角色、场景或美宣视觉设计的人。"
        keywords = _dedupe_keep_order(keywords + ["原画", "角色设计", "游戏美术", "美宣", "Photoshop"])

    return {
        "role_type": role_type,
        "role_summary": role_summary,
        "core_competencies": _dedupe_keep_order(core_competencies),
        "must_have": _dedupe_keep_order(must_have),
        "nice_to_have": _dedupe_keep_order(nice_to_have),
        "anti_patterns": _dedupe_keep_order(anti_patterns),
        "target_profile": target_profile,
        "keywords": _dedupe_keep_order(keywords),
        "llm_provider": "rules",
    }


def parse_job_intelligence(job_config: dict) -> dict:
    return parse_job_profile(job_config)


def parse_candidate_profile(candidate: dict) -> dict:
    llm_result = _llm_candidate_parse_placeholder(candidate)
    if llm_result:
        return llm_result

    text = _candidate_text(candidate)
    structured = candidate.get("structured_resume") or candidate.get("resume_structured") or {}
    if not isinstance(structured, dict):
        structured = {}
    persona_type = "unknown"
    core_strengths: list[str] = []
    evidence: list[str] = []
    risk_points: list[str] = []
    likely_fit_roles: list[str] = []
    unlikely_fit_roles: list[str] = []

    recruiter_words = ["招聘", "高招", "猎头", "HR", "HRBP", "人力资源", "人才资源", "人才地图", "Mapping", "mapping", "寻访", "访寻", "候选人", "面试", "offer", "招聘交付", "高端战略招聘"]
    ta_words = ["技术美术", "TA", "Shader", "Unity", "UE", "Unreal", "虚幻", "工具链", "材质", "渲染"]
    ai_video_words = ["AI视频", "ComfyUI", "Stable Diffusion", "SD", "剪辑", "镜头语言", "镜头", "分镜", "动画", "AE", "短视频", "可灵", "即梦"]
    artist_words = ["原画", "角色设计", "角色原画", "美宣", "游戏美术", "场景", "3D", "道具", "Photoshop", "SAI", "CSP"]
    engineer_words = ["后端", "前端", "客户端", "服务端", "Java", "Python", "C++", "Go", "程序", "开发工程师"]

    recruiter_hits = _word_hits(text, recruiter_words)
    ta_hits = _word_hits(text, ta_words)
    ai_hits = _word_hits(text, ai_video_words)
    artist_hits = _word_hits(text, artist_words)
    engineer_hits = _word_hits(text, engineer_words)
    recruiting_domains = structured.get("recruiting_domains") or []
    structured_roles = structured.get("roles") or []
    structured_skills = structured.get("skills") or []
    structured_industries = structured.get("industries") or []
    if recruiting_domains:
        recruiter_hits = _dedupe_keep_order(recruiter_hits + [str(item) for item in recruiting_domains])
    if structured.get("game_related") and "游戏" not in structured_industries:
        structured_industries = [*structured_industries, "游戏"]

    # Recruitment evidence wins when explicit recruiting delivery terms exist;
    # this prevents “招聘TA/AIGC专家” target terms from turning a recruiter into a TA.
    if recruiter_hits and (recruiting_domains or _contains_any(text, ["招聘", "高招", "猎头", "HRBP", "人力资源", "人才地图", "Mapping", "mapping", "招聘交付", "高端战略招聘"])):
        persona_type = "recruiter"
    elif ta_hits or any(item in {"技术美术", "TA", "Unity", "UE"} for item in structured_roles + structured_skills):
        persona_type = "technical_artist"
    elif ai_hits or structured.get("ai_related"):
        persona_type = "ai_video_creator"
    elif artist_hits or any(item in {"原画", "动画", "特效", "美术负责人"} for item in structured_roles):
        persona_type = "artist"
    elif engineer_hits:
        persona_type = "engineer"

    if persona_type == "recruiter":
        core_strengths = ["招聘经验", "高端岗位交付", "人才地图/Mapping", "候选人沟通", "游戏行业资源"]
        likely_fit_roles = ["recruitment"]
        unlikely_fit_roles = ["technical_art", "art", "ai_video"]
        evidence = recruiter_hits[:8]
        if not (structured.get("game_related") or _contains_any(text, ["游戏", "网易", "趣加", "三七互娱", "FunPlus"])):
            risk_points.append("未明确看到游戏行业招聘经历")
    elif persona_type == "technical_artist":
        core_strengths = ["技术美术/TA", "引擎或Shader", "美术工具链", "技术与美术协作"]
        likely_fit_roles = ["technical_art"]
        unlikely_fit_roles = ["recruitment", "art"]
        evidence = ta_hits[:8]
    elif persona_type == "ai_video_creator":
        core_strengths = ["AI视频制作", "分镜/镜头语言", "剪辑节奏", "AI生成工具"]
        likely_fit_roles = ["ai_video"]
        unlikely_fit_roles = ["recruitment"]
        evidence = ai_hits[:8]
    elif persona_type == "artist":
        core_strengths = ["游戏美术", "角色/场景/美宣", "视觉设计", "绘画工具"]
        likely_fit_roles = ["art"]
        unlikely_fit_roles = ["recruitment", "technical_art"]
        evidence = artist_hits[:8]
    elif persona_type == "engineer":
        core_strengths = ["工程开发", "程序实现"]
        likely_fit_roles = ["engineering"]
        unlikely_fit_roles = ["recruitment", "art", "ai_video"]
        evidence = engineer_hits[:8]
    else:
        risk_points.append("候选人语义画像不清晰，需要补充简历或经历信息")

    years = candidate.get("experience_years")
    if isinstance(years, str) and years.isdigit():
        years = int(years)
    if isinstance(years, (int, float)):
        seniority = "senior" if years >= 5 else ("mid" if years >= 2 else "junior")
    elif _contains_any(text, ["高级", "专家", "负责人", "leader", "主美", "资深", "10年以上"]):
        seniority = "senior"
    elif _contains_any(text, ["1年", "应届", "实习"]):
        seniority = "junior"
    else:
        seniority = "unknown"

    career_summary = {
        "recruiter": "主要背景偏招聘/猎头/HR岗位交付，重点看高端招聘、人才地图和候选人沟通经验",
        "technical_artist": "主要背景偏技术美术、引擎表现、Shader或工具链",
        "ai_video_creator": "主要背景偏AI视频、分镜、剪辑或生成式影像制作",
        "artist": "主要背景偏游戏美术、原画或视觉设计",
        "engineer": "主要背景偏工程开发或程序实现",
        "unknown": "经历信息不足，暂无法判断主要方向",
    }[persona_type]

    return {
        "persona_type": persona_type,
        "career_summary": career_summary,
        "core_strengths": _dedupe_keep_order(core_strengths),
        "evidence": _dedupe_keep_order(evidence),
        "experience_evidence": _dedupe_keep_order(evidence),
        "risk_points": _dedupe_keep_order(risk_points),
        "seniority": seniority,
        "likely_fit_roles": _dedupe_keep_order(likely_fit_roles),
        "unlikely_fit_roles": _dedupe_keep_order(unlikely_fit_roles),
        "llm_provider": "rules",
    }


def parse_candidate_intelligence(candidate: dict) -> dict:
    return parse_candidate_profile(candidate)


def _level_from_semantic_score(score: int) -> str:
    return _level_from_score(score)


def _requirement_matched(text: str, requirement: str) -> bool:
    req = str(requirement or "")
    groups = {
        "招聘": ["招聘", "高招", "猎头", "HR", "HRBP", "人力资源", "招聘交付"],
        "游戏": ["游戏", "网易", "趣加", "三七互娱", "FunPlus", "互娱"],
        "高端": ["高端", "高招", "专家", "负责人", "总监", "战略招聘"],
        "人才地图": ["人才地图", "Mapping", "mapping", "map", "寻访", "访寻"],
        "候选人沟通": ["候选人", "沟通", "面试", "offer", "邀约"],
        "AI视频": ["AI视频", "视频", "分镜", "剪辑", "镜头", "ComfyUI", "Stable Diffusion"],
        "技术美术": ["技术美术", "TA", "Shader", "Unity", "UE", "Unreal", "工具链", "材质"],
        "游戏美术": ["原画", "角色", "场景", "美宣", "3D", "游戏美术", "Photoshop", "SAI", "CSP"],
    }
    for key, words in groups.items():
        if key in req and _contains_any(text, words):
            return True
    words = [word for word in re.split(r"[/、,，或和\s]+", req) if len(word) >= 2]
    return any(_contains_any(text, [word]) for word in words)


def _cap_match_for_reliability(score: int, level: str, reliability: str) -> tuple[int, str]:
    if reliability == "low" and score > 60:
        score = 60
        level = _cap_level(level, "B")
    return score, level


def semantic_match(job_profile: dict, candidate_profile: dict, candidate: dict, job_config: dict) -> dict:
    payload = {"job_profile": job_profile, "candidate_profile": candidate_profile, "candidate": candidate or {}, "job_config": job_config or {}}
    llm_result = _llm_match_analyze_placeholder(payload)
    if llm_result:
        return llm_result

    role_type = job_profile.get("role_type") or "unknown"
    persona_type = candidate_profile.get("persona_type") or "unknown"
    c_text = _candidate_text(candidate or {})
    jd_complete = bool((job_config or {}).get("jd_complete") or (job_config or {}).get("description") or (job_config or {}).get("requirements") or (job_config or {}).get("responsibilities"))
    candidate_complete = bool((candidate or {}).get("profile_complete", True))
    reliability = "high" if jd_complete and candidate_complete and role_type != "unknown" and persona_type != "unknown" else ("medium" if role_type != "unknown" and persona_type != "unknown" else "low")
    if not jd_complete or not candidate_complete:
        reliability = "low"

    matched_points: list[str] = []
    missing_points: list[str] = []
    risk_points: list[str] = list(candidate_profile.get("risk_points") or [])

    for competency in job_profile.get("core_competencies") or []:
        if _requirement_matched(c_text, competency):
            matched_points.append(f"匹配：{competency}")
    for must in job_profile.get("must_have") or []:
        if _requirement_matched(c_text, must):
            matched_points.append(f"匹配：{must}")
        else:
            missing_points.append(f"缺失：{must}")
    for keyword in job_profile.get("keywords") or []:
        if _contains_any(c_text, [str(keyword)]):
            matched_points.append(f"匹配：{keyword}")

    matched_points = _dedupe_keep_order(matched_points)
    missing_points = _dedupe_keep_order(missing_points)

    # Hard semantic gates prevent keyword-only false positives.
    if role_type == "recruitment" and persona_type != "recruiter":
        risk_points.append(f"岗位是招聘/高招方向，但对方画像是{persona_type}，不是招聘/猎头背景")
        if persona_type in {"technical_artist", "artist", "ai_video_creator", "engineer"}:
            missing_points.append("缺失：招聘、猎头、HRBP或人才地图/Mapping经验")
        score = 30 if persona_type in {"technical_artist", "artist", "engineer"} else 38
        level = _level_from_semantic_score(score)
        return {
            "score": score,
            "level": level,
            "fit_result": "not_fit" if score <= 35 else "weak_fit",
            "message_intent": "reject" if score <= 35 else "observe",
            "matched_points": matched_points,
            "missing_points": _dedupe_keep_order(missing_points),
            "risk_points": _dedupe_keep_order(risk_points),
            "decision_summary": "高招HR/招聘岗位的本质是招聘交付，不按TA/美术/AIGC生产技能做高分；当前画像不是招聘背景，不建议强推。",
            "recommended_action": "礼貌暂不推进该岗位，可保留到更匹配的技术/美术岗位",
            "reliability": reliability,
        }

    if role_type in {"technical_art", "art"} and persona_type == "recruiter":
        needed = "TA、引擎、Shader或工具链经验" if role_type == "technical_art" else "原画、角色/场景或美宣作品经验"
        risk_points.append(f"岗位是{ROLE_TYPE_LABELS.get(role_type)}，但对方是招聘/HR画像")
        missing_points.append(f"缺失：{needed}")
        score = 25 if role_type == "technical_art" else 28
        return {
            "score": score,
            "level": "D",
            "fit_result": "not_fit",
            "message_intent": "reject",
            "matched_points": [],
            "missing_points": _dedupe_keep_order(missing_points),
            "risk_points": _dedupe_keep_order(risk_points),
            "decision_summary": f"{ROLE_TYPE_LABELS.get(role_type)}岗位需要对应生产经验，纯招聘画像不匹配。",
            "recommended_action": "不建议推进该岗位",
            "reliability": reliability,
        }

    persona_match = role_type in (candidate_profile.get("likely_fit_roles") or [])
    if role_type == "ai_video" and persona_type == "ai_video_creator":
        persona_match = True
    if role_type == "technical_art" and persona_type == "technical_artist":
        persona_match = True
    if role_type == "art" and persona_type == "artist":
        persona_match = True

    if role_type in (candidate_profile.get("unlikely_fit_roles") or []):
        risk_points.append(f"对方画像通常不适合{ROLE_TYPE_LABELS.get(role_type, role_type)}岗位")

    score = 45
    if persona_match:
        score += 25
    elif persona_type == "unknown" or role_type == "unknown":
        score -= 10
    else:
        score -= 22
    score += min(25, len(matched_points) * 5)
    score -= min(24, len(missing_points) * 3)
    score -= min(30, len(risk_points) * 10)

    if role_type == "recruitment" and persona_type == "recruiter":
        # Strong recruiter evidence should overcome target-keyword noise like TA/AIGC.
        if _contains_any(c_text, ["游戏", "网易", "趣加", "三七互娱", "FunPlus"]):
            matched_points.append("匹配：游戏行业招聘资源")
            score += 8
        if _contains_any(c_text, ["高端", "高招", "战略招聘", "负责人"]):
            matched_points.append("匹配：高端岗位交付")
            score += 6
        if _contains_any(c_text, ["人才地图", "Mapping", "mapping", "寻访"]):
            matched_points.append("匹配：人才地图/Mapping")
            score += 6
        score = max(score, 86 if len(_dedupe_keep_order(matched_points)) >= 3 else 78)
    if role_type == "ai_video" and persona_type == "ai_video_creator":
        score = max(score, 85 if len(_dedupe_keep_order(matched_points)) >= 2 else 76)
    if role_type == "technical_art" and persona_type == "technical_artist":
        score = max(score, 78)
    if role_type == "art" and persona_type == "artist":
        score = max(score, 76)

    score = max(0, min(100, int(score)))
    level = _level_from_semantic_score(score)
    score, level = _cap_match_for_reliability(score, level, reliability)

    if score >= 85 and not risk_points:
        fit_result, message_intent, action = "strong_fit", "connect", "建议建立链接，重点围绕匹配经历沟通"
    elif score >= 65 and not risk_points:
        fit_result, message_intent, action = "possible_fit", "ask_more", "建议补充确认关键能力后再推进"
    elif score >= 40:
        fit_result, message_intent, action = "weak_fit", "observe", "低压力了解，暂不强推"
    else:
        fit_result, message_intent, action = "not_fit", "reject", "不建议继续推进"

    return {
        "score": score,
        "level": level,
        "fit_result": fit_result,
        "message_intent": message_intent,
        "matched_points": _dedupe_keep_order(matched_points),
        "missing_points": _dedupe_keep_order(missing_points),
        "risk_points": _dedupe_keep_order(risk_points),
        "decision_summary": f"岗位画像为{ROLE_TYPE_LABELS.get(role_type, role_type)}，对方画像为{persona_type}；按岗位本质、画像一致性、关键能力和风险项综合判断。",
        "recommended_action": action,
        "reliability": reliability,
    }


def analyze_match_intelligence(job_profile: dict, candidate_profile: dict, candidate: dict | None = None, job_config: dict | None = None) -> dict:
    return semantic_match(job_profile, candidate_profile, candidate or {}, job_config or {})


def _semantic_result_to_priority_result(match: dict, context_id: str) -> dict:
    level = match.get("level") or _level_from_score(int(match.get("score") or 0))
    message_intent = match.get("message_intent") or "ask_more"
    priority = "高" if level in {"S", "A"} and message_intent == "connect" else ("中" if level == "B" else "低")
    recommended_mode = "manual" if message_intent == "connect" else ("assist" if message_intent in {"ask_more", "observe"} else "none")
    reasons = _dedupe_keep_order((match.get("matched_points") or []) + (match.get("missing_points") or []) + (match.get("risk_points") or []))
    return {
        "score": int(match.get("score") or 0),
        "level": level,
        "fit_result": match.get("fit_result") or "weak_fit",
        "priority": priority,
        "recommended_action": match.get("recommended_action") or "补充确认后再推进",
        "recommended_mode": recommended_mode,
        "message_intent": message_intent,
        "quota_type": "priority" if priority == "高" else "normal",
        "message_strategy": match.get("fit_result") or "weak_fit",
        "reasons": reasons,
        "matched_points": match.get("matched_points") or [],
        "missing_points": match.get("missing_points") or [],
        "risk_points": match.get("risk_points") or [],
        "reliability": match.get("reliability") or "medium",
        "candidate_starred": bool(priority == "高" and message_intent == "connect"),
        "decision_summary": match.get("decision_summary") or "",
        "context_id": context_id,
    }


@app.post("/api/ai/job/parse")
def ai_job_parse(payload: dict) -> dict:
    return parse_job_intelligence(payload or {})


@app.post("/api/ai/candidate/parse")
def ai_candidate_parse(payload: dict) -> dict:
    return parse_candidate_intelligence((payload or {}).get("candidate", {}) or {})


@app.post("/api/ai/match/analyze")
def ai_match_analyze(payload: dict) -> dict:
    job_config = (payload or {}).get("job_config", {}) or {}
    candidate = (payload or {}).get("candidate", {}) or {}
    job_profile = (payload or {}).get("job_profile") or parse_job_intelligence(job_config)
    candidate_profile = (payload or {}).get("candidate_profile") or parse_candidate_intelligence(candidate)
    return analyze_match_intelligence(job_profile, candidate_profile, candidate, job_config)


@app.post("/api/priority/analyze")
def priority_analyze(payload: dict) -> dict:
    candidate = payload.get("candidate", {}) or {}
    job_config = payload.get("job_config", {}) or {}
    context_id = payload.get("context_id", "")
    try:
        job_profile = parse_job_intelligence(job_config)
        candidate_profile = parse_candidate_intelligence(candidate)
        match = analyze_match_intelligence(job_profile, candidate_profile, candidate, job_config)
        result = _semantic_result_to_priority_result(match, context_id)
        result["job_profile"] = job_profile
        result["candidate_profile"] = candidate_profile
    except Exception as exc:
        # Keep old rule scorer as a safe fallback while the semantic layer evolves.
        result = _strict_art_score(candidate, job_config)
        result["context_id"] = context_id
        result["semantic_error"] = str(exc)
    log_event("analyze_candidate", f"{candidate.get('name', '')}:{job_config.get('title', '')}:{context_id}")
    return result

def _contains_any(text: str, keywords: list[str]) -> bool:
    lower_text = str(text or "").lower()
    for keyword in keywords:
        kw = str(keyword or "").lower()
        if not kw:
            continue
        if kw == "ta":
            if re.search(r"(?<![a-z])ta(?![a-z])", lower_text):
                return True
            continue
        if kw in lower_text:
            return True
    return False


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
    if _contains_any(safe_job_text, ["高招", "招聘", "猎头", "HRBP", "人力资源", "人才地图", "Mapping"]):
        return "招聘交付、人才地图和高端岗位沟通经验"
    if _contains_any(safe_job_text, ["AI视频", "ComfyUI", "Stable Diffusion", "剪辑", "镜头"]):
        return "AI视频、剪辑、AI工具和镜头语言经验"
    if _contains_any(safe_job_text, ["技术美术", "TA", "Shader", "Unity", "UE"]):
        return "TA、引擎、Shader或工具链经验"
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
        message = regenerate_safe_message(safe_input, strategy)
    forbidden_replacements = {
        "候选人": "人才",
        "相关信号": "相关经历",
        "已读": "",
        "送达": "",
    }
    for old, new_value in forbidden_replacements.items():
        message = message.replace(old, new_value)
    message = re.sub(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", "", message)
    message = re.sub(r"\s+", " ", message).strip()
    return message


def _humanize_point(point: str) -> str:
    text = _short_point(point)
    replacements = [
        ("候选人覆盖", "有"),
        ("经历中体现", "做过"),
        ("经历中出现", "提到过"),
        ("相关信号", "相关经历"),
        ("未明确看到", "还没确认"),
        ("未看到", "还没看到"),
    ]
    for old, new_value in replacements:
        text = text.replace(old, new_value)
    return text.strip(" ：:;；，,。")


def _message_detail_phrase(points: list[str], fallback: str) -> str:
    values = [_humanize_point(item) for item in points if _humanize_point(item)]
    if not values:
        return fallback
    return "、".join(values[:2])


def generate_message_from_safe_input(safe_input: dict, raw_sources: list[str] | None = None) -> dict:
    name = safe_input["candidate_name"]
    job_title = safe_input["job_title"]
    matched_text = _message_detail_phrase(safe_input.get("matched_points") or [], "过往经历")
    missing_text = _message_detail_phrase(safe_input.get("missing_points") or [], safe_input.get("core_requirement") or "岗位关键经验")
    core_requirement = safe_input.get("core_requirement") or "岗位核心能力"
    intent = safe_input.get("message_intent") or "ask_more"
    stage = safe_input.get("communication_stage") or "未沟通"
    objections = safe_input.get("known_objections") or []
    no_push = "不看机会/暂无计划" in objections

    if stage in {"候选人拒绝", "候选人观望"}:
        intent = "reject" if stage == "候选人拒绝" else "observe"

    if intent == "connect" and not no_push:
        strategy = "建立链接型"
        message = f"{name}你好，我看了下你的经历，{matched_text}和我们现在看的{job_title}挺接近的。想先和你简单同步下岗位情况，也了解下你最近是否会看看新的机会？"
        reason = f"画像匹配度较高，适合先建立链接；沟通阶段：{stage}"
    elif intent == "ask_more" and not no_push:
        strategy = "补充确认型"
        message = f"{name}你好，我看你的经历和{job_title}有一些交集，想再确认下：{missing_text}这部分你之前参与得多吗？如果方便，可以简单聊两句。"
        reason = f"围绕关键缺口做补充确认；沟通阶段：{stage}"
    elif intent == "observe" or no_push:
        strategy = "低压力观察型"
        message = f"{name}你好，看到你的一些经历可能和{job_title}有交集，但我还不确定方向是否完全合适。你如果愿意，可以先低压力了解下；不合适也完全没关系。"
        reason = f"匹配度或沟通意愿不确定，避免强推；沟通阶段：{stage}"
    else:
        strategy = "礼貌暂不推进型"
        message = f"{name}你好，感谢你花时间沟通。我这边重新看了下，当前{job_title}更看重{core_requirement}，和你现在的方向不太一致，这次就先不打扰你了。后面如果有更合适的机会，我再联系你。"
        reason = "语义匹配结果不适合继续推进"

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

    jd_complete = bool(job_config.get("jd_complete") or job_config.get("description") or job_config.get("requirements") or job_config.get("responsibilities"))
    message_intent = summary["message_intent"]
    if not jd_complete and message_intent == "connect":
        message_intent = "ask_more"
    safe_input = {
        "candidate_name": name,
        "job_title": job_title,
        "matched_points": summary["top_matched_points"],
        "missing_points": summary["top_missing_points"],
        "risk_points": summary["risk_points"],
        "communication_stage": chat_context["stage"],
        "communication_intent": chat_context["last_candidate_intent"],
        "known_objections": chat_context["known_objections"],
        "message_intent": message_intent,
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
