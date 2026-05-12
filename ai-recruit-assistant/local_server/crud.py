from __future__ import annotations

from datetime import datetime
from hashlib import sha256
import json
from typing import Any

from database import get_db_connection, init_recruitment_db
from models import CandidateSaveRequest, JobSaveRequest, MatchSaveRequest


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def stable_hash(value: str) -> str:
    text = " ".join(str(value or "").split())
    return sha256(text.encode("utf-8")).hexdigest() if text else ""


def json_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value or [], ensure_ascii=False)


def lines_text(value: Any) -> str:
    if isinstance(value, list):
        return "\n".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "")


def row_to_dict(row: Any) -> dict[str, Any]:
    item = dict(row)
    for key in ["skills_json", "preferred_keywords_json", "contact_json", "companies_json", "projects_json", "styles_json", "project_keywords_json", "style_keywords_json", "company_keywords_json"]:
        if key in item:
            try:
                item[key.replace("_json", "")] = json.loads(item[key] or "[]")
            except json.JSONDecodeError:
                item[key.replace("_json", "")] = []
    for key in ["matched_json", "missing_json", "risks_json"]:
        if key in item:
            output_key = key.replace("_json", "")
            try:
                item[output_key] = json.loads(item[key] or "[]")
            except json.JSONDecodeError:
                item[output_key] = []
    if "score" in item and item.get("score") is None:
        item["score"] = item.get("match_score")
    if "level" in item and not item.get("level"):
        item["level"] = item.get("match_level")
    if "recommendation" in item and not item.get("recommendation"):
        item["recommendation"] = item.get("recommended_action")
    if "reasoning_text" in item and item.get("reasoning_text") is None:
        item["reasoning_text"] = item.get("match_reason")
    return item


def find_candidate_duplicate(conn, payload: CandidateSaveRequest) -> int | None:
    if payload.resume_hash:
        row = conn.execute("SELECT id FROM candidates WHERE resume_hash = ?", (payload.resume_hash,)).fetchone()
        if row:
            return row["id"]
    if payload.name and payload.current_title:
        row = conn.execute(
            "SELECT id FROM candidates WHERE name = ? AND current_title = ? ORDER BY updated_at DESC LIMIT 1",
            (payload.name, payload.current_title),
        ).fetchone()
        if row:
            return row["id"]
    if payload.name and payload.experience_years is not None:
        row = conn.execute(
            "SELECT id FROM candidates WHERE name = ? AND experience_years = ? ORDER BY updated_at DESC LIMIT 1",
            (payload.name, payload.experience_years),
        ).fetchone()
        if row:
            return row["id"]
    return None


def save_candidate(data: CandidateSaveRequest | dict[str, Any]) -> dict[str, Any]:
    init_recruitment_db()
    payload = data if isinstance(data, CandidateSaveRequest) else CandidateSaveRequest(**data)
    resume_text = payload.resume_text or payload.raw_text
    resume_hash = payload.resume_hash or stable_hash(resume_text)
    if not payload.name or not (resume_text or payload.current_title or payload.expected_position):
        raise ValueError("候选人数据不完整")
    now = now_iso()
    conn = get_db_connection()
    try:
        normalized = {
            "name": payload.name.strip(),
            "age": payload.age,
            "city": payload.city.strip(),
            "education": payload.education.strip(),
            "experience_years": payload.experience_years,
            "current_title": payload.current_title.strip(),
            "expected_position": payload.expected_position.strip(),
            "skills_json": payload.skills_json or json_text(payload.skills),
            "resume_text": resume_text,
            "resume_hash": resume_hash,
            "source_url": payload.source_url,
            "phone": payload.phone.strip(),
            "wechat": payload.wechat.strip(),
            "email": payload.email.strip(),
            "contact_json": json_text(payload.contact or []),
            "companies_json": json_text(payload.companies),
            "projects_json": json_text(payload.projects),
            "styles_json": json_text(payload.styles),
            "project_keywords_json": json_text(payload.project_keywords),
            "style_keywords_json": json_text(payload.style_keywords),
            "company_keywords_json": json_text(payload.company_keywords),
            "ai_summary": payload.ai_summary,
            "embedding": payload.embedding,
            "updated_at": now,
        }
        existing_id = find_candidate_duplicate(conn, CandidateSaveRequest(**{**payload.dict(), "resume_text": resume_text, "resume_hash": resume_hash}))
        if existing_id:
            conn.execute(
                """
                UPDATE candidates SET name=:name, age=:age, city=:city, education=:education,
                    experience_years=:experience_years, current_title=:current_title,
                    expected_position=:expected_position, skills_json=:skills_json, resume_text=:resume_text,
                    resume_hash=:resume_hash, source_url=:source_url, phone=:phone, wechat=:wechat,
                    email=:email, contact_json=:contact_json, companies_json=:companies_json,
                    projects_json=:projects_json, styles_json=:styles_json,
                    project_keywords_json=:project_keywords_json, style_keywords_json=:style_keywords_json,
                    company_keywords_json=:company_keywords_json, ai_summary=:ai_summary,
                    embedding=:embedding, updated_at=:updated_at
                WHERE id=:id
                """,
                {**normalized, "id": existing_id},
            )
            candidate_id = existing_id
            action = "updated"
        else:
            conn.execute(
                """
                INSERT INTO candidates (name, age, city, education, experience_years, current_title,
                    expected_position, skills_json, resume_text, resume_hash, source_url, phone, wechat,
                    email, contact_json, companies_json, projects_json, styles_json, project_keywords_json,
                    style_keywords_json, company_keywords_json, ai_summary, embedding, created_at, updated_at)
                VALUES (:name, :age, :city, :education, :experience_years, :current_title,
                    :expected_position, :skills_json, :resume_text, :resume_hash, :source_url,
                    :phone, :wechat, :email, :contact_json, :companies_json, :projects_json,
                    :styles_json, :project_keywords_json, :style_keywords_json, :company_keywords_json,
                    :ai_summary, :embedding, :created_at, :updated_at)
                """,
                {**normalized, "created_at": now},
            )
            candidate_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
            action = "inserted"
        conn.commit()
        row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
        return {"status": "ok", "action": action, "candidate": row_to_dict(row), "candidate_id": candidate_id}
    finally:
        conn.close()


