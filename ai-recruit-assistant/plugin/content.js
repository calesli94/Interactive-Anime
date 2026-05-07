console.log("[AI Recruit Assistant] content.js injected", location.href);

(() => {
  if (window.__AI_RECRUIT_ASSISTANT_CONTENT_READY__) return;
  window.__AI_RECRUIT_ASSISTANT_CONTENT_READY__ = true;

const NAV_WORDS = ["职位管理", "推荐牛人", "消息", "搜索", "招聘统计", "客服", "账号", "我的客服", "面试", "直播招聘", "扫码登录", "导航", "充值", "简历", "牛人"];
const BAD_NAMES = ["BOSS直聘", "招聘助手", "职位管理", "推荐牛人", "消息", "搜索", "客服", "面试", "当前候选人", "未识别"];
const JOB_SIGNALS = ["职位描述", "任职要求", "薪资", "工作地点", "岗位职责", "职位详情", "岗位要求"];
const CANDIDATE_SIGNALS = ["在线沟通", "查看简历", "交换微信", "求职状态", "工作经历", "项目经历"];

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function visibleText(root = document.body) {
  return cleanText(root?.innerText || root?.textContent || "");
}

function isVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 20 && rect.height > 10 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function isNavLike(text, el) {
  const cls = `${el?.className || ""} ${el?.id || ""}`.toLowerCase();
  const tag = (el?.tagName || "").toLowerCase();
  if (["nav", "header", "footer", "button"].includes(tag)) return true;
  if (/nav|menu|sidebar|footer|header|toolbar|search|account/.test(cls)) return true;
  const navHits = NAV_WORDS.filter((word) => text.includes(word)).length;
  return navHits >= 2 && text.length < 500;
}

function queryVisible(selectors, root = document) {
  const nodes = [];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      if (isVisible(node) && !nodes.includes(node)) nodes.push(node);
    });
  }
  return nodes;
}

function firstClean(selectors, root = document) {
  for (const node of queryVisible(selectors, root)) {
    const text = cleanText(node.innerText || node.textContent || node.getAttribute?.("title") || node.getAttribute?.("data-name"));
    if (text && !isNavLike(text, node)) return text;
  }
  return "";
}

function manyClean(selectors, root = document, limit = 20) {
  const values = [];
  for (const node of queryVisible(selectors, root)) {
    const text = cleanText(node.innerText || node.textContent || node.getAttribute?.("title"));
    if (text && !isNavLike(text, node) && !values.includes(text)) values.push(text);
  }
  return values.slice(0, limit);
}

function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return `ctx_${Math.abs(hash).toString(36)}`;
}

function keywordsFrom(text, keywords) {
  return [...new Set(keywords.filter((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)))];
}

function parseYears(text) {
  const range = text.match(/(\d+)\s*[-~—至]\s*(\d+)\s*年/);
  if (range) return Number.parseInt(range[2], 10) || 0;
  const exact = text.match(/(\d+)\s*年/);
  if (exact) return Number.parseInt(exact[1], 10) || 0;
  return 0;
}

function parseName(text) {
  const cleaned = cleanText(text);
  const explicit = cleaned.match(/(?:姓名|候选人|联系人)[:：\s]*([\u4e00-\u9fa5]{2,6})/);
  const compact = cleaned.match(/^([\u4e00-\u9fa5]{2,6})(?=\s*(男|女|\d{2}岁|本科|硕士|博士|\d+年|在线|沟通))/);
  const nearProfile = cleaned.match(/([\u4e00-\u9fa5]{2,6})\s*(?:男|女)?\s*(?:\d{2}岁|本科|硕士|博士|大专|\d+年)/);
  const name = explicit?.[1] || compact?.[1] || nearProfile?.[1] || "";
  return BAD_NAMES.includes(name) ? "" : name;
}

const FORBIDDEN_JOB_TITLES = ["职位管理", "推荐牛人", "深度搜索", "搜索", "沟通", "意向沟通", "项目外包", "直播招聘", "招聘规范", "我的客服", "面试", "招聘数据", "VIP", "账号", "导航"];

function rectInfo(node) {
  const rect = node.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
}

function debugItem(node, reason) {
  return { text_preview: visibleText(node).slice(0, 240), className: String(node.className || "").slice(0, 160), rect: rectInfo(node), reason };
}

