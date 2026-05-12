from __future__ import annotations

import json
import re
from typing import Any

SKILL_KEYWORDS = ["Unity", "UE", "TA", "Shader", "Python", "Maya", "Houdini", "AIGC", "ComfyUI", "Blender"]
PROJECT_KEYWORDS = ["SLG", "MMO", "FPS", "开放世界", "二次元", "3A", "UE项目"]
STYLE_KEYWORDS = ["欧美", "日韩", "写实", "卡通", "国风", "二次元"]
COMPANY_KEYWORDS = ["网易", "腾讯", "米哈游", "FunPlus", "莉莉丝", "鹰角", "叠纸", "完美世界"]
ADVANCED_KEYWORDS = ["主程", "渲染", "Shader", "Pipeline", "技术美术", "AIGC", "地编", "灯光", "动画TA", "资深招聘", "猎头", "mapping"]
GAME_INDUSTRY_KEYWORDS = ["游戏", "手游", "端游", "主机", "项目", *PROJECT_KEYWORDS, *COMPANY_KEYWORDS]

RECOMMENDATIONS = {"S": "立即沟通", "A": "重点沟通", "B": "可沟通", "C": "观察", "D": "不推荐"}
EDUCATION_ORDER = {"高中": 1, "中专": 1, "大专": 2, "专科": 2, "本科": 3, "学士": 3, "硕士": 4, "研究生": 4, "博士": 5}


