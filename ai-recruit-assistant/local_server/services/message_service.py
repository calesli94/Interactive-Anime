from __future__ import annotations

import re

try:
    from pydantic import BaseModel, Field
    PYDANTIC_AVAILABLE = True
except Exception:
    from dataclasses import dataclass, field
    PYDANTIC_AVAILABLE = False

    class BaseModel:
        pass

    def Field(*, default=None, default_factory=None):
        if default_factory is not None:
            return field(default_factory=default_factory)
        return default


if PYDANTIC_AVAILABLE:

    class MessageGenerateRequest(BaseModel):
        candidate: dict = Field(default_factory=dict)
        priority: str = "中"
        job: dict = Field(default_factory=dict)


    class MessageGenerateResponse(BaseModel):
        project_driven: str
        low_pressure: str
        curiosity_driven: str

else:

    @dataclass
    class MessageGenerateRequest:
        candidate: dict = field(default_factory=dict)
        priority: str = "中"
        job: dict = field(default_factory=dict)

    @dataclass
    class MessageGenerateResponse:
        project_driven: str
        low_pressure: str
        curiosity_driven: str


def sanitize_text_for_message(text: str) -> str:
    cleaned = str(text or "")
    cleaned = re.sub(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", " ", cleaned)
    cleaned = re.sub(r"\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\b", " ", cleaned)
    cleaned = re.sub(r"https?://\S+|www\.\S+", " ", cleaned, flags=re.I)
    for phrase in ["沟通的职位", "沟通职位", "已读", "送达", "目前也没计划", "我们是承接的项目", "您好，我是", "你熟悉哪个引擎"]:
        cleaned = cleaned.replace(phrase, " ")
    return re.sub(r"\s+", " ", cleaned).strip()[:40]


def generate_messages(payload: MessageGenerateRequest) -> MessageGenerateResponse:
    candidate_name = sanitize_text_for_message(payload.candidate.get("name", "候选人")) or "候选人"
    job_name = sanitize_text_for_message(payload.job.get("title", "该岗位")) or "该岗位"
    priority = payload.priority

    project_driven = (
        f"你好 {candidate_name}，看到你的经历和 {job_name} 有一定相关性，"
        "想先确认下你近期是否考虑这个方向的机会。"
    )
    low_pressure = (
        f"你好 {candidate_name}，这里有一个 {job_name} 机会可以低压力了解，"
        "如果你觉得方向不合适也没关系。"
    )
    curiosity_driven = (
        f"你好 {candidate_name}，我们在看 {job_name} 方向，"
        "想了解下你更关注哪类项目或团队方向。"
    )

    if priority == "高":
        project_driven += "（优先推荐候选人）"

    return MessageGenerateResponse(
        project_driven=project_driven,
        low_pressure=low_pressure,
        curiosity_driven=curiosity_driven,
    )