function isForbiddenJobTitle(title) {
  const value = cleanText(title);
  return !value || FORBIDDEN_JOB_TITLES.some((word) => value === word || value.includes(word)) || NAV_WORDS.some((word) => value === word);
}

function normalizeJobTitle(text) {
  const cleaned = cleanText(text).replace(/^[\d月日\-/.:：\s]+/, "");
  const match = cleaned.match(/(?:沟通的职位|沟通职位|职位|岗位)[:：\s]*([^\n。；;，,|]{2,40})/);
  return cleanText(match?.[1] || cleaned).replace(/^(当前|沟通|的|职位|岗位)[:：\s]*/, "").slice(0, 40);
}

function chatJobCardCandidates() {
  const selectors = [
    ".message-list [class*='job'], .chat-content [class*='job'], .im-message-list [class*='job']",
    ".message-list [class*='card'], .chat-content [class*='card'], .im-message-list [class*='card']",
    "[class*='message'] [class*='job'], [class*='bubble'] [class*='job'], [class*='card']",
    "div, li, section",
  ];
  return queryVisible(selectors).filter((node) => {
    const text = visibleText(node);
    if (text.length < 4 || text.length > 220 || isNavLike(text, node)) return false;
    const cls = String(node.className || "").toLowerCase();
    return /沟通的职位|沟通职位|职位[:：]/.test(text) || (/job|position|card/.test(cls) && /职位|岗位/.test(text));
  }).sort((a, b) => {
    const at = visibleText(a);
    const bt = visibleText(b);
    const as = /沟通的职位|沟通职位/.test(at) ? 0 : 1;
    const bs = /沟通的职位|沟通职位/.test(bt) ? 0 : 1;
    return as - bs || at.length - bt.length;
  });
}

function relatedJobCandidates() {
  return queryVisible(["aside [class*='job'], header [class*='job'], [class*='current'] [class*='job'], [class*='position'], section, article, div"])
    .filter((node) => {
      const text = visibleText(node);
      if (text.length < 8 || text.length > 600 || isNavLike(text, node)) return false;
      return /当前.*职位|沟通.*岗位|沟通.*职位|在招职位|职位[:：]|岗位[:：]/.test(text);
    })
    .sort((a, b) => visibleText(a).length - visibleText(b).length);
}

function buildJobFromNode(node, source) {
  const rawText = visibleText(node);
  let title = normalizeJobTitle(rawText);
  if (source !== "chat_job_card") {
    title = firstClean([".job-title", ".job-name", "[class*='job-title']", "[class*='job-name']", "[class*='position']", "h1", "h2", "h3"], node) || title;
    title = normalizeJobTitle(title);
  }
  if (isForbiddenJobTitle(title)) return null;
  return {
    title,
    city: source === "chat_job_card" ? "" : ((rawText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0]),
    salary: source === "chat_job_card" ? "" : ((rawText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0]),
    description: source === "chat_job_card" ? "" : rawText.slice(0, 1200),
    requirements: source === "chat_job_card" ? [] : manyClean(["li", ".requirement", "[class*='require']", "[class*='condition']"], node, 12).filter((t) => !isForbiddenJobTitle(t)),
    keywords: keywordsFrom(rawText, ["原画", "角色设计", "角色原画", "美宣", "游戏美术", "角色", "场景", "手绘", "厚涂", "二次元", "写实", "欧美", "日韩", "Photoshop", "SAI", "CSP"]),
    raw_text: rawText,
    source,
  };
}

function extractJob() {
  for (const node of chatJobCardCandidates()) {
    const job = buildJobFromNode(node, "chat_job_card");
    if (job) return { ok: true, job, error: "" };
  }
  for (const node of relatedJobCandidates()) {
    const job = buildJobFromNode(node, "related_job_area");
    if (job) return { ok: true, job, error: "" };
  }
  return { ok: false, job: { title: "", city: "", salary: "", description: "", requirements: [], raw_text: "", source: "unknown" }, error: "未识别当前沟通岗位，请点击聊天中的岗位卡或手动配置岗位" };
}

