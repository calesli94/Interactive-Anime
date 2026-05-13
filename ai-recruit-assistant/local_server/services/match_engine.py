def analyze_match(candidate, job):
    score = 0
    matched = []
    missing = []
    risks = []

    candidate_text = str(candidate or "").lower()
    job_text = str(job or "").lower()

    keywords = [
        "unity", "ue", "shader", "ta", "python",
        "技术美术", "动画", "角色", "特效",
        "招聘", "猎头", "mapping"
    ]

    for keyword in keywords:
        if keyword.lower() in candidate_text and keyword.lower() in job_text:
            matched.append(keyword)
            score += 10

    score = min(score, 100)

    if score >= 90:
        level = "S"
        recommendation = "立即沟通"
    elif score >= 75:
        level = "A"
        recommendation = "重点沟通"
    elif score >= 60:
        level = "B"
        recommendation = "可沟通"
    elif score >= 40:
        level = "C"
        recommendation = "观察"
    else:
        level = "D"
        recommendation = "不推荐"

    return {
        "score": score,
        "level": level,
        "recommendation": recommendation,
        "matched": matched,
        "missing": missing,
        "risks": risks,
        "reasoning": "rule_match_engine_v1"
    }
