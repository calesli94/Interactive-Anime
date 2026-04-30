from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from db import get_connection

ModeLiteral = Literal["人工模式", "自动辅助模式", "自动模式"]


@dataclass
class GreetingModeConfig:
    mode: ModeLiteral = "人工模式"
    daily_limit: int = 20
    interval_seconds: int = 60


def init_mode_table() -> None:
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS greeting_mode_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            mode TEXT NOT NULL,
            daily_limit INTEGER NOT NULL,
            interval_seconds INTEGER NOT NULL
        )
        """
    )
    row = conn.execute("SELECT id FROM greeting_mode_config WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO greeting_mode_config (id, mode, daily_limit, interval_seconds) VALUES (1, ?, ?, ?)",
            ("人工模式", 20, 60),
        )
    conn.commit()
    conn.close()


def get_mode_config() -> GreetingModeConfig:
    init_mode_table()
    conn = get_connection()
    row = conn.execute(
        "SELECT mode, daily_limit, interval_seconds FROM greeting_mode_config WHERE id = 1"
    ).fetchone()
    conn.close()
    return GreetingModeConfig(
        mode=row["mode"],
        daily_limit=row["daily_limit"],
        interval_seconds=row["interval_seconds"],
    )


def save_mode_config(config: GreetingModeConfig) -> GreetingModeConfig:
    init_mode_table()
    conn = get_connection()
    conn.execute(
        "UPDATE greeting_mode_config SET mode = ?, daily_limit = ?, interval_seconds = ? WHERE id = 1",
        (config.mode, config.daily_limit, config.interval_seconds),
    )
    conn.commit()
    conn.close()
    return config
