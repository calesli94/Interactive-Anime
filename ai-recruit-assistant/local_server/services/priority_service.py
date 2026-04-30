from __future__ import annotations

from typing import Literal

try:
    from pydantic import BaseModel, Field

    PYDANTIC_AVAILABLE = True
except Exception:  # fallback for restricted test environments
    from dataclasses import dataclass, field

    PYDANTIC_AVAILABLE = False

    def Field(*, default=None, default_factory=None, ge=None, le=None):  # type: ignore
        if default_factory is not None:
            return field(default_factory=default_factory)
        return default

    class BaseModel:  # minimal fallback behavior
        pass


if PYDANTIC_AVAILABLE:

    class CandidateInfo(BaseModel):
        name: str
        skills: list[str] = Field(default_factory=list)
        years_experience: float = 0
        projects_count: int = 0
        activity_score: int = Field(default=0, ge=0, le=100)
        communication_status: Literal["active", "neutral", "delayed", "no_response"] = "neutral"


    class JobConfig(BaseModel):
        required_skills: list[str] = Field(default_factory=list)
        min_years_experience: float = 0
        preferred_projects_count: int = 0
        urgency: Literal["low", "medium", "high"] = "medium"


    class AnalyzeRequest(BaseModel):
        candidate: CandidateInfo
        job: JobConfig


    class AnalyzeResult(BaseModel):
        name: str
        score: int
        level: Literal["S", "A", "B", "C", "D"]
        priority: Literal["高", "中", "低"]
        recommended_mode: Literal["手动", "辅助", "自动"]
        suggested_message_strategy: str
        reasons: list[str]

else:

    @dataclass
    class CandidateInfo:
        name: str
        skills: list[str] = field(default_factory=list)
        years_experience: float = 0
        projects_count: int = 0
        activity_score: int = 0
        communication_status: str = "neutral"

    @dataclass
    class JobConfig:
        required_skills: list[str] = field(default_factory=list)
        min_years_experience: float = 0
        preferred_projects_count: int = 0
        urgency: str = "medium"

    @dataclass
    class AnalyzeRequest:
        candidate: CandidateInfo
        job: JobConfig

        def __init__(self, candidate, job):
            self.candidate = candidate if isinstance(candidate, CandidateInfo) else CandidateInfo(**candidate)
            self.job = job if isinstance(job, JobConfig) else JobConfig(**job)

    @dataclass
    class AnalyzeResult:
        name: str
        score: int
        level: str
        priority: str
        recommended_mode: str
        suggested_message_strategy: str
        reasons: list[str]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def analyze_priority(req: AnalyzeRequest) -> AnalyzeResult:
    c = req.candidate
    j = req.job

    required_skills = set(s.lower() for s in j.required_skills)
    candidate_skills = set(s.lower() for s in c.skills)
    matched = len(required_skills & candidate_skills)
    skill_ratio = (matched / len(required_skills)) if required_skills else 1
    skill_score = round(_clamp(skill_ratio, 0, 1) * 35)

    project_ratio = (c.projects_count / j.preferred_projects_count) if j.preferred_projects_count > 0 else 1
    project_score = round(_clamp(project_ratio, 0, 1) * 25)

    exp_ratio = (c.years_experience / j.min_years_experience) if j.min_years_experience > 0 else 1
    experience_score = round(_clamp(exp_ratio, 0, 1) * 15)

    activity_score = round(_clamp(c.activity_score / 100, 0, 1) * 10)

    comm_map = {"active": 10, "neutral": 7, "delayed": 4, "no_response": 1}
    communication_score = comm_map.get(c.communication_status, 1)

    total_score = skill_score + project_score + experience_score + activity_score + communication_score

    if total_score >= 90:
        level, priority, mode, strategy = "S", "高", "自动", "项目驱动"
    elif total_score >= 75:
        level, priority, mode, strategy = "A", "高", "辅助", "项目驱动"
    elif total_score >= 60:
        level, priority, mode, strategy = "B", "中", "辅助", "平衡沟通型"
    elif total_score >= 45:
        level, priority, mode, strategy = "C", "中", "手动", "低压力型"
    else:
        level, priority, mode, strategy = "D", "低", "手动", "低压力型"

    reasons = [
        f"技能匹配 {matched}/{len(required_skills) if required_skills else 0}，得分 {skill_score}/35",
        f"项目经验得分 {project_score}/25",
        f"经验年限得分 {experience_score}/15",
        f"活跃度得分 {activity_score}/10",
        f"沟通状态 {c.communication_status}，得分 {communication_score}/10",
    ]

    if j.urgency == "high" and priority != "高":
        reasons.append("岗位紧急度高，建议尽快人工跟进")

    return AnalyzeResult(
        name=c.name,
        score=total_score,
        level=level,
        priority=priority,
        recommended_mode=mode,
        suggested_message_strategy=strategy,
        reasons=reasons,
    )
