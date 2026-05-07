console.log("[AI Recruit Assistant] content.js injected", location.href);

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function visibleText(root = document.body) {
  return cleanText(root?.innerText || root?.textContent || "");
}

function firstText(selectors, root = document) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (!node) continue;
    const text = cleanText(node.innerText || node.textContent || node.getAttribute?.("title") || node.getAttribute?.("data-name"));
    if (text) return text;
  }
  return "";
}

function manyTexts(selectors, root = document, limit = 20) {
  const values = [];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      const text = cleanText(node.innerText || node.textContent || node.getAttribute?.("title"));
      if (text && !values.includes(text)) values.push(text);
    });
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

function parseNameFromScopedText(text) {
  const matched = text.match(/(?:姓名|候选人|联系人)[:：\s]*([\u4e00-\u9fa5]{2,6})/);
  if (matched) return matched[1];
  const compact = text.match(/^([\u4e00-\u9fa5]{2,6})(?=\s*(男|女|\d{2}岁|本科|硕士|博士|\d+年))/);
  return compact?.[1] || "";
}

function findCandidateRoot() {
  return document.querySelector(".resume-detail, .geek-detail, .candidate-detail, .selected, .active, [class*='resume'], [class*='geek']") || document.body;
}

function extractCandidate() {
  const root = findCandidateRoot();
  const rawText = visibleText(root) || visibleText(document.body);
  const name = firstText([
    ".geek-name",
    ".candidate-name",
    ".resume-name",
    ".user-name",
    "[class*='name']",
    "[data-name]",
    ".chat-user-name",
    ".figure-name",
  ], root) || parseNameFromScopedText(rawText);
  const skills = keywordsFrom(rawText, ["UE", "Unreal", "虚幻", "Maya", "ZBrush", "Substance", "Blender", "3D", "角色", "场景", "动作", "特效", "Unity", "TA"]);
  const projectKeywords = keywordsFrom(rawText, ["3A", "次世代", "手游", "端游", "商业化皮肤", "外包", "项目", "主机", "开放世界"]);
  return {
    name,
    title: firstText([".position", ".candidate-title", ".job-title", "[class*='position']"], root),
    city: firstText([".city", ".candidate-city", "[class*='city']"], root) || (rawText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0],
    experience_years: parseYears(rawText),
    education: (rawText.match(/大专|本科|硕士|博士|研究生/) || [""])[0],
    salary_expectation: firstText([".salary", ".expect-salary", "[class*='salary']", "[class*='pay']"], root) || (rawText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0],
    skills,
    project_keywords: projectKeywords,
    raw_text: rawText,
    source_url: location.href,
    last_active: (rawText.match(/最近活跃|今日活跃|在线|刚刚活跃/) || [""])[0],
    contact_status: "未联系",
  };
}

function extractJob() {
  const root = document.querySelector(".job-detail, .job-sec, .job-box, .job-primary, [class*='job-detail'], [class*='job']") || document.body;
  const rawText = visibleText(root) || visibleText(document.body);
  const title = firstText([
    ".job-title",
    ".job-name",
    ".name",
    "h1",
    "[class*='job-title']",
    "[class*='position']",
  ], root);
  const requirements = manyTexts([".job-sec li", ".job-detail li", ".requirements li", "[class*='require'] li"], root, 12);
  const description = firstText([".job-description", ".job-detail", ".job-sec", "[class*='description']", "[class*='detail']"], root) || rawText.slice(0, 1200);
  return {
    title: title && title !== "游戏美术" ? title : title,
    city: firstText([".job-location", ".location", ".city", "[class*='city']"], root) || (rawText.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙/) || [""])[0],
    salary: firstText([".salary", ".job-salary", "[class*='salary']"], root) || (rawText.match(/\d+\s*[kK][-~]\s*\d+\s*[kK]|\d+\s*万[-~]\s*\d+\s*万/) || [""])[0],
    description,
    requirements: requirements.length ? requirements : keywordsFrom(rawText, ["UE", "Maya", "Unreal", "虚幻", "3A", "次世代", "角色", "场景", "Unity"]),
    keywords: keywordsFrom(rawText, ["UE", "Maya", "Unreal", "虚幻", "3A", "次世代", "角色", "场景", "手游", "端游"]),
    raw_text: rawText,
  };
}

