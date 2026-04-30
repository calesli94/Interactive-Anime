from dataclasses import asdict

from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, RedirectResponse

from config import settings
from db import get_connection, init_db
from services.message_service import generate_messages
from services.mode_service import GreetingModeConfig, get_mode_config, init_mode_table, save_mode_config
from services.priority_service import AnalyzeRequest, analyze_priority
from services.stats_service import get_today_stats, init_stats_table, log_event

app = FastAPI(title=settings.APP_NAME)

queue_items: list[dict] = []
queue_running = False


def init_app_settings_table() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            greet_mode TEXT NOT NULL DEFAULT 'assist',
            auto_enabled INTEGER NOT NULL DEFAULT 0,
            min_score INTEGER NOT NULL DEFAULT 60,
            daily_limit INTEGER NOT NULL DEFAULT 50,
            interval_min_seconds INTEGER NOT NULL DEFAULT 60,
            interval_max_seconds INTEGER NOT NULL DEFAULT 120,
            max_continuous_actions INTEGER NOT NULL DEFAULT 10,
            require_confirm_before_auto INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    row = conn.execute("SELECT id FROM app_settings WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            """
            INSERT INTO app_settings (
                id, greet_mode, auto_enabled, min_score, daily_limit,
                interval_min_seconds, interval_max_seconds, max_continuous_actions, require_confirm_before_auto
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("assist", 0, 60, 50, 60, 120, 10, 1),
        )
    conn.commit()
    conn.close()


def get_app_settings() -> dict:
    init_app_settings_table()
    conn = get_connection()
    row = conn.execute(
        """
        SELECT greet_mode, auto_enabled, min_score, daily_limit, interval_min_seconds,
               interval_max_seconds, max_continuous_actions, require_confirm_before_auto
        FROM app_settings WHERE id = 1
        """
    ).fetchone()
    conn.close()
    return {
        "greet_mode": row["greet_mode"],
        "auto_enabled": bool(row["auto_enabled"]),
        "min_score": int(row["min_score"]),
        "daily_limit": int(row["daily_limit"]),
        "interval_min_seconds": int(row["interval_min_seconds"]),
        "interval_max_seconds": int(row["interval_max_seconds"]),
        "max_continuous_actions": int(row["max_continuous_actions"]),
        "require_confirm_before_auto": bool(row["require_confirm_before_auto"]),
    }


def save_app_settings(payload: dict) -> dict:
    init_app_settings_table()
    greet_mode = payload.get("greet_mode", payload.get("mode", "assist"))
    safe_mode = greet_mode if greet_mode in {"manual", "assist", "auto"} else "assist"
    auto_enabled = bool(payload.get("auto_enabled", False))
    if safe_mode != "auto":
        auto_enabled = False
    min_score = max(0, min(100, int(payload.get("min_score", 60))))
    daily_limit = max(1, int(payload.get("daily_limit", 50)))
    interval_min_seconds = max(1, int(payload.get("interval_min_seconds", 60)))
    interval_max_seconds = max(interval_min_seconds, int(payload.get("interval_max_seconds", 120)))
    max_continuous_actions = max(1, int(payload.get("max_continuous_actions", 10)))
    require_confirm_before_auto = bool(payload.get("require_confirm_before_auto", True))

    conn = get_connection()
    conn.execute(
        """
        UPDATE app_settings
        SET greet_mode = ?, auto_enabled = ?, min_score = ?, daily_limit = ?,
            interval_min_seconds = ?, interval_max_seconds = ?, max_continuous_actions = ?,
            require_confirm_before_auto = ?
        WHERE id = 1
        """,
        (
            safe_mode,
            1 if auto_enabled else 0,
            min_score,
            daily_limit,
            interval_min_seconds,
            interval_max_seconds,
            max_continuous_actions,
            1 if require_confirm_before_auto else 0,
        ),
    )
    conn.commit()
    conn.close()
    return get_app_settings()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    init_mode_table()
    init_stats_table()
    init_app_settings_table()


@app.get("/", response_class=HTMLResponse)
def home_page() -> str:
    return """
    <!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI招聘助手本地服务</title></head>
    <body style="font-family: sans-serif; margin: 24px;">
      <h1>AI招聘助手本地服务</h1>
      <p>服务状态：<strong style="color:green;">运行中</strong></p>
      <ul>
        <li><a href="/settings">设置页入口 /settings</a></li>
        <li><a href="/health">健康检查入口 /health</a></li>
        <li><a href="/docs">API文档入口 /docs</a></li>
      </ul>
    </body></html>
    """


@app.get("/settings", response_class=HTMLResponse)
def settings_page() -> str:
    st = get_app_settings()
    return f"""
    <!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>设置页</title></head>
    <body style="font-family: sans-serif; margin: 24px;">
      <h1>设置页</h1>
      <p>⚠️ auto 模式有自动执行风险，请谨慎开启。</p>
      <form method="post" action="/settings/save">
        <p>打招呼模式：</p>
        <label><input type="radio" name="greet_mode" value="manual" {"checked" if st["greet_mode"]=="manual" else ""}> manual</label><br>
        <label><input type="radio" name="greet_mode" value="assist" {"checked" if st["greet_mode"]=="assist" else ""}> assist</label><br>
        <label><input type="radio" name="greet_mode" value="auto" {"checked" if st["greet_mode"]=="auto" else ""}> auto</label><br><br>
        <label><input type="checkbox" name="auto_enabled" {"checked" if st["auto_enabled"] else ""}> auto_enabled</label><br><br>
        <label>min_score: <input type="number" name="min_score" min="0" max="100" value="{st["min_score"]}"></label><br><br>
        <label>daily_limit: <input type="number" name="daily_limit" min="1" value="{st["daily_limit"]}"></label><br><br>
        <label>interval_min_seconds: <input type="number" name="interval_min_seconds" min="1" value="{st["interval_min_seconds"]}"></label><br><br>
        <label>interval_max_seconds: <input type="number" name="interval_max_seconds" min="1" value="{st["interval_max_seconds"]}"></label><br><br>
        <label>max_continuous_actions: <input type="number" name="max_continuous_actions" min="1" value="{st["max_continuous_actions"]}"></label><br><br>
        <label><input type="checkbox" name="require_confirm_before_auto" {"checked" if st["require_confirm_before_auto"] else ""}> require_confirm_before_auto</label><br><br>
        <button type="submit">保存</button>
      </form>
    </body></html>
    """


@app.post("/settings/save")
def settings_save_form(
    greet_mode: str = Form("assist"),
    auto_enabled: str | None = Form(None),
    min_score: int = Form(60),
    daily_limit: int = Form(50),
    interval_min_seconds: int = Form(60),
    interval_max_seconds: int = Form(120),
    max_continuous_actions: int = Form(10),
    require_confirm_before_auto: str | None = Form(None),
):
    save_app_settings(
        {
            "greet_mode": greet_mode,
            "auto_enabled": auto_enabled is not None,
            "min_score": min_score,
            "daily_limit": daily_limit,
            "interval_min_seconds": interval_min_seconds,
            "interval_max_seconds": interval_max_seconds,
            "max_continuous_actions": max_continuous_actions,
            "require_confirm_before_auto": require_confirm_before_auto is not None,
        }
    )
    return RedirectResponse(url="/settings", status_code=303)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/api/priority/analyze")
def priority_analyze(payload: dict) -> dict:
    candidate = payload.get("candidate", {})
    job_config = payload.get("job_config", {})
    req = AnalyzeRequest(
        candidate={
            "name": candidate.get("name", "未知候选人"),
            "skills": candidate.get("skills", []),
            "years_experience": candidate.get("experience_years", 0),
            "projects_count": len(candidate.get("project_keywords", [])),
            "activity_score": 80 if candidate.get("last_active") else 50,
            "communication_status": "neutral",
        },
        job={
            "required_skills": job_config.get("required_skills", []),
            "min_years_experience": 1,
            "preferred_projects_count": len(job_config.get("preferred_keywords", [])) or 1,
            "urgency": job_config.get("urgency", "medium"),
        },
    )
    result = analyze_priority(req)
    log_event("analyze_candidate", candidate.get("name", ""))
    return {
        "score": result.score,
        "level": result.level,
        "priority": result.priority,
        "recommended_action": "优先沟通" if result.priority == "高" else "正常跟进",
        "recommended_mode": result.recommended_mode,
        "reasons": result.reasons,
    }


@app.post("/api/message/generate")
def message_generate(payload: dict) -> dict:
    msg = generate_messages(type("Obj", (), payload))
    variants = [
        {"strategy": "项目驱动型", "message": msg.project_driven, "reason": "强调项目契合"},
        {"strategy": "低压力型", "message": msg.low_pressure, "reason": "降低沟通门槛"},
        {"strategy": "好奇心型", "message": msg.curiosity_driven, "reason": "激发候选人表达欲"},
    ]
    log_event("generate_message", payload.get("candidate", {}).get("name", ""))
    return {"variants": variants}


@app.get("/api/settings")
def settings_get() -> dict:
    settings_data = get_app_settings()
    return {
        "greet_mode": settings_data["greet_mode"],
        "auto_enabled": settings_data["auto_enabled"],
        "min_score": settings_data["min_score"],
        "daily_limit": settings_data["daily_limit"],
        "interval_min_seconds": settings_data["interval_min_seconds"],
        "interval_max_seconds": settings_data["interval_max_seconds"],
        "max_continuous_actions": settings_data["max_continuous_actions"],
        "require_confirm_before_auto": settings_data["require_confirm_before_auto"],
    }


@app.post("/api/settings")
def settings_save(payload: dict) -> dict:
    stored = save_app_settings(payload)
    mode_map = {"manual": "人工模式", "assist": "自动辅助模式", "auto": "自动模式"}
    save_mode_config(
        GreetingModeConfig(
            mode=mode_map[stored["greet_mode"]],
            daily_limit=stored["daily_limit"],
            interval_seconds=stored["interval_min_seconds"],
        )
    )
    return {"status": "ok", **stored}


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


@app.post("/api/chat/analyze")
def chat_analyze(payload: dict) -> dict:
    _ = payload
    return {
        "status": "观望",
        "stage": "激发兴趣",
        "priority": "中",
        "next_action": "补充岗位亮点并询问关注点",
        "reply_variants": ["理解你的顾虑，我补充下团队发展方向。", "如果你方便，我可以发你更详细JD。"],
    }


@app.post("/api/events/track")
def events_track(payload: dict) -> dict:
    log_event(payload.get("event_type", "unknown"), str(payload.get("payload", {})))
    return {"status": "ok"}


@app.get("/api/stats/today")
def stats_today() -> dict:
    d = get_today_stats()
    return {
        "today_analyzed": d.get("today_auto_ops", 0),
        "today_generated": d.get("today_generated", 0),
        "today_filled": d.get("today_filled", 0),
        "today_sent_marked": 0,
        "today_auto_executed": d.get("today_auto_ops", 0),
        "status_counts": {"有兴趣": 0, "观望": 0, "未回复": 0, "拒绝": 0},
        "today_reply_rate": d.get("today_reply_rate", 0),
    }
