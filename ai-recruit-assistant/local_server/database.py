"""SQLite 数据库工具。

这个文件只负责两件事：
1. 创建本地 data/recruit_assistant.db 数据库文件；
2. 提供获取数据库连接的函数。

SQLite 不需要单独安装数据库服务，很适合第一阶段 MVP。
"""

from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "recruit_assistant.db"


def get_connection() -> sqlite3.Connection:
    """返回一个 SQLite 连接，并让查询结果可以像字典一样读取。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """初始化候选人表。

    IF NOT EXISTS 表示表已经存在时不会重复创建，适合服务每次启动时调用。
    """
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                raw_text TEXT NOT NULL,
                source_url TEXT NOT NULL DEFAULT '',
                analysis_score INTEGER,
                analysis_summary TEXT,
                greeting TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
