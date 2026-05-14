// content.js 运行在 BOSS 推荐牛人页面中，负责从“候选人白色卡片”里提取信息。
// 注意：不要直接使用 document.body.innerText 作为候选人主体信息，否则会把左侧导航、顶部菜单、筛选区等噪音混进来。

const CANDIDATE_NODE_SELECTOR = "div, li, section, article";
const EDUCATION_KEYWORDS = ["博士", "硕士", "本科", "大专", "高中", "中专"];
const RECENT_STATUS_KEYWORDS = ["在线", "刚刚活跃", "今日活跃", "本周活跃", "活跃"];
const FORBIDDEN_NAME_WORDS = ["职位管理", "推荐牛人", "招聘", "筛选", "更多选项", "深度搜索", "项目外包"];
const EXCLUDED_AREA_WORDS = ["职位管理", "深度搜索", "沟通", "道具", "项目外包", "直播招聘", "招聘规范"];
const SALARY_RE = /\d{1,2}-\d{1,2}K/i;
const AGE_RE = /\d{2}岁/;

function cleanText(text) {
  return (text || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function textLines(text) {
  return cleanText(text).split(/\n+/).map(cleanText).filter(Boolean);
}

function countMatches(text, re) {
  return (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) || []).length;
}

function simpleHash(text) {
  // 非加密 hash，只用于页面内去重。
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function isVisibleElement(node) {
  const style = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 80 && rect.height > 40;
}

function isPluginArea(node) {
  // 正常 popup 不会出现在页面 DOM 中；这里保留判断，避免未来插入调试浮层时误抓。
  return Boolean(node.closest("#ai-recruit-assistant, .ai-recruit-assistant, .ai-recruit-assistant-popup"));
}

function hasExcludedAreaText(text) {
  return EXCLUDED_AREA_WORDS.some((word) => text.includes(word));
}

function hasCandidateSignals(text) {
  // 至少同时具备：打招呼、薪资、学历、年龄，才认为是候选人卡片。
  return text.includes("打招呼")
    && SALARY_RE.test(text)
    && EDUCATION_KEYWORDS.some((word) => text.includes(word))
    && AGE_RE.test(text);
}

function containsMultipleCandidates(node, text) {
  const rect = node.getBoundingClientRect();
  const salaryCount = countMatches(text, SALARY_RE);
  const greetingCount = (text.match(/打招呼/g) || []).length;
  return rect.height > 350 && (salaryCount > 1 || greetingCount > 1);
}

function isSingleCandidateCard(node) {
  const text = cleanText(node.innerText);
  if (!text || text.length < 20) return false;
  if (!isVisibleElement(node) || isPluginArea(node)) return false;
  if (!hasCandidateSignals(text)) return false;
  if (hasExcludedAreaText(text)) return false;
  if (containsMultipleCandidates(node, text)) return false;
  return true;
}

function domPath(node) {
  const parts = [];
  let current = node;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) part += `#${current.id}`;
    if (current.classList.length) part += `.${Array.from(current.classList).slice(0, 3).join(".")}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function debugCard(node, index) {
  const rect = node.getBoundingClientRect();
  const text = cleanText(node.innerText);
  return {
    index,
    preview: text.slice(0, 300),
    dom_path: domPath(node),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function findCandidateCards() {
  const allNodes = Array.from(document.querySelectorAll(CANDIDATE_NODE_SELECTOR));
  const matched = allNodes.filter(isSingleCandidateCard);

  // 去掉“父节点包含子节点”的情况，只保留最小有效卡片。
  const minimal = matched.filter((node) => !matched.some((other) => other !== node && node.contains(other)));

  // 使用 innerText hash 去重，避免同一卡片因重复结构被记录多次。
  const seen = new Set();
  const unique = [];
  for (const node of minimal) {
    const text = cleanText(node.innerText);
    const hash = simpleHash(text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push(node);
  }

  console.log(`[AI Recruit] candidate cards found: ${unique.length}`);
  unique.forEach((node, index) => console.log("[AI Recruit] candidate card", debugCard(node, index + 1)));
  return unique;
}

function firstMatch(text, re) {
  const match = text.match(re);
  return match ? match[0] : "";
}

function parseEducation(text) {
  return EDUCATION_KEYWORDS.find((word) => text.includes(word)) || "";
}

function parseRecentStatus(text) {
  return RECENT_STATUS_KEYWORDS.find((word) => text.includes(word)) || "";
}

function isInvalidNameCandidate(value) {
  if (!value) return true;
  if (FORBIDDEN_NAME_WORDS.some((word) => value.includes(word))) return true;
  if (SALARY_RE.test(value) || AGE_RE.test(value)) return true;
  if (EDUCATION_KEYWORDS.some((word) => value === word)) return true;
  if (RECENT_STATUS_KEYWORDS.some((word) => value === word)) return true;
  return false;
}

function cleanupNameCandidate(value) {
  return cleanText(value)
    .replace(SALARY_RE, "")
    .replace(AGE_RE, "")
    .replace(/\d{1,2}年应届生|\d{1,2}年|应届生/g, "")
    .replace(new RegExp(EDUCATION_KEYWORDS.join("|"), "g"), "")
    .replace(new RegExp(RECENT_STATUS_KEYWORDS.join("|"), "g"), "")
    .replace(/[|·•,，/]+/g, " ")
    .trim();
}

function parseName(lines) {
  for (const line of lines.slice(0, 6)) {
    const beforeAgeOrSalary = line.split(AGE_RE)[0].split(SALARY_RE)[0];
    const cleaned = cleanupNameCandidate(beforeAgeOrSalary || line);
    if (isInvalidNameCandidate(cleaned)) continue;

    // 英文名：Dingyan Zhong；中文名：姚女士、雅婷、李凯迪、张先生。
    const englishName = cleaned.match(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}/);
    if (englishName && !isInvalidNameCandidate(englishName[0])) return englishName[0];

    const chineseName = cleaned.match(/[\u4e00-\u9fa5]{1,6}(?:女士|先生)?/);
    if (chineseName && !isInvalidNameCandidate(chineseName[0])) return chineseName[0];
  }
  return "未知候选人";
}

function parseExpectedCityAndPosition(lines) {
  for (const line of lines) {
    const match = line.match(/([\u4e00-\u9fa5]{2,10})\s*[·•]\s*([^\n]+)/);
    if (!match) continue;
    const position = cleanText(match[2].replace(SALARY_RE, ""));
    if (position && !FORBIDDEN_NAME_WORDS.some((word) => position.includes(word))) {
      return { expected_city: match[1], expected_position: position };
    }
  }
  return { expected_city: "", expected_position: "" };
}

function parseAdvantage(lines) {
  const index = lines.findIndex((line) => /优势|个人优势|亮点/.test(line));
  if (index >= 0) return lines.slice(index, index + 4).join("\n");
  return "";
}

function parseSectionRaw(lines, sectionWords) {
  const index = lines.findIndex((line) => sectionWords.some((word) => line.includes(word)));
  if (index < 0) return "";
  return lines.slice(index, index + 6).join("\n");
}

function parseExperience(text, recentStatus) {
  const experienceNearStatus = recentStatus
    ? text.slice(Math.max(0, text.indexOf(recentStatus) - 40), text.indexOf(recentStatus) + 40).match(/\d{1,2}年应届生|\d{1,2}年|应届生/)
    : null;
  if (experienceNearStatus) return experienceNearStatus[0];
  return firstMatch(text, /\d{1,2}年应届生|\d{1,2}年|应届生/);
}

function validateCandidateRaw(candidate) {
  const raw = candidate.raw_text;
  return {
    has_name: candidate.name !== "未知候选人" && raw.includes(candidate.name),
    has_salary: Boolean(candidate.expected_salary && raw.includes(candidate.expected_salary)),
    has_age: Boolean(candidate.age && raw.includes(candidate.age)),
    has_education: Boolean(candidate.education && raw.includes(candidate.education)),
    has_greeting_button: raw.includes("打招呼"),
    has_forbidden_navigation: ["职位管理", "深度搜索", "项目外包"].some((word) => raw.includes(word)),
  };
}

function parseCandidateCard(card) {
  const rawText = cleanText(card.innerText);
  const lines = textLines(rawText);
  const recentStatus = parseRecentStatus(rawText);
  const expected = parseExpectedCityAndPosition(lines);

  const candidate = {
    name: parseName(lines),
    age: firstMatch(rawText, AGE_RE),
    experience: parseExperience(rawText, recentStatus),
    education: parseEducation(rawText),
    expected_salary: firstMatch(rawText, SALARY_RE),
    expected_city: expected.expected_city,
    expected_position: expected.expected_position,
    recent_status: recentStatus,
    advantage: parseAdvantage(lines),
    work_experience_raw: parseSectionRaw(lines, ["工作经历", "工作经验"]),
    education_raw: parseSectionRaw(lines, ["教育经历", "教育背景"]),
    raw_text: rawText,
    source_url: window.location.href,
    page_title: document.title,
    dom_path: domPath(card),
  };
  candidate.validation = validateCandidateRaw(candidate);
  return candidate;
}

function extractCandidateFromPage() {
  const cards = findCandidateCards();
  const candidates = cards.map(parseCandidateCard);
  const debug_cards = cards.map(debugCard);

  return {
    ok: true,
    candidate_count: candidates.length,
    candidate: candidates[0] || null,
    candidates,
    debug_cards,
    page_title: document.title,
    source_url: window.location.href,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "EXTRACT_CANDIDATE") {
    sendResponse(extractCandidateFromPage());
    return true;
  }

  return false;
});
