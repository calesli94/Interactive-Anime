from __future__ import annotations

from datetime import datetime

from db import get_connection


def init_stats_table() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS operation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            event_value TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def log_event(event_type: str, event_value: str = "") -> None:
    init_stats_table()
    conn = get_connection()
    conn.execute(
        "INSERT INTO operation_logs (event_type, event_value, created_at) VALUES (?, ?, ?)",
        (event_type, event_value, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


def get_today_stats() -> dict:
    init_stats_table()
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT event_type, COUNT(*) AS cnt
        FROM operation_logs
        WHERE date(created_at) = date('now')
        GROUP BY event_type
        """
    ).fetchall()
    conn.close()

    counter = {r["event_type"]: r["cnt"] for r in rows}
    generated = counter.get("generate_message", 0)
    filled = counter.get("fill_input", 0)
    greeted = counter.get("greet_sent", 0)
    reply = counter.get("reply_received", 0)
    auto_ops = counter.get("auto_mode_operation", 0)

    reply_rate = round((reply / greeted) * 100, 2) if greeted > 0 else 0.0
    return {
        "today_generated": generated,
        "today_filled": filled,
        "today_reply_rate": reply_rate,
        "today_auto_ops": auto_ops,
    }