function extractAge(text) {
  const m = text.match(/(\d{2})\s*岁/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

function extractExpectedPosition(text) {
  const m = text.match(/期望(?:职位|岗位)[:：\s]*([^\n。；;]{2,50})/);
  return cleanText(m?.[1] || "");
}

function modalCandidateNodes() {
  return queryVisible(["[role='dialog']", ".modal", ".dialog", ".drawer", ".resume-detail", ".geek-detail", ".candidate-detail", "[class*='modal']", "[class*='dialog']", "[class*='drawer']", "[class*='resume']", "[class*='geek-detail']"])
    .filter((node) => {
      const text = visibleText(node);
      if (text.length < 50 || text.length > 8000 || isNavLike(text, node)) return false;
      const profileSignals = ["期望职位", "工作经历", "项目经历", "教育经历", "技能标签", "查看简历", "交换微信", "约面试"].filter((word) => text.includes(word)).length;
      return profileSignals >= 2 && (parseName(text) || /\d{2}岁/.test(text) || /\d+年/.test(text));
    })
    .sort((a, b) => visibleText(a).length - visibleText(b).length);
}

function chatHeaderCandidates() {
  return queryVisible([".chat-header", ".chat-user", ".conversation-header", ".message-header", "[class*='chat-header']", "[class*='conversation-header']"])
    .filter((node) => {
      const text = visibleText(node);
      return text.length >= 2 && text.length < 500 && !isNavLike(text, node) && (parseName(text) || /刚刚活跃|在线|\d{2}岁|\d+年|本科|硕士|博士/.test(text));
    });
}

function selectedChatCandidates() {
  return queryVisible([".selected", ".active", "[class*='selected']", "[class*='active']"])
    .filter((node) => {
      const text = visibleText(node);
      return text.length >= 2 && text.length < 300 && !isNavLike(text, node) && parseName(text);
    });
}

function buildCandidateFromText(text, source) {
  const scopedText = cleanText(text);
  const name = parseName(scopedText);
  const skills = keywordsFrom(scopedText, ["原画", "角色设计", "角色原画", "美宣", "游戏美术", "角色", "场景", "手绘", "厚涂", "二次元", "写实", "欧美", "日韩", "Photoshop", "PS", "SAI", "CSP", "Maya", "Blender", "ZBrush", "Substance", "UE", "Unreal", "虚幻", "Unity", "TA", "AI视频", "平面设计"]);
  const projectKeywords = keywordsFrom(scopedText, ["项目经历", "工作经历", "游戏", "手游", "端游", "角色原画", "道具设计", "角色设计", "美宣", "商业化", "外包", "二次元", "写实", "厚涂", "动画设计"]);
  const complete = source === "resume_modal";
  return {
    name,
    age: extractAge(scopedText),
    title: firstClean([".position", ".candidate-title", "[class*='position']"]) || "",
    city: (scopedText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0],
    experience_years: parseYears(scopedText),
    education: (scopedText.match(/大专|本科|硕士|博士|研究生/) || [""])[0],
    expected_position: extractExpectedPosition(scopedText),
    expected_city: (scopedText.match(/期望城市[:：\s]*(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙)/) || ["", ""])[1],
    salary_expectation: (scopedText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0],
    current_title: (scopedText.match(/(?:当前职位|在职职位|职位)[:：\s]*([^\n。；;]{2,40})/) || ["", ""])[1],
    work_experiences: (scopedText.match(/工作经历[^]*?(?=项目经历|教育经历|技能标签|$)/)?.[0] || "").split(/(?=\d{4}|\d+年|公司|项目)/).map(cleanText).filter((x) => x.length > 8).slice(0, 8),
    project_keywords: projectKeywords,
    skills,
    raw_text: complete ? scopedText.slice(0, 5000) : scopedText.slice(0, 600),
    source_url: location.href,
    source,
    profile_complete: complete,
    warning: complete ? "" : "请点击候选人头像/姓名打开在线简历后再分析，可提升评分准确度",
    last_active: (scopedText.match(/最近活跃|今日活跃|在线|刚刚活跃/) || [""])[0],
    contact_status: "未联系",
  };
}

function extractCandidate() {
  for (const node of modalCandidateNodes()) {
    const candidate = buildCandidateFromText(visibleText(node), "resume_modal");
    if (candidate.name) return { ok: true, candidate, warning: "", error: "" };
  }
  const header = chatHeaderCandidates()[0];
  if (header) {
    const candidate = buildCandidateFromText(visibleText(header), "chat_header");
    if (candidate.name) return { ok: true, candidate, warning: "当前候选人信息不完整，建议打开在线简历/候选人详情后再分析", error: "" };
  }
  const selected = selectedChatCandidates()[0];
  if (selected) {
    const candidate = buildCandidateFromText(visibleText(selected), "selected_chat_item");
    candidate.raw_text = candidate.name;
    candidate.profile_complete = false;
    candidate.warning = "请点击候选人头像/姓名打开在线简历后再分析，可提升评分准确度";
    if (candidate.name) return { ok: true, candidate, warning: "当前候选人信息不完整，建议打开在线简历/候选人详情后再分析", error: "" };
  }
  return { ok: false, candidate: { name: "", raw_text: "", source: "unknown", profile_complete: false, warning: "请点击候选人头像/姓名打开在线简历后再分析，可提升评分准确度" }, warning: "", error: "未识别候选人姓名，请打开具体候选人聊天窗口或候选人详情页" };
}

function chatRootCandidates() {
  return queryVisible([
    ".message-list, .chat-message-list, .im-message-list, .chat-content, .conversation-content",
    "[class*='message-list'], [class*='chat-content'], [class*='im-message']",
  ]).filter((el) => {
    const text = visibleText(el);
    if (text.length < 20 || isNavLike(text, el)) return false;
    const bubbleCount = el.querySelectorAll(".message, .chat-item, .im-message, [class*='message-item'], [class*='bubble']").length;
    return bubbleCount >= 2 || text.split(/\n|。|？|！/).filter((x) => cleanText(x).length > 0).length >= 3;
  }).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
}

function extractChat() {
  const root = chatRootCandidates()[0] || null;
  const candidate = extractCandidate();
  if (!root) {
    return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "unknown", error: "未检测到当前聊天窗口，请先打开一个具体候选人的聊天", raw_text: "" };
  }
  const nodes = queryVisible([".message, .chat-item, .im-message, [class*='message-item'], [class*='bubble']"], root);
  const latest = (nodes.length ? nodes : Array.from(root.children)).map((node) => {
    const text = cleanText(node.innerText || node.textContent || "");
    const cls = `${node.className || ""}`.toLowerCase();
    const role = /mine|self|right|hr|boss/.test(cls) ? "hr" : (/left|geek|candidate|other/.test(cls) ? "candidate" : "unknown");
    return { role, text };
  }).filter((m) => m.text && !isForbiddenJobTitle(m.text)).slice(-20);
  return { ok: true, candidate_name: candidate.candidate.name || "", text: latest.map((m) => m.text).join("\n"), latest_messages: latest, source: "chat_messages", error: "" };
}

function pageType(jobRes, candidateRes, chatRes) {
  const urlTitle = `${location.href} ${document.title}`;
  if (chatRes.ok || /chat|im|message|沟通|聊天/.test(urlTitle)) return "chat_page";
  if (candidateRes.ok) return "candidate_page";
  if (jobRes.ok) return "job_page";
  return "unknown";
}

function extractPageContext() {
  const jobRes = extractJob();
  const candidateRes = extractCandidate();
  const chatRes = extractChat();
  const warnings = [];
  if (!jobRes.ok) warnings.push("未识别岗位信息");
  if (!candidateRes.ok) warnings.push("未识别候选人姓名");
  if (candidateRes.warning || candidateRes.candidate?.warning) warnings.push(candidateRes.warning || candidateRes.candidate.warning);
  if (!chatRes.ok && pageType(jobRes, candidateRes, chatRes) === "chat_page") warnings.push("未检测到聊天窗口");
  if (/\/web\/chat\/job\/list/.test(location.pathname)) warnings.push("当前页面可能是聊天列表页，请点击具体候选人对话");
  const job = jobRes.job;
  const candidate = candidateRes.candidate;
  const selected = selectedChatCandidates()[0];
  const selectedName = selected ? parseName(visibleText(selected)) : "";
  if (selectedName && candidate.name && selectedName !== candidate.name) warnings.push("当前详情弹窗候选人与聊天选中对象可能不一致，请确认后再生成话术");
  const base = candidate.name ? `${candidate.name}|${job.title || ""}|${location.href}` : `${document.title}|${location.href}`;
  return { ok: true, page_type: pageType(jobRes, candidateRes, chatRes), url: location.href, title: document.title, job, candidate, chat: { candidate_name: chatRes.candidate_name, messages_text: chatRes.text, latest_messages: chatRes.latest_messages }, context_id: simpleHash(base), warnings };
}

function debugDom() {
  const blocks = [];
  const nodes = Array.from(document.querySelectorAll("main, section, article, aside, div, li, p"));
  for (const node of nodes) {
    if (!isVisible(node)) continue;
    const text = visibleText(node);
    if (text.length < 10 || text.length > 300 || isNavLike(text, node)) continue;
    blocks.push({ index: blocks.length, tag: node.tagName.toLowerCase(), className: String(node.className || "").slice(0, 120), id: node.id || "", text_preview: text.slice(0, 160), rect: rectInfo(node) });
    if (blocks.length >= 80) break;
  }
  const inputCandidates = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true'], [role='textbox'], .ql-editor, .ProseMirror")).filter(isVisible).map((node) => ({ tag: node.tagName.toLowerCase(), type: node.getAttribute("type") || "", className: String(node.className || "").slice(0, 120), id: node.id || "", placeholder: node.getAttribute("placeholder") || "", role: node.getAttribute("role") || "", contenteditable: node.getAttribute("contenteditable") || "", text_preview: visibleText(node).slice(0, 120) }));
  return {
    ok: true,
    url: location.href,
    title: document.title,
    body_text_length: visibleText(document.body).length,
    visible_blocks: blocks,
    input_candidates: inputCandidates,
    modal_candidates: modalCandidateNodes().slice(0, 10).map((node) => debugItem(node, "resume_modal_signal")),
    chat_job_card_candidates: chatJobCardCandidates().slice(0, 10).map((node) => debugItem(node, "chat_job_card_signal")),
    chat_header_candidates: chatHeaderCandidates().slice(0, 10).map((node) => debugItem(node, "chat_header_signal")),
    selected_chat_candidates: selectedChatCandidates().slice(0, 10).map((node) => debugItem(node, "selected_chat_signal")),
  };
}

function setNativeValue(el, text) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
  } else {
    el.textContent = text;
    el.innerText = text;
  }
  el.focus();
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
  el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
}

