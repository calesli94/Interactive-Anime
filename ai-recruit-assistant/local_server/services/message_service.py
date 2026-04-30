from __future__ import annotations

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


def generate_messages(payload: MessageGenerateRequest) -> MessageGenerateResponse:
    candidate_name = payload.candidate.get("name", "候选人")
    job_name = payload.job.get("title", "该岗位")
    priority = payload.priority

    project_driven = (
        f"你好 {candidate_name}，看到你在相关项目上的经历非常契合我们 {job_name} 的核心需求，"
        "想和你聊聊你最近一个最有代表性的项目成果。"
    )
    low_pressure = (
        f"你好 {candidate_name}，这里有一个 {job_name} 机会与你背景较匹配，"
        "不着急回复，有兴趣我们再约个轻松时间简单交流。"
    )
    curiosity_driven = (
        f"你好 {candidate_name}，我们在招 {job_name}，很好奇你会如何优化类似业务场景，"
        "方便分享一下你的思路吗？"
    )

    if priority == "高":
        project_driven += "（优先推荐候选人）"

    return MessageGenerateResponse(
        project_driven=project_driven,
        low_pressure=low_pressure,
        curiosity_driven=curiosity_driven,
    )
