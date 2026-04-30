from dataclasses import asdict

from fastapi import FastAPI

from config import settings
from db import init_db
from services.message_service import generate_messages
from services.mode_service import GreetingModeConfig, get_mode_config, init_mode_table, save_mode_config
from services.priority_service import AnalyzeRequest, analyze_priority
from services.stats_service import get_today_stats, init_stats_table, log_event

app = FastAPI(title=settings.APP_NAME)

queue_items: list[dict] = []
queue_running = False


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    init_mode_table()
    init_stats_table()


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
