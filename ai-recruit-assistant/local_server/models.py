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
    phone: str = ""
    wechat: str = ""
    email: str = ""
    contact: dict[str, Any] | list[Any] | str | None = None
    companies: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    styles: list[str] = Field(default_factory=list)
    project_keywords: list[str] = Field(default_factory=list)
    style_keywords: list[str] = Field(default_factory=list)
    company_keywords: list[str] = Field(default_factory=list)
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


class MatchAnalyzeRequest(BaseModel):
    candidate_id: int
    job_id: int


class MatchQuickRequest(BaseModel):
    candidate: dict[str, Any] = Field(default_factory=dict)
    job: dict[str, Any] = Field(default_factory=dict)


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
    recommendation: str = ""
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    reasoning: str = ""
    ai_analysis: str = ""


class ChatLogSaveRequest(BaseModel):
    candidate_id: int | None = None
    job_id: int | None = None
    message_role: str = ""
    message_text: str = ""
