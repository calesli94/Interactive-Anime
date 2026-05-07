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
  const explicit = text.match(/(?:姓名|候选人|联系人)[:：\s]*([\u4e00-\u9fa5]{2,6})/);
  const compact = text.match(/^([\u4e00-\u9fa5]{2,6})(?=\s*(男|女|\d{2}岁|本科|硕士|博士|\d+年|在线|沟通))/);
  const name = explicit?.[1] || compact?.[1] || "";
  return BAD_NAMES.includes(name) ? "" : name;
}

function candidateRootCandidates() {
  return queryVisible([
    ".chat-user, .chat-header, .conversation-header, .message-header",
    ".resume-detail, .geek-detail, .candidate-detail, .resume-card, .geek-card",
    ".selected, .active, [class*='selected'], [class*='active']",
    "[class*='resume'], [class*='geek'], [class*='candidate']",
  ]).filter((el) => {
    const text = visibleText(el);
    return text.length > 0 && !isNavLike(text, el) && (includesAny(text, CANDIDATE_SIGNALS) || parseName(text) || /\d+岁|\d+年|本科|硕士|博士/.test(text));
  });
}

function extractCandidate() {
  const roots = candidateRootCandidates();
  const root = roots[0] || null;
  const rawText = root ? visibleText(root) : "";
  const pageText = visibleText(document.body);
  const scopedText = rawText || pageText;
  const domName = root ? firstClean([".geek-name", ".candidate-name", ".resume-name", ".user-name", "[class*='name']", "[data-name]"], root) : "";
  const headerName = firstClean([".chat-header .name", ".chat-user-name", ".conversation-header [class*='name']", ".message-header [class*='name']"]);
  const name = [domName, headerName, parseName(scopedText)].find((v) => v && !BAD_NAMES.includes(v) && v.length <= 12) || "";
  const skills = keywordsFrom(scopedText, ["UE", "Unreal", "虚幻", "Maya", "ZBrush", "Substance", "Blender", "3D", "角色", "场景", "动作", "特效", "Unity", "TA"]);
  const projectKeywords = keywordsFrom(scopedText, ["3A", "次世代", "手游", "端游", "商业化皮肤", "外包", "项目", "主机", "开放世界"]);
  const source = name ? (headerName === name ? "chat_header" : "profile_card") : "unknown";
  return {
    ok: Boolean(name),
    candidate: {
      name,
      title: root ? firstClean([".position", ".candidate-title", ".job-title", "[class*='position']"], root) : "",
      city: (root ? firstClean([".city", ".candidate-city", "[class*='city']"], root) : "") || (scopedText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0],
      experience_years: parseYears(scopedText),
      education: (scopedText.match(/大专|本科|硕士|博士|研究生/) || [""])[0],
      salary_expectation: (root ? firstClean([".salary", ".expect-salary", "[class*='salary']", "[class*='pay']"], root) : "") || (scopedText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0],
      skills,
      project_keywords: projectKeywords,
      raw_text: scopedText,
      source_url: location.href,
      source,
      last_active: (scopedText.match(/最近活跃|今日活跃|在线|刚刚活跃/) || [""])[0],
      contact_status: "未联系",
    },
    error: name ? "" : "未识别候选人姓名，请打开具体候选人聊天窗口或候选人详情页",
  };
}

function jobRootCandidates() {
  return queryVisible([
    ".job-detail, .job-sec, .job-box, .job-primary, .job-card, .position-card",
    "[class*='job-detail'], [class*='job-card'], [class*='position-card']",
    "section, article, main, aside, div",
  ]).filter((el) => {
    const text = visibleText(el);
    if (text.length < 30 || text.length > 3000 || isNavLike(text, el)) return false;
    return includesAny(text, JOB_SIGNALS);
  }).sort((a, b) => visibleText(a).length - visibleText(b).length);
}

function extractJob() {
  if (/\/web\/chat\/job\/list/.test(location.pathname)) {
    return { ok: false, job: { title: "", city: "", salary: "", description: "", requirements: [], raw_text: "", source: "unknown" }, error: "未识别岗位信息，请进入岗位详情页或手动配置岗位" };
  }
  const root = jobRootCandidates()[0] || null;
  if (!root) return { ok: false, job: { title: "", city: "", salary: "", description: "", requirements: [], raw_text: "", source: "unknown" }, error: "未识别岗位信息，请进入岗位详情页或手动配置岗位" };
  const rawText = visibleText(root);
  const title = firstClean([".job-title", ".job-name", "[class*='job-title']", "[class*='job-name']", "h1", "h2"], root);
  if (!title || includesAny(title, NAV_WORDS)) return { ok: false, job: { title: "", city: "", salary: "", description: "", requirements: [], raw_text: "", source: "unknown" }, error: "未识别岗位信息，请进入岗位详情页或手动配置岗位" };
  const requirements = manyClean(["li", ".requirement", "[class*='require']", "[class*='condition']"], root, 12).filter((t) => !includesAny(t, NAV_WORDS));
  return {
    ok: true,
    job: {
      title,
      city: firstClean([".job-location", ".location", ".city", "[class*='city']"], root) || (rawText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0],
      salary: firstClean([".salary", ".job-salary", "[class*='salary']"], root) || (rawText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0],
      description: rawText.slice(0, 1200),
      requirements,
      keywords: keywordsFrom(rawText, ["UE", "Maya", "Unreal", "虚幻", "3A", "次世代", "角色", "场景", "手游", "端游"]),
      raw_text: rawText,
      source: "dom",
    },
    error: "",
  };
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
    return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "unknown", error: "未检测到当前聊天窗口，请先打开一个具体候选人的聊天", raw_text: visibleText(document.body).slice(0, 1500) };
  }
  const nodes = queryVisible([".message, .chat-item, .im-message, [class*='message-item'], [class*='bubble']"], root);
  const latest = (nodes.length ? nodes : Array.from(root.children)).map((node) => {
    const text = cleanText(node.innerText || node.textContent || "");
    const cls = `${node.className || ""}`.toLowerCase();
    const role = /mine|self|right|hr|boss/.test(cls) ? "hr" : (/left|geek|candidate|other/.test(cls) ? "candidate" : "unknown");
    return { role, text };
  }).filter((m) => m.text).slice(-20);
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
  if (!chatRes.ok && pageType(jobRes, candidateRes, chatRes) === "chat_page") warnings.push("未检测到聊天窗口");
  if (/\/web\/chat\/job\/list/.test(location.pathname)) warnings.push("当前页面可能是聊天列表页，请点击具体候选人对话");
  const job = jobRes.job;
  const candidate = candidateRes.candidate;
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
    const rect = node.getBoundingClientRect();
    blocks.push({ index: blocks.length, tag: node.tagName.toLowerCase(), className: String(node.className || "").slice(0, 120), id: node.id || "", text_preview: text.slice(0, 160), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } });
    if (blocks.length >= 80) break;
  }
  const inputCandidates = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true'], [role='textbox'], .ql-editor, .ProseMirror")).filter(isVisible).map((node) => ({ tag: node.tagName.toLowerCase(), type: node.getAttribute("type") || "", className: String(node.className || "").slice(0, 120), id: node.id || "", placeholder: node.getAttribute("placeholder") || "", role: node.getAttribute("role") || "", contenteditable: node.getAttribute("contenteditable") || "", text_preview: visibleText(node).slice(0, 120) }));
  return { ok: true, url: location.href, title: document.title, body_text_length: visibleText(document.body).length, visible_blocks: blocks, input_candidates: inputCandidates };
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
