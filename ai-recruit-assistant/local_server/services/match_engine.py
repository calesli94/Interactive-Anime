def analyze_match(candidate, job):
    """
    Basic rule-based match engine V1
    """
    score = 0
    matched = []
    missing = []
    risks = []

    candidate_text = str(candidate).lower()
    job_text = str(job).lower()

    keywords = [
        "unity",
        "ue",
        "shader",
        "ta",
        "技术美术",
        "动画",
        "角色",
        "特效",
        "招聘",
        "猎头"
    ]

    for keyword in keywords:
        if keyword in candidate_text and keyword in job_text:
            matched.append(keyword)
            score += 10

    if score >= 70:
        level = "A"
    elif score >= 50:
        level = "B"
    else:
        level = "C"

    return {
        "score": min(score, 100),
        "level": level,
        "matched": matched,
        "missing": missing,
        "risks": risks,
        "recommendation": "rule_based_match_v1"
    }
