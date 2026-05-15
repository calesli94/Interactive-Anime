"""AI 招聘助手本地 FastAPI 服务。

第一阶段只做最小可运行 MVP：
- /health：检查本地服务是否启动；
- /api/candidates：保存候选人到 SQLite；
- /api/analyze：用简单规则模拟 AI 匹配分析和个性化打招呼话术。

运行方式：uvicorn main:app --reload --host 127.0.0.1 --port 8787
"""

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import get_connection, init_db

app = FastAPI(title="AI Recruit Assistant Local Server", version="0.1.0")

# 浏览器插件会从 chrome-extension:// 或 edge-extension:// 调用本地服务。
# MVP 阶段允许本机开发跨域访问，后续可收紧 allow_origins。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CandidateIn(BaseModel):
    """插件提交的候选人基础信息。"""

    name: str = Field(default="未知候选人", description="候选人姓名，抓不到时使用默认值")
    title: str = Field(default="", description="候选人当前职位或期望职位")
    raw_text: str = Field(..., description="从页面抓取的候选人原始文本")
    source_url: str = Field(default="", description="候选人页面 URL")


class AnalyzeIn(BaseModel):
    """模拟 AI 分析入参。"""

    candidate: CandidateIn
    job_requirement: str = Field(
        default="Python FastAPI SQLite 招聘工具",
        description="招聘方岗位要求，MVP 先允许前端传一段文本",
    )


class AnalyzeOut(BaseModel):
    """模拟 AI 分析结果。"""

    score: int
    level: str
    matched_keywords: list[str]
    summary: str
    greeting: str
    next_action: str


@app.on_event("startup")
def startup() -> None:
    """服务启动时自动创建 SQLite 表。"""
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    """健康检查接口，插件用它判断本地服务是否已启动。"""
    return {"status": "ok", "service": "ai-recruit-assistant"}


@app.post("/api/candidates")
def create_candidate(candidate: CandidateIn) -> dict[str, Any]:
    """保存候选人到本地 SQLite 人才库。"""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO candidates (name, title, raw_text, source_url)
            VALUES (?, ?, ?, ?)
            """,
            (candidate.name, candidate.title, candidate.raw_text, candidate.source_url),
        )
        conn.commit()
        candidate_id = cursor.lastrowid

    return {"ok": True, "candidate_id": candidate_id, "message": "候选人已保存到本地人才库"}


@app.get("/api/candidates")
def list_candidates() -> dict[str, Any]:
    """查看最近保存的候选人，方便开发者验证 SQLite 写入结果。"""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, title, source_url, analysis_score, analysis_summary, greeting, created_at
            FROM candidates
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()

    return {"items": [dict(row) for row in rows]}


def mock_analyze(candidate: CandidateIn, job_requirement: str) -> AnalyzeOut:
    """用规则模拟 AI 匹配分析。

    真实大模型接入前，先用关键词命中数量计算分数，保证端到端流程可跑通。
    """
    text = f"{candidate.name} {candidate.title} {candidate.raw_text}".lower()
    keyword_map = {
        "python": ["python"],
        "fastapi": ["fastapi"],
        "sqlite": ["sqlite", "sql"],
        "ai": ["ai", "人工智能", "大模型", "llm"],
        "招聘": ["招聘", "hr", "人才", "候选人"],
        "沟通": ["沟通", "销售", "客户", "运营"],
    }

    matched_keywords = [
        label
        for label, variants in keyword_map.items()
        if any(variant in text for variant in variants)
    ]
    score = min(95, 45 + len(matched_keywords) * 10)
    level = "高匹配" if score >= 75 else "中匹配" if score >= 60 else "待观察"

    display_name = candidate.name or "同学"
    summary = (
        f"候选人与岗位要求《{job_requirement[:30]}》的模拟匹配度为 {score} 分，"
        f"主要命中：{', '.join(matched_keywords) if matched_keywords else '暂无明显关键词'}。"
    )
    greeting = (
        f"您好 {display_name}，我看到您的经历里有"
        f"{('、'.join(matched_keywords[:3]) if matched_keywords else '相关项目')}经验，"
        "和我们正在招聘的岗位方向比较契合，想和您简单沟通一下机会，方便吗？"
    )
    next_action = "建议优先打招呼并记录后续反馈" if score >= 75 else "建议人工复核后再沟通"

    return AnalyzeOut(
        score=score,
        level=level,
        matched_keywords=matched_keywords,
        summary=summary,
        greeting=greeting,
        next_action=next_action,
    )


@app.post("/api/analyze", response_model=AnalyzeOut)
def analyze(payload: AnalyzeIn) -> AnalyzeOut:
    """模拟 AI 匹配分析，并把分析结果回写到最近一条同源候选人记录。"""
    result = mock_analyze(payload.candidate, payload.job_requirement)

    # 如果候选人已保存过，则把分析摘要写回最近一条同 URL 的记录，便于沉淀人才库。
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE candidates
            SET analysis_score = ?, analysis_summary = ?, greeting = ?
            WHERE id = (
                SELECT id FROM candidates
                WHERE source_url = ?
                ORDER BY id DESC
                LIMIT 1
            )
            """,
            (result.score, result.summary, result.greeting, payload.candidate.source_url),
        )
        conn.commit()

    return result
