from typing import Any

from pydantic import BaseModel, Field


class CandidateSaveRequest(BaseModel):
    name: str = ""
    age: int | None = None
    city: str = ""
    education: str = ""
    experience_years: float | int | None = None
    current_title: str = ""
    expected_position: str = ""
    skills: list[str] = Field(default_factory=list)
    skills_json: str | None = None
    resume_text: str = ""
    raw_text: str = ""
    resume_hash: str = ""
    source_url: str = ""
    ai_summary: str = ""
    embedding: str = ""


class JobSaveRequest(BaseModel):
    job_title: str = ""
    title: str = ""
    city: str = ""
    salary: str = ""
    experience_required: str = ""
    education_required: str = ""
    responsibilities: list[str] | str = Field(default_factory=list)
    requirements: list[str] | str = Field(default_factory=list)
    preferred_keywords: list[str] = Field(default_factory=list)
    preferred_keywords_json: str | None = None
    jd_hash: str = ""
    description: str = ""
    raw_text: str = ""
    ai_summary: str = ""
    embedding: str = ""


class MatchSaveRequest(BaseModel):
    candidate_id: int | None = None
    job_id: int | None = None
    candidate: CandidateSaveRequest | dict[str, Any] | None = None
    job: JobSaveRequest | dict[str, Any] | None = None
    match_score: float | int | None = None
    score: float | int | None = None
    match_level: str = ""
    level: str = ""
    match_reason: str = ""
    reasons: list[str] = Field(default_factory=list)
    risk_notes: str = ""
    risk_points: list[str] = Field(default_factory=list)
    recommended_action: str = ""
    ai_analysis: str = ""


class ChatLogSaveRequest(BaseModel):
    candidate_id: int | None = None
    job_id: int | None = None
    message_role: str = ""
    message_text: str = ""