def find_job_duplicate(conn, payload: JobSaveRequest, jd_hash: str) -> int | None:
    if jd_hash:
        row = conn.execute("SELECT id FROM jobs WHERE jd_hash = ?", (jd_hash,)).fetchone()
        if row:
            return row["id"]
    job_title = payload.job_title or payload.title
    if job_title and payload.city and payload.salary:
        row = conn.execute(
            "SELECT id FROM jobs WHERE job_title = ? AND city = ? AND salary = ? ORDER BY updated_at DESC LIMIT 1",
            (job_title, payload.city, payload.salary),
        ).fetchone()
        if row:
            return row["id"]
    return None


def save_job(data: JobSaveRequest | dict[str, Any]) -> dict[str, Any]:
    init_recruitment_db()
    payload = data if isinstance(data, JobSaveRequest) else JobSaveRequest(**data)
    job_title = (payload.job_title or payload.title).strip()
    responsibilities = lines_text(payload.responsibilities)
    requirements = lines_text(payload.requirements)
    jd_text = payload.raw_text or payload.description or "\n".join([responsibilities, requirements])
    jd_hash = payload.jd_hash or stable_hash(jd_text)
    if not job_title:
        raise ValueError("岗位数据不完整")
    now = now_iso()
    conn = get_db_connection()
    try:
        normalized = {
            "job_title": job_title,
            "city": payload.city.strip(),
            "salary": payload.salary.strip(),
            "experience_required": payload.experience_required.strip(),
            "education_required": payload.education_required.strip(),
            "responsibilities": responsibilities,
            "requirements": requirements,
            "preferred_keywords_json": payload.preferred_keywords_json or json_text(payload.preferred_keywords),
            "jd_hash": jd_hash,
            "ai_summary": payload.ai_summary,
            "embedding": payload.embedding,
            "updated_at": now,
        }
        existing_id = find_job_duplicate(conn, payload, jd_hash)
        if existing_id:
            conn.execute(
                """
                UPDATE jobs SET job_title=:job_title, city=:city, salary=:salary,
                    experience_required=:experience_required, education_required=:education_required,
                    responsibilities=:responsibilities, requirements=:requirements,
                    preferred_keywords_json=:preferred_keywords_json, jd_hash=:jd_hash,
                    ai_summary=:ai_summary, embedding=:embedding, updated_at=:updated_at
                WHERE id=:id
                """,
                {**normalized, "id": existing_id},
            )
            job_id = existing_id
            action = "updated"
        else:
            conn.execute(
                """
                INSERT INTO jobs (job_title, city, salary, experience_required, education_required,
                    responsibilities, requirements, preferred_keywords_json, jd_hash, ai_summary,
                    embedding, created_at, updated_at)
                VALUES (:job_title, :city, :salary, :experience_required, :education_required,
                    :responsibilities, :requirements, :preferred_keywords_json, :jd_hash,
                    :ai_summary, :embedding, :created_at, :updated_at)
                """,
                {**normalized, "created_at": now},
            )
            job_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
            action = "inserted"
        conn.commit()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return {"status": "ok", "action": action, "job": row_to_dict(row), "job_id": job_id}
    finally:
        conn.close()


