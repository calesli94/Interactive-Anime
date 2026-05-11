import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "recruitment.db"


def get_db_connection() -> sqlite3.Connection:
    init_recruitment_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_recruitment_db() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                age INTEGER,
                city TEXT,
                education TEXT,
                experience_years REAL,
                current_title TEXT,
                expected_position TEXT,
                skills_json TEXT,
                resume_text TEXT,
                resume_hash TEXT,
                source_url TEXT,
                phone TEXT,
                wechat TEXT,
                email TEXT,
                contact_json TEXT,
                companies_json TEXT,
                projects_json TEXT,
                styles_json TEXT,
                project_keywords_json TEXT,
                style_keywords_json TEXT,
                company_keywords_json TEXT,
                ai_summary TEXT,
                embedding TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_candidates_resume_hash ON candidates(resume_hash);
            CREATE INDEX IF NOT EXISTS idx_candidates_name_title ON candidates(name, current_title);
            CREATE INDEX IF NOT EXISTS idx_candidates_name_exp ON candidates(name, experience_years);

            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_title TEXT NOT NULL,
                city TEXT,
                salary TEXT,
                experience_required TEXT,
                education_required TEXT,
                responsibilities TEXT,
                requirements TEXT,
                preferred_keywords_json TEXT,
                jd_hash TEXT,
                ai_summary TEXT,
                embedding TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_jd_hash ON jobs(jd_hash);
            CREATE INDEX IF NOT EXISTS idx_jobs_title_city_salary ON jobs(job_title, city, salary);

            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                job_id INTEGER NOT NULL,
                match_score REAL,
                match_level TEXT,
                match_reason TEXT,
                risk_notes TEXT,
                recommended_action TEXT,
                ai_analysis TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(candidate_id) REFERENCES candidates(id),
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE INDEX IF NOT EXISTS idx_matches_candidate_job ON matches(candidate_id, job_id);

            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER,
                job_id INTEGER,
                message_role TEXT,
                message_text TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(candidate_id) REFERENCES candidates(id),
                FOREIGN KEY(job_id) REFERENCES jobs(id)
            );
            CREATE INDEX IF NOT EXISTS idx_chat_logs_candidate_job ON chat_logs(candidate_id, job_id);
            """
        )
        existing = {row[1] for row in conn.execute("PRAGMA table_info(candidates)").fetchall()}
        candidate_columns = {
            "phone": "TEXT",
            "wechat": "TEXT",
            "email": "TEXT",
            "contact_json": "TEXT",
            "companies_json": "TEXT",
            "projects_json": "TEXT",
            "styles_json": "TEXT",
            "project_keywords_json": "TEXT",
            "style_keywords_json": "TEXT",
            "company_keywords_json": "TEXT",
        }
        for column, column_type in candidate_columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE candidates ADD COLUMN {column} {column_type}")
        conn.commit()
    finally:
        conn.close()
    return DB_PATH