function fillGreeting(text) {
  const searchWords = ["搜索", "搜索牛人", "搜索职位", "搜索聊天"];
  const inputs = Array.from(document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox'], input[type='text'], .ql-editor, .ProseMirror"))
    .filter(isVisible)
    .filter((el) => !includesAny(el.getAttribute("placeholder") || "", searchWords))
    .map((el) => {
      const meta = `${el.className || ""} ${el.id || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("role") || ""}`.toLowerCase();
      let score = /message|chat|input|editor|reply|发送|沟通/.test(meta) ? 10 : 0;
      if (el.tagName === "TEXTAREA") score += 5;
      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") score += 4;
      if (el.getAttribute("role") === "textbox") score += 3;
      return { el, score };
    })
    .sort((a, b) => b.score - a.score);
  const target = inputs[0]?.el;
  if (target) {
    const method = target.tagName === "TEXTAREA" ? "textarea" : (target.tagName === "INPUT" ? "input" : (target.getAttribute("role") === "textbox" ? "role-textbox" : "contenteditable"));
    setNativeValue(target, text || "");
    return { ok: true, target_found: true, method, filled_text_preview: (text || "").slice(0, 40) };
  }
  return { ok: false, error: "未找到可输入的聊天框", debug: { textarea_count: document.querySelectorAll("textarea").length, contenteditable_count: document.querySelectorAll("[contenteditable='true']").length, textbox_count: document.querySelectorAll("[role='textbox']").length, placeholders: Array.from(document.querySelectorAll("textarea, input")).map((el) => el.getAttribute("placeholder") || "").filter(Boolean).slice(0, 20) } };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") sendResponse({ ok: true, message: "content alive", url: location.href, title: document.title });
  else if (message?.type === "DEBUG_DOM") sendResponse(debugDom());
  else if (message?.type === "EXTRACT_PAGE_CONTEXT") sendResponse(extractPageContext());
  else if (message?.type === "EXTRACT_JOB") sendResponse(extractJob());
  else if (message?.type === "EXTRACT_CANDIDATE") sendResponse(extractCandidate());
  else if (message?.type === "EXTRACT_CHAT") sendResponse(extractChat());
  else if (message?.type === "FILL_GREETING") sendResponse(fillGreeting(message.text || ""));
  else sendResponse({ ok: false, error: `未知消息类型: ${message?.type || "empty"}` });
  return true;
});

})();