def save_match(data: MatchSaveRequest | dict[str, Any]) -> dict[str, Any]:
    init_recruitment_db()
    payload = data if isinstance(data, MatchSaveRequest) else MatchSaveRequest(**data)
    candidate_id = payload.candidate_id
    job_id = payload.job_id
    if not candidate_id and payload.candidate:
        candidate_id = save_candidate(payload.candidate)["candidate_id"]
    if not job_id and payload.job:
        job_id = save_job(payload.job)["job_id"]
    if not candidate_id or not job_id:
        raise ValueError("匹配记录数据不完整")
    match_reason = payload.match_reason or payload.reasoning or "；".join(payload.reasons) or "；".join(payload.matched)
    risk_notes = payload.risk_notes or "；".join(payload.risk_points) or "；".join(payload.risks)
    match_score = payload.match_score if payload.match_score is not None else payload.score
    match_level = payload.match_level or payload.level
    recommendation = payload.recommendation or payload.recommended_action
    now = now_iso()
    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT INTO matches (candidate_id, job_id, match_score, match_level, match_reason,
                risk_notes, recommended_action, ai_analysis, score, level, recommendation,
                matched_json, missing_json, risks_json, reasoning_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_id, job_id, match_score, match_level, match_reason, risk_notes,
                recommendation, payload.ai_analysis, match_score, match_level, recommendation,
                json_text(payload.matched), json_text(payload.missing), json_text(payload.risks),
                payload.reasoning or match_reason, now,
            ),
        )
        match_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()
        row = conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
        return {"status": "ok", "match": row_to_dict(row), "match_id": match_id}
    finally:
        conn.close()


def list_candidates() -> list[dict[str, Any]]:
    init_recruitment_db()
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM candidates ORDER BY updated_at DESC LIMIT 200").fetchall()
        return [row_to_dict(row) for row in rows]
    finally:
        conn.close()


def search_candidates(q: str) -> list[dict[str, Any]]:
    init_recruitment_db()
    query = q.strip()
    like = f"%{query}%"
    conn = get_db_connection()
    try:
        if query in {"微信", "微信号", "wechat", "wx"}:
            rows = conn.execute("SELECT * FROM candidates WHERE COALESCE(wechat, '') != '' ORDER BY updated_at DESC LIMIT 100").fetchall()
            return [row_to_dict(row) for row in rows]
        rows = conn.execute(
            """
            SELECT * FROM candidates
            WHERE name LIKE ? OR phone LIKE ? OR wechat LIKE ? OR email LIKE ?
               OR current_title LIKE ? OR expected_position LIKE ? OR education LIKE ?
               OR skills_json LIKE ? OR companies_json LIKE ? OR projects_json LIKE ?
               OR styles_json LIKE ? OR project_keywords_json LIKE ? OR style_keywords_json LIKE ?
               OR company_keywords_json LIKE ? OR resume_text LIKE ?
            ORDER BY updated_at DESC LIMIT 100
            """,
            (like, like, like, like, like, like, like, like, like, like, like, like, like, like, like),
        ).fetchall()
        return [row_to_dict(row) for row in rows]
    finally:
        conn.close()


def list_jobs() -> list[dict[str, Any]]:
    init_recruitment_db()
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 200").fetchall()
        return [row_to_dict(row) for row in rows]
    finally:
        conn.close()


def list_matches() -> list[dict[str, Any]]:
    init_recruitment_db()
    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT m.*, c.name AS candidate_name, j.job_title
            FROM matches m
            LEFT JOIN candidates c ON c.id = m.candidate_id
            LEFT JOIN jobs j ON j.id = m.job_id
            ORDER BY m.created_at DESC LIMIT 200
            """
        ).fetchall()
        return [row_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_candidate(candidate_id: int) -> dict[str, Any] | None:
    init_recruitment_db()
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def get_job(job_id: int) -> dict[str, Any] | None:
    init_recruitment_db()
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def save_rule_match(candidate_id: int, job_id: int, analysis: dict[str, Any]) -> dict[str, Any]:
    init_recruitment_db()
    now = now_iso()
    score = analysis.get("score")
    level = analysis.get("level", "")
    recommendation = analysis.get("recommendation", "")
    matched = analysis.get("matched") or []
    missing = analysis.get("missing") or []
    risks = analysis.get("risks") or []
    reasoning = analysis.get("reasoning", "")
    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT INTO matches (candidate_id, job_id, match_score, match_level, match_reason,
                risk_notes, recommended_action, ai_analysis, score, level, recommendation,
                matched_json, missing_json, risks_json, reasoning_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_id, job_id, score, level, reasoning, "；".join(risks), recommendation,
                "rules_v1", score, level, recommendation, json_text(matched), json_text(missing),
                json_text(risks), reasoning, now,
            ),
        )
        match_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()
        row = conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
        return {"status": "ok", "match": row_to_dict(row), "match_id": match_id}
    finally:
        conn.close()