function extractChat() {
  const root = document.querySelector(".chat-container, .chat-content, .message-list, .im-message-list, .conversation-list, .boss-chat, [class*='chat'] [class*='message']");
  const raw = root ? visibleText(root) : visibleText(document.body);
  const latest = manyTexts([".message, .chat-item, .im-message, [class*='message-item']"], root || document, 20);
  const candidateName = firstText([".chat-user-name", ".geek-name", ".user-name", ".name", "[class*='user'] [class*='name']"]) || parseNameFromScopedText(raw);
  return {
    ok: Boolean(root),
    candidate_name: candidateName,
    messages_text: raw,
    text: raw,
    latest_messages: latest.length ? latest : raw.split(/\n+/).map(cleanText).filter(Boolean).slice(-10),
    raw_text: visibleText(document.body),
  };
}

function pageType(job, candidate, chat) {
  const url = location.href;
  const text = visibleText(document.body);
  if (chat.ok || /chat|im|message|沟通|聊天/.test(url + document.title)) return "chat_page";
  if (candidate.name || /简历|候选人|求职|工作经历|项目经历/.test(text)) return "candidate_page";
  if (job.title || /职位描述|岗位职责|任职要求|薪资/.test(text)) return "job_page";
  return "unknown";
}

function extractPageContext() {
  const job = extractJob();
  const candidate = extractCandidate();
  const chat = extractChat();
  const base = (candidate.name && job.title) ? `${candidate.name}|${job.title}|${location.href}` : `${document.title}|${location.href}`;
  return {
    ok: true,
    page_type: pageType(job, candidate, chat),
    url: location.href,
    title: document.title,
    job,
    candidate,
    chat: { candidate_name: chat.candidate_name, messages_text: chat.messages_text, latest_messages: chat.latest_messages },
    context_id: simpleHash(base),
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
  const candidates = [
    ["textarea", "textarea"],
    ["input[type='text']", "input"],
    ["[contenteditable='true']", "contenteditable"],
    ["[role='textbox']", "role-textbox"],
    [".ql-editor", "contenteditable"],
    [".ProseMirror", "contenteditable"],
    [".chat-input, .input-area, .dialog-input", "contenteditable"],
  ];
  for (const [selector, method] of candidates) {
    const el = document.querySelector(selector);
    if (!el) continue;
    setNativeValue(el, text || "");
    return { ok: true, target_found: true, method, filled_text_preview: (text || "").slice(0, 40) };
  }
  return {
    ok: false,
    error: "未找到可输入的聊天框",
    debug: {
      url: location.href,
      title: document.title,
      textarea_count: document.querySelectorAll("textarea").length,
      input_count: document.querySelectorAll("input[type='text']").length,
      contenteditable_count: document.querySelectorAll("[contenteditable='true']").length,
      textbox_count: document.querySelectorAll("[role='textbox']").length,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") sendResponse({ ok: true, message: "content alive", url: location.href });
  else if (message?.type === "EXTRACT_PAGE_CONTEXT") sendResponse(extractPageContext());
  else if (message?.type === "EXTRACT_JOB") sendResponse({ ok: true, job: extractJob() });
  else if (message?.type === "EXTRACT_CANDIDATE") sendResponse({ ok: true, candidate: extractCandidate() });
  else if (message?.type === "EXTRACT_CHAT") sendResponse(extractChat());
  else if (message?.type === "FILL_GREETING") sendResponse(fillGreeting(message.text || ""));
  else sendResponse({ ok: false, error: `未知消息类型: ${message?.type || "empty"}` });
  return true;
});
