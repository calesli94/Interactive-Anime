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


RAW_CHAT_LEAK_PATTERNS = ["目前也没计划", "我们是承接的项目", "沟通职位", "沟通的职位", "送达", "已读"]


def sanitize_text_for_message(text: str) -> str:
    cleaned = str(text or "")
    cleaned = re.sub(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", " ", cleaned)
    cleaned = re.sub(r"\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\b", " ", cleaned)
    cleaned = re.sub(r"https?://\S+|www\.\S+", " ", cleaned, flags=re.I)
    for phrase in RAW_CHAT_LEAK_PATTERNS + ["您好，我是", "你熟悉哪个引擎"]:
        cleaned = cleaned.replace(phrase, " ")
    return re.sub(r"\s+", " ", cleaned).strip()[:40]


def contains_raw_chat_leak(message: str) -> bool:
    text = str(message or "")
    return any(pattern in text for pattern in RAW_CHAT_LEAK_PATTERNS) or bool(
        re.search(r"\b\d{2}-\d{2}\s+\d{1,2}:\d{2}\b", text) or re.search(r"\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}", text)
    )


def final_message_guard(message: str, candidate_name: str, job_name: str) -> str:
    if contains_raw_chat_leak(message):
        return f"你好 {candidate_name}，理解你目前还在观望机会。关于 {job_name}，我先不强推，后续有更匹配的方向再联系你。"
    return message


def generate_messages(payload: MessageGenerateRequest) -> MessageGenerateResponse:
    candidate_name = sanitize_text_for_message(payload.candidate.get("name", "候选人")) or "候选人"
    job_name = sanitize_text_for_message(payload.job.get("title", "该岗位")) or "该岗位"
    priority = payload.priority

    project_driven = final_message_guard(
        f"你好 {candidate_name}，看到你的经历和 {job_name} 有一定相关性，想先确认下你近期是否考虑这个方向的机会。",
        candidate_name,
        job_name,
    )
    low_pressure = final_message_guard(
        f"你好 {candidate_name}，这里有一个 {job_name} 机会可以低压力了解，如果你觉得方向不合适也没关系。",
        candidate_name,
        job_name,
    )
    curiosity_driven = final_message_guard(
        f"你好 {candidate_name}，我们在看 {job_name} 方向，想了解下你更关注哪类项目或团队方向。",
        candidate_name,
        job_name,
    )

    if priority == "高":
        project_driven += "（优先推荐候选人）"

    return MessageGenerateResponse(
        project_driven=project_driven,
        low_pressure=low_pressure,
        curiosity_driven=curiosity_driven,
    )