def _json_loads(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _flatten(value: Any) -> list[str]:
    value = _json_loads(value)
    if value is None:
        return []
    if isinstance(value, dict):
        parts: list[str] = []
        for item in value.values():
            parts.extend(_flatten(item))
        return parts
    if isinstance(value, (list, tuple, set)):
        parts = []
        for item in value:
            parts.extend(_flatten(item))
        return parts
    text = str(value).strip()
    return [text] if text else []


def _text_from(data: dict[str, Any], keys: list[str]) -> str:
    parts: list[str] = []
    for key in keys:
        parts.extend(_flatten(data.get(key)))
    return "\n".join(parts)


def _contains(text: str, keyword: str) -> bool:
    lower = str(text or "").lower()
    kw = str(keyword or "").lower()
    if not kw:
        return False
    if kw == "ta":
        return bool(re.search(r"(?<![a-z])ta(?![a-z])", lower)) or "技术美术" in lower
    if kw == "ue":
        return bool(re.search(r"(?<![a-z])ue(?![a-z])", lower)) or "unreal" in lower or "虚幻" in lower
    if kw == "mapping":
        return "mapping" in lower or "人才地图" in lower
    return kw in lower


def _hits(text: str, keywords: list[str]) -> list[str]:
    return [word for word in keywords if _contains(text, word)]


def _intersection(candidate_text: str, job_text: str, keywords: list[str]) -> tuple[list[str], list[str], list[str]]:
    job_hits = _hits(job_text, keywords)
    candidate_hits = _hits(candidate_text, keywords)
    if job_hits:
        matched = [word for word in job_hits if word in candidate_hits]
        missing = [word for word in job_hits if word not in candidate_hits]
    else:
        matched = candidate_hits
        missing = []
    return matched, missing, job_hits


def _skill_score(hit_count: int) -> int:
    if hit_count >= 4:
        return 35
    if hit_count >= 2:
        return 20
    if hit_count == 1:
        return 10
    return 0


def _parse_years(value: Any, fallback_text: str = "") -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = f"{value or ''}\n{fallback_text or ''}"
    patterns = [r"(\d+(?:\.\d+)?)\s*年", r"(\d+(?:\.\d+)?)\s*\+\s*年", r"(\d+(?:\.\d+)?)\s*年以上"]
    for pattern in patterns:
        found = re.findall(pattern, text)
        if found:
            return max(float(item) for item in found)
    cn_numbers = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    for cn, number in cn_numbers.items():
        if f"{cn}年" in text or f"{cn}年以上" in text:
            return float(number)
    return None


def _education_level(text: str) -> int | None:
    for keyword, level in sorted(EDUCATION_ORDER.items(), key=lambda item: item[1], reverse=True):
        if keyword in str(text or ""):
            return level
    return None


def _level_from_score(score: int) -> str:
    if score >= 90:
        return "S"
    if score >= 75:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    return "D"


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def analyze_match(candidate: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    """Analyze candidate-job fit with deterministic local rules only."""
    candidate = candidate or {}
    job = job or {}
    candidate_text = _text_from(
        candidate,
        [
            "name", "city", "education", "experience_years", "current_title", "expected_position",
            "skills", "skills_json", "resume_text", "raw_text", "companies", "companies_json",
            "projects", "projects_json", "styles", "styles_json", "project_keywords",
            "project_keywords_json", "style_keywords", "style_keywords_json", "company_keywords",
            "company_keywords_json", "ai_summary",
        ],
    )
    job_text = _text_from(
        job,
        [
            "job_title", "title", "city", "experience_required", "education_required", "responsibilities",
            "requirements", "preferred_keywords", "preferred_keywords_json", "description", "raw_text", "ai_summary",
        ],
    )

    score = 0
    matched: list[str] = []
    missing: list[str] = []
    risks: list[str] = []
    reasoning: list[str] = []

    skill_matches, skill_missing, job_skill_hits = _intersection(candidate_text, job_text, SKILL_KEYWORDS)
    skill_points = _skill_score(len(skill_matches))
    score += skill_points
    if skill_matches:
        matched.extend([f"核心技能：{word}" for word in skill_matches])
        reasoning.append(f"核心技能命中 {len(skill_matches)} 个，+{skill_points}")
    if skill_missing:
        missing.extend([f"核心技能：{word}" for word in skill_missing])
    if job_skill_hits and not skill_matches:
        risks.append("缺少核心技能")
        reasoning.append("岗位包含核心技能要求，但候选人未命中")

    project_matches, project_missing, job_project_hits = _intersection(candidate_text, job_text, PROJECT_KEYWORDS)
    if project_matches:
        score += 10
        matched.extend([f"项目经验：{word}" for word in project_matches])
        reasoning.append("项目关键词匹配，+10")
    if project_missing:
        missing.extend([f"项目经验：{word}" for word in project_missing])
    if job_project_hits and not project_matches:
        risks.append("缺少项目经验")

    style_matches, style_missing, _ = _intersection(candidate_text, job_text, STYLE_KEYWORDS)
    if style_matches:
        score += 10
        matched.extend([f"风格：{word}" for word in style_matches])
        reasoning.append("风格关键词匹配，+10")
    if style_missing:
        missing.extend([f"风格：{word}" for word in style_missing])

    candidate_years = _parse_years(candidate.get("experience_years"), candidate_text)
    required_years = _parse_years(job.get("experience_required"), job_text)
    if required_years is not None:
        if candidate_years is not None and candidate_years >= required_years:
            score += 15
            matched.append(f"工作年限：{candidate_years:g}年 >= {required_years:g}年")
            reasoning.append("工作年限满足要求，+15")
        else:
            score -= 10
            missing.append(f"工作年限：要求{required_years:g}年，候选人{candidate_years:g}年" if candidate_years is not None else f"工作年限：要求{required_years:g}年，候选人未知")
            risks.append("工作年限不足")
            reasoning.append("工作年限不足或未知，-10")
    elif candidate_years is not None:
        matched.append(f"工作年限：{candidate_years:g}年")

    required_edu = _education_level(str(job.get("education_required") or job_text))
    candidate_edu = _education_level(str(candidate.get("education") or candidate_text))
    if required_edu and "本科" in str(job.get("education_required") or job_text):
        if candidate_edu and candidate_edu >= EDUCATION_ORDER["本科"]:
            score += 5
            matched.append("学历：本科及以上")
            reasoning.append("学历满足本科及以上，+5")
        elif candidate_edu == EDUCATION_ORDER["大专"]:
            missing.append("学历：大专（无扣分）")
            reasoning.append("学历为大专，按规则不扣分")
        else:
            missing.append("学历：未确认本科及以上")

    candidate_city = str(candidate.get("city") or candidate.get("expected_city") or "").strip()
    job_city = str(job.get("city") or "").strip()
    if candidate_city and job_city and candidate_city == job_city:
        score += 10
        matched.append(f"城市：{candidate_city}")
        reasoning.append("城市一致，+10")

    company_hits = _hits(candidate_text, COMPANY_KEYWORDS)
    if company_hits:
        score += 15
        matched.extend([f"头部公司：{word}" for word in company_hits])
        reasoning.append("头部游戏公司背景匹配，+15")

    advanced_hits = _hits(candidate_text + "\n" + job_text, ADVANCED_KEYWORDS)
    if advanced_hits:
        advanced_points = min(15, len(advanced_hits) * 3)
        score += advanced_points
        matched.extend([f"高级关键词：{word}" for word in advanced_hits])
        reasoning.append(f"高级关键词命中 {len(advanced_hits)} 个，+{advanced_points}")

    incomplete_fields = [
        not candidate.get("name"),
        not (candidate.get("resume_text") or candidate.get("raw_text")),
        candidate_years is None,
        not (candidate.get("skills") or candidate.get("skills_json")),
    ]
    if sum(1 for flag in incomplete_fields if flag) >= 2:
        risks.append("简历信息不完整")

    if not _hits(candidate_text, GAME_INDUSTRY_KEYWORDS):
        risks.append("没有行业经验")

    score = max(0, min(100, int(round(score))))
    level = _level_from_score(score)
    recommendation = RECOMMENDATIONS[level]

    if not reasoning:
        reasoning.append("未发现明确匹配信号，按规则得分较低")

    return {
        "score": score,
        "level": level,
        "recommendation": recommendation,
        "matched": _dedupe(matched),
        "missing": _dedupe(missing),
        "risks": _dedupe(risks),
        "reasoning": "；".join(_dedupe(reasoning)),
    }
