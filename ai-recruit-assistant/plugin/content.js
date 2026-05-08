console.log("[AI Recruit Assistant] content.js injected", location.href);

(() => {
  const LISTENER_KEY = "__AI_RECRUIT_ASSISTANT_ON_MESSAGE__";
  if (window[LISTENER_KEY]) {
    try {
      chrome.runtime.onMessage.removeListener(window[LISTENER_KEY]);
    } catch (e) {
      console.warn("[AI Recruit Assistant] remove old listener failed", e);
    }
  }

  // Regression examples:
  // parseJobTitleFromText("4月30日 沟通的职位：技术-TA") => "技术-TA"
  // parsePersonBasics("陈婧铭 今日活跃 23岁 | 1年 | 本科") => name=陈婧铭, age=23, experience_years=1, education=本科
  // parsePersonBasics("顾思琪 刚刚活跃 25岁 | 3年 | 本科") => name=顾思琪, age=25, experience_years=3, education=本科

  const NAV_WORDS = ["职位管理", "推荐牛人", "深度搜索", "搜索", "沟通", "牛人管理", "项目外包", "直播招聘", "招聘规范", "我的客服", "招聘数据", "VIP", "面试", "账号", "导航", "更多", "客服", "消息", "招聘统计", "扫码登录", "充值"];
  const BAD_NAMES = ["BOSS直聘", "AI招聘助手", "职位管理", "推荐牛人", "沟通", "搜索", "当前候选人", "期望职位", "工作经历", "教育经历", "招聘规范", "我的客服", "面试", "招聘助手", "在线简历", "简历", "未识别"];
  const JOB_FORBIDDEN = [...NAV_WORDS, "道具", "意向沟通", "牛人", "人才", "聊天"];
  const JOB_AREA_SIGNALS = ["职位描述", "岗位职责", "任职要求", "技能要求", "加分项", "工作内容", "职位要求", "你将负责", "我们希望你", "工作地点", "薪资", "发布职位", "招聘中", "沟通的职位", "沟通职位", "沟通的岗位", "项目方向"];
  const RESUME_SIGNALS = ["期望职位", "工作经历", "教育经历", "项目经历", "技能标签", "技能", "在职", "到岗", "刚刚活跃", "今日活跃", "交换微信", "约面试"];
  const SKILL_WORDS = ["UE", "Unreal", "虚幻", "Maya", "ZBrush", "Substance", "Blender", "原画", "角色原画", "角色设计", "场景", "道具设计", "动画设计", "二维动画设计", "特效", "TA", "技术美术", "SAI", "Photoshop", "PhotoShop", "CSP", "csp", "AE", "AI视频", "AI绘画", "AI工具", "游戏美术", "美宣"];
  const PROJECT_WORDS = ["3A", "次世代", "手游", "端游", "游戏美术", "角色", "场景", "道具", "美宣", "外包", "商业化皮肤", "角色原画", "道具设计", "二维动画设计"];
  const CITY_RE = /北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|厦门|西安|重庆|天津|长沙|郑州|合肥|青岛|宁波|佛山|东莞/;

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function oneLine(value) {
    return cleanText(value).replace(/\s+/g, " ").trim();
  }

  function textOf(node) {
    return cleanText(node?.innerText || node?.textContent || "");
  }

  function linesOf(valueOrNode) {
    const raw = typeof valueOrNode === "string" ? valueOrNode : (valueOrNode?.innerText || valueOrNode?.textContent || "");
    return String(raw || "").split(/\n+/).map(oneLine).filter(Boolean);
  }

  function includesAny(text, words) {
    return words.some((word) => text.includes(word));
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 12 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function isExtensionDom(node) {
    const root = node?.getRootNode?.();
    if (location.protocol === "chrome-extension:" || location.protocol === "edge-extension:") return true;
    if (root instanceof ShadowRoot && /ai-recruit/i.test(String(root.host?.id || root.host?.className || ""))) return true;
    return Boolean(node?.closest?.("#ai-recruit-assistant, .ai-recruit-assistant, [data-ai-recruit-assistant]"));
  }

  function rectInfo(node) {
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function isNavLike(text, el) {
    const value = oneLine(text);
    const cls = `${el?.className || ""} ${el?.id || ""}`.toLowerCase();
    const tag = (el?.tagName || "").toLowerCase();
    if (["nav", "footer", "button"].includes(tag)) return true;
    if (/nav|menu|sidebar|footer|toolbar|account|search|pagination/.test(cls)) return true;
    const navHits = NAV_WORDS.filter((word) => value.includes(word)).length;
    return navHits >= 2 && value.length < 600;
  }

  function queryVisible(selectors, root = document) {
    const nodes = [];
    for (const selector of selectors) {
      try {
        root.querySelectorAll(selector).forEach((node) => {
          if (isVisible(node) && !isExtensionDom(node) && !nodes.includes(node)) nodes.push(node);
        });
      } catch (e) {
        console.warn("[AI Recruit Assistant] bad selector", selector, e);
      }
    }
    return nodes;
  }

  function debugNode(node, score = 0, reason = "") {
    return {
      score,
      reason,
      text_preview: oneLine(textOf(node)).slice(0, 260),
      className: String(node?.className || "").slice(0, 180),
      id: node?.id || "",
      rect: node ? rectInfo(node) : { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  function safeKeywords(text, words) {
    const source = text || "";
    return uniq(words.filter((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source)));
  }

  function simpleHash(input) {
    let hash = 0;
    const text = String(input || "");
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return `ctx_${Math.abs(hash).toString(36)}`;
  }

  function parseAge(text) {
    const m = String(text || "").match(/(\d{2})\s*岁/);
    return m ? Number.parseInt(m[1], 10) : null;
  }

  function parseYears(text) {
    const source = String(text || "");
    const range = source.match(/(\d+)\s*[-~—至]\s*(\d+)\s*年/);
    if (range) return Number.parseInt(range[2], 10) || null;
    const exact = source.match(/(\d+)\s*年/);
    return exact ? (Number.parseInt(exact[1], 10) || null) : null;
  }

  function parseEducation(text) {
    return (String(text || "").match(/大专|本科|硕士|博士|研究生|中专|高中/) || [""])[0];
  }

  function parseNameFromText(text) {
    const source = oneLine(text);
    const patterns = [
      /^([\u4e00-\u9fa5]{2,4})(?=\s*(今日活跃|刚刚活跃|在线|最近活跃|\d{2}岁|男|女|大专|本科|硕士|博士|\d+年|\||$))/,
      /(?:姓名|候选人|联系人)[:：\s]*([\u4e00-\u9fa5]{2,4})/,
      /([\u4e00-\u9fa5]{2,4})\s*(?:今日活跃|刚刚活跃|在线|最近活跃)\s*\d{2}岁/,
      /([\u4e00-\u9fa5]{2,4})\s*(?:男|女)?\s*\d{2}岁\s*[|｜]/,
    ];
    for (const pattern of patterns) {
      const name = source.match(pattern)?.[1] || "";
      if (name && !BAD_NAMES.includes(name) && !includesAny(name, NAV_WORDS)) return name;
    }
    return "";
  }

  function parsePersonBasics(text) {
    return {
      name: parseNameFromText(text),
      age: parseAge(text),
      experience_years: parseYears(text),
      education: parseEducation(text),
    };
  }

  function emptyJob(source = "unknown") {
    return { title: "", city: "", salary: "", description: "", responsibilities: [], requirements: [], preferred_keywords: [], keywords: [], raw_text: "", source, jd_complete: false, warning: "" };
  }

  function emptyCandidate(source = "unknown") {
    return {
      name: "",
      age: null,
      experience_years: null,
      education: "",
      expected_position: "",
      expected_city: "",
      salary_expectation: "",
      current_title: "",
      title: "",
      city: "",
      skills: [],
      project_keywords: [],
      work_experiences: [],
      raw_text: "",
      source,
      sources_used: [],
      source_url: location.href,
      profile_complete: false,
      confidence: 0,
      warnings: [],
    };
  }

  function parseJobTitleFromText(text) {
    const source = oneLine(text).replace(/^[\d月日\-/.:：\s]+/, "");
    const patterns = [
      /(?:沟通的职位|沟通职位|沟通的岗位|沟通岗位)\s*[:：]?\s*([^。；;\n]{2,80})/,
      /(?:职位|岗位)\s*[:：]\s*([^。；;\n]{2,80})/,
    ];
    for (const pattern of patterns) {
      const raw = source.match(pattern)?.[1] || "";
      const title = oneLine(raw).replace(/^(当前|沟通|的|职位|岗位)[:：\s]*/, "").replace(/\s*(查看|详情|继续沟通|立即沟通).*$/, "").trim();
      if (isValidJobTitle(title)) return title;
    }
    return "";
  }

  function isValidJobTitle(title) {
    const value = oneLine(title);
    if (!value || value.length < 2 || value.length > 80) return false;
    if (JOB_FORBIDDEN.some((word) => value === word || (value.includes(word) && value.length <= word.length + 2))) return false;
    if (/^(职位|岗位|沟通|搜索|更多|账号|导航)$/.test(value)) return false;
    return true;
  }

  function chatJobCardCandidates() {
    const candidates = [];
    const selectors = [
      ".message-list *", ".chat-content *", ".im-message-list *", ".conversation-content *",
      "[class*='message'] *", "[class*='bubble'] *", "[class*='card']", "[class*='job']", "div", "li", "section",
    ];
    for (const node of queryVisible(selectors)) {
      const text = textOf(node);
      if (text.length < 4 || text.length > 300 || isNavLike(text, node)) continue;
      if (!/(沟通的职位|沟通职位|沟通的岗位|沟通岗位|职位[:：]|岗位[:：])/.test(text)) continue;
      const title = parseJobTitleFromText(text);
      if (!title) continue;
      let score = 40;
      const cls = String(node.className || "").toLowerCase();
      if (/message|bubble|card|job|position/.test(cls)) score += 20;
      if (/沟通的职位|沟通职位|沟通的岗位/.test(text)) score += 30;
      const rect = node.getBoundingClientRect();
      if (rect.width > 160 && rect.height > 20) score += 10;
      candidates.push({ node, title, score, reason: "命中沟通职位/岗位文本" });
    }
    return candidates.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function jobAreaCandidates() {
    const candidates = [];
    for (const node of queryVisible([".job-detail", ".job-card", ".job-primary", ".position-card", "[class*='job']", "[class*='position']", "main", "section", "article", "aside", "div"])) {
      const text = textOf(node);
      if (text.length < 20 || text.length > 5000 || isNavLike(text, node)) continue;
      const signalHits = JOB_AREA_SIGNALS.filter((word) => text.includes(word));
      if (!signalHits.length) continue;
      let title = parseJobTitleFromText(text);
      if (!title) {
        const titleNode = queryVisible([".job-title", ".job-name", "[class*='job-title']", "[class*='job-name']", "[class*='position-name']", "h1", "h2", "h3"], node)
          .map((el) => oneLine(el.innerText || el.textContent || ""))
          .find(isValidJobTitle);
        title = titleNode || "";
      }
      if (!title) continue;
      const rect = node.getBoundingClientRect();
      const score = signalHits.length * 20 + (rect.width > 300 && rect.height > 120 ? 10 : 0);
      candidates.push({ node, title, score, reason: `岗位业务区域：${signalHits.join("、")}` });
    }
    return candidates.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function splitJobDetail(rawText) {
    const lines = linesOf(rawText).filter((line) => !includesAny(line, NAV_WORDS));
    const responsibilities = lines.filter((line) => /岗位职责|工作内容|你将负责|负责/.test(line)).slice(0, 12);
    const requirements = lines.filter((line) => /任职要求|技能要求|职位要求|我们希望你|要求|熟悉|经验|能力/.test(line)).slice(0, 16);
    const preferred_keywords = uniq([...safeKeywords(rawText, [...SKILL_WORDS, ...PROJECT_WORDS]), ...lines.filter((line) => /加分项|优先|项目方向/.test(line)).slice(0, 8)]);
    return { responsibilities, requirements, preferred_keywords };
  }

  function buildJobFromCandidate(item, source) {
    const rawText = textOf(item.node);
    const detail = splitJobDetail(rawText);
    const jdComplete = source !== "chat_job_card" && Boolean(rawText && (detail.responsibilities.length || detail.requirements.length || /职位描述|岗位职责|任职要求|技能要求|加分项|工作内容|职位要求|你将负责|我们希望你/.test(rawText)));
    return {
      title: item.title,
      city: (rawText.match(CITY_RE) || [""])[0],
      salary: (rawText.match(/\d+\s*[-~]\s*\d+\s*[kK]|\d+\s*[kK]\s*[-~]\s*\d+\s*[kK]|\d+\s*万\s*[-~]\s*\d+\s*万/) || [""])[0],
      description: jdComplete ? rawText.slice(0, 1600) : "",
      responsibilities: jdComplete ? detail.responsibilities : [],
      requirements: jdComplete ? detail.requirements : [],
      preferred_keywords: jdComplete ? detail.preferred_keywords : [],
      keywords: safeKeywords(rawText, [...SKILL_WORDS, ...PROJECT_WORDS]),
      raw_text: rawText,
      source: jdComplete ? "job_detail" : source,
      jd_complete: jdComplete,
      warning: jdComplete ? "" : "当前页面仅识别到岗位名称，未识别岗位职责和任职要求，请打开该岗位详情页或手动补充岗位要求",
    };
  }

  function extractJob() {
    const debug = { chat_job_card_candidates: [], job_area_candidates: [] };
    try {
      const cards = chatJobCardCandidates();
      debug.chat_job_card_candidates = cards.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title }));
      const areas = jobAreaCandidates();
      debug.job_area_candidates = areas.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title }));
      if (areas[0]) {
        const job = buildJobFromCandidate(areas[0], "job_area");
        if (!job.title && cards[0]) job.title = cards[0].title;
        return { ok: true, job, error: "", debug };
      }
      if (cards[0]) return { ok: true, job: buildJobFromCandidate(cards[0], "chat_job_card"), error: "", debug };

      return { ok: false, job: emptyJob(), error: "未识别当前沟通岗位", debug };
    } catch (e) {
      return { ok: false, job: emptyJob(), error: `岗位抓取异常：${e.message || e}`, debug };
    }
  }

  function expectedParts(text) {
    const line = linesOf(text).find((item) => item.includes("期望职位")) || "";
    const normalized = line.replace(/^期望职位[:：\s]*/, "").replace(/期望职位/g, " ");
    const parts = normalized.split(/[|/｜·,，\s]+/).map(oneLine).filter(Boolean);
    const expected_city = parts.find((item) => CITY_RE.test(item)) || "";
    const salary_expectation = parts.find((item) => /\d+\s*[-~]\s*\d+\s*[kK]|\d+\s*[kK]/.test(item)) || "";
    const expected_position = parts.find((item) => item !== expected_city && item !== salary_expectation && !/游戏|文化|艺术|娱乐|互联网|行业|到岗|在职/.test(item)) || "";
    return { expected_position, expected_city, salary_expectation };
  }

  function resumeModalScore(node) {
    const text = textOf(node);
    const rect = node.getBoundingClientRect();
    let score = 0;
    const reasons = [];
    if (text.includes("期望职位")) { score += 30; reasons.push("包含期望职位"); }
    if (text.includes("工作经历")) { score += 30; reasons.push("包含工作经历"); }
    if (text.includes("教育经历")) { score += 20; reasons.push("包含教育经历"); }
    if (text.includes("项目经历")) { score += 10; reasons.push("包含项目经历"); }
    if (/技能标签|技能/.test(text)) { score += 10; reasons.push("包含技能"); }
    if (/在职|到岗|刚刚活跃|今日活跃|交换微信|约面试/.test(text)) { score += 10; reasons.push("包含候选人状态/动作"); }
    if (/\d{2}岁/.test(text) && /\d+年/.test(text) && /本科|大专|硕士|博士/.test(text)) { score += 20; reasons.push("包含年龄年限学历"); }
    if (rect.width > 300 && rect.height > 300) { score += 10; reasons.push("面积大于300x300"); }
    const centerX = rect.left + rect.width / 2;
    if (rect.width > 360 && Math.abs(centerX - window.innerWidth / 2) < window.innerWidth * 0.4) { score += 5; reasons.push("大面板靠近中部"); }
    return { score, reason: reasons.join("；") || "未命中简历弹窗特征" };
  }

  function resumeModalCandidates() {
    const nodes = [];
    for (const node of queryVisible(["[role='dialog']", ".modal", ".dialog", ".drawer", ".resume-detail", ".geek-detail", ".candidate-detail", "[class*='modal']", "[class*='dialog']", "[class*='drawer']", "[class*='resume']", "[class*='geek-detail']", "section", "article", "div"])) {
      const text = textOf(node);
      if (text.length < 80 || text.length > 12000 || isNavLike(text, node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 260 || rect.height < 180) continue;
      const scored = resumeModalScore(node);
      if (scored.score >= 60) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || (b.node.getBoundingClientRect().width * b.node.getBoundingClientRect().height) - (a.node.getBoundingClientRect().width * a.node.getBoundingClientRect().height));
  }

  function profilePanelScore(node) {
    const text = textOf(node);
    let score = 0;
    const reasons = [];
    if (parseNameFromText(text)) { score += 15; reasons.push("包含姓名"); }
    if (/\d{2}岁|\d+年|本科|大专|硕士|博士/.test(text)) { score += 15; reasons.push("包含基础信息"); }
    if (text.includes("期望职位")) { score += 25; reasons.push("包含期望职位"); }
    if (text.includes("工作经历")) { score += 25; reasons.push("包含工作经历"); }
    if (/技能标签|技能/.test(text)) { score += 10; reasons.push("包含技能"); }
    return { score, reason: reasons.join("；") || "未命中资料区特征" };
  }

  function profilePanelCandidates() {
    const nodes = [];
    for (const node of queryVisible([".resume-detail", ".geek-detail", ".candidate-detail", ".profile", "[class*='resume']", "[class*='geek']", "[class*='candidate']", "aside", "main", "section", "article", "div"])) {
      const text = textOf(node);
      if (text.length < 60 || text.length > 8000 || isNavLike(text, node)) continue;
      const scored = profilePanelScore(node);
      if (scored.score >= 45) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function chatHeaderScore(node) {
    const text = textOf(node);
    let score = 0;
    const reasons = [];
    if (parseNameFromText(text)) { score += 35; reasons.push("包含姓名"); }
    if (/今日活跃|刚刚活跃|在线|最近活跃/.test(text)) { score += 20; reasons.push("包含活跃状态"); }
    if (/\d{2}岁|\d+年|本科|大专|硕士|博士/.test(text)) { score += 20; reasons.push("包含年龄年限学历"); }
    if (/chat|conversation|message|user|header|name/i.test(`${node.className || ""} ${node.id || ""}`)) { score += 15; reasons.push("类名像聊天头部"); }
    const rect = node.getBoundingClientRect();
    if (rect.y < 260 && rect.width > 160) { score += 10; reasons.push("位于页面上方"); }
    return { score, reason: reasons.join("；") || "未命中聊天头部特征" };
  }

  function chatHeaderCandidates() {
    const nodes = [];
    for (const node of queryVisible([".chat-header", ".chat-user", ".conversation-header", ".message-header", "[class*='chat-header']", "[class*='conversation-header']", "[class*='chat-user']", "header", "div"])) {
      const text = textOf(node);
      if (text.length < 2 || text.length > 600 || isNavLike(text, node)) continue;
      const scored = chatHeaderScore(node);
      if (scored.score >= 45) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function selectedChatItemScore(node) {
    const text = textOf(node);
    let score = 0;
    const reasons = [];
    if (parseNameFromText(text)) { score += 35; reasons.push("包含姓名"); }
    if (/selected|active|current|cur/i.test(`${node.className || ""} ${node.id || ""}`)) { score += 25; reasons.push("当前选中类名"); }
    if (safeKeywords(text, SKILL_WORDS).length) { score += 10; reasons.push("包含职位/技能提示"); }
    const rect = node.getBoundingClientRect();
    if (rect.width < 520 && rect.height < 180) { score += 10; reasons.push("尺寸像聊天列表项"); }
    return { score, reason: reasons.join("；") || "未命中选中聊天项特征" };
  }

  function selectedChatItemCandidates() {
    const nodes = [];
    for (const node of queryVisible([".selected", ".active", "[class*='selected']", "[class*='active']", "[class*='current']", "li", "div"])) {
      const text = textOf(node);
      if (text.length < 2 || text.length > 420 || isNavLike(text, node)) continue;
      const scored = selectedChatItemScore(node);
      if (scored.score >= 45) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function sourceCandidateFromNode(item, source) {
    const raw = textOf(item.node);
    const basics = parsePersonBasics(raw);
    const expected = expectedParts(raw);
    const skills = safeKeywords(raw, SKILL_WORDS);
    const projectKeywords = safeKeywords(raw, PROJECT_WORDS);
    const currentTitle = expected.expected_position || (raw.match(/(?:当前职位|在职职位|求职意向|职位)[:：\s]*([^\n。；;|]{2,40})/) || ["", ""])[1] || "";
    return {
      ...emptyCandidate(source),
      ...basics,
      title: currentTitle,
      current_title: currentTitle,
      city: expected.expected_city || (raw.match(CITY_RE) || [""])[0],
      expected_position: expected.expected_position,
      expected_city: expected.expected_city,
      salary_expectation: expected.salary_expectation || (raw.match(/\d+\s*[-~]\s*\d+\s*[kK]|\d+\s*[kK]\s*[-~]\s*\d+\s*[kK]|\d+\s*万\s*[-~]\s*\d+\s*万/) || [""])[0],
      skills,
      project_keywords: projectKeywords,
      work_experiences: (raw.match(/工作经历[^]*?(?=项目经历|教育经历|技能标签|技能|$)/)?.[0] || "").split(/(?=\d{4}|\d+年|公司|项目)/).map(oneLine).filter((line) => line.length > 8).slice(0, 8),
      raw_text: source === "selected_chat_item" ? raw.slice(0, 500) : raw.slice(0, 5000),
      source,
      sources_used: [source],
      warnings: source === "resume_modal" || source === "profile_panel" ? [] : ["当前候选人信息不完整，请打开在线简历后再分析"],
    };
  }

  function visibleTextFallback() {
    const blocks = queryVisible(["main", "section", "article", "aside", "div", "p", "span"])
      .map((node) => textOf(node))
      .filter((text) => text.length > 10 && text.length < 1000 && !includesAny(text, NAV_WORDS))
      .join("\n");
    return { skills: safeKeywords(blocks, SKILL_WORDS), project_keywords: safeKeywords(blocks, PROJECT_WORDS), raw_text: blocks.slice(0, 1000) };
  }

  function completeAndScore(candidate) {
    const basicsCount = [candidate.age, candidate.experience_years, candidate.education].filter(Boolean).length;
    const complete = Boolean(candidate.name && basicsCount >= 2 && /期望职位|工作经历/.test(candidate.raw_text || ""));
    let confidence = 0;
    if (candidate.sources_used.includes("resume_modal")) confidence += 40;
    if (candidate.sources_used.includes("profile_panel")) confidence += 30;
    if (candidate.sources_used.includes("chat_header")) confidence += 20;
    if (candidate.sources_used.includes("selected_chat_item")) confidence += 10;
    if (candidate.name) confidence += 20;
    if (candidate.age) confidence += 5;
    if (candidate.experience_years) confidence += 5;
    if (candidate.education) confidence += 5;
    if (candidate.skills.length) confidence += 10;
    candidate.profile_complete = complete;
    candidate.confidence = Math.min(100, confidence);
    if (!complete && candidate.name && !candidate.warnings.includes("当前候选人信息不完整，请打开在线简历后再分析")) candidate.warnings.push("当前候选人信息不完整，请打开在线简历后再分析");
    return candidate;
  }

  function mergeCandidate(primary, supplements) {
    const result = { ...primary };
    for (const extra of supplements) {
      result.sources_used = uniq([...(result.sources_used || []), ...(extra.sources_used || [])]);
      for (const key of ["age", "experience_years"]) if (!result[key] && extra[key]) result[key] = extra[key];
      for (const key of ["education", "expected_position", "expected_city", "salary_expectation", "current_title", "title", "city"]) if (!result[key] && extra[key]) result[key] = extra[key];
      result.skills = uniq([...(result.skills || []), ...(extra.skills || [])]);
      result.project_keywords = uniq([...(result.project_keywords || []), ...(extra.project_keywords || [])]);
      result.work_experiences = uniq([...(result.work_experiences || []), ...(extra.work_experiences || [])]).slice(0, 8);
      result.warnings = uniq([...(result.warnings || []), ...(extra.warnings || [])]);
    }
    return completeAndScore(result);
  }

  function extractCandidate() {
    const debug = { resume_modal_candidates: [], profile_panel_candidates: [], chat_header_candidates: [], selected_chat_item_candidates: [] };
    try {
      const resumeItems = resumeModalCandidates();
      const profileItems = profilePanelCandidates();
      const headerItems = chatHeaderCandidates();
      const selectedItems = selectedChatItemCandidates();
      debug.resume_modal_candidates = resumeItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.profile_panel_candidates = profileItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.chat_header_candidates = headerItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.selected_chat_item_candidates = selectedItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));

      const sources = [];
      if (resumeItems[0]) sources.push(sourceCandidateFromNode(resumeItems[0], "resume_modal"));
      if (profileItems[0]) sources.push(sourceCandidateFromNode(profileItems[0], "profile_panel"));
      if (headerItems[0]) sources.push(sourceCandidateFromNode(headerItems[0], "chat_header"));
      if (selectedItems[0]) sources.push(sourceCandidateFromNode(selectedItems[0], "selected_chat_item"));

      const primary = sources.find((item) => item.name && item.source === "resume_modal")
        || sources.find((item) => item.name && item.source === "profile_panel")
        || sources.find((item) => item.name && item.source === "chat_header")
        || sources.find((item) => item.name && item.source === "selected_chat_item");
      const fallback = visibleTextFallback();
      debug.visible_text_fallback = { skills: fallback.skills, project_keywords: fallback.project_keywords, text_preview: fallback.raw_text.slice(0, 240) };

      if (!primary) {
        const candidate = { ...emptyCandidate("unknown"), skills: fallback.skills, project_keywords: fallback.project_keywords, raw_text: fallback.raw_text, sources_used: fallback.raw_text ? ["visible_text_fallback"] : [], warnings: ["未识别候选人姓名，请打开具体候选人聊天或在线简历"] };
        return { ok: false, candidate, warning: candidate.warnings[0], error: "未识别候选人姓名，请打开具体候选人聊天或在线简历", debug };
      }

      const candidate = mergeCandidate(primary, sources.filter((item) => item !== primary));
      candidate.skills = uniq([...candidate.skills, ...fallback.skills]);
      candidate.project_keywords = uniq([...candidate.project_keywords, ...fallback.project_keywords]);
      if (fallback.raw_text && !candidate.sources_used.includes("visible_text_fallback")) candidate.sources_used.push("visible_text_fallback");
      completeAndScore(candidate);
      return { ok: Boolean(candidate.name), candidate, warning: candidate.warnings[0] || "", error: candidate.name ? "" : "未识别候选人姓名", debug };
    } catch (e) {
      return { ok: false, candidate: emptyCandidate(), warning: "", error: `候选人抓取异常：${e.message || e}`, debug };
    }
  }

  function chatRootScore(node) {
    const text = textOf(node);
    const cls = String(node.className || "").toLowerCase();
    let score = 0;
    const reasons = [];
    const bubbleCount = node.querySelectorAll(".message, .chat-item, .im-message, [class*='message'], [class*='bubble']").length;
    if (bubbleCount >= 2) { score += 30; reasons.push(`气泡数${bubbleCount}`); }
    if (/chat|message|conversation|im/.test(cls)) { score += 25; reasons.push("类名像聊天窗口"); }
    if (/您好|熟悉|引擎|方便|项目|候选|回复|谢谢|你好/.test(text)) { score += 15; reasons.push("包含聊天语句"); }
    const rect = node.getBoundingClientRect();
    if (rect.width > 320 && rect.height > 260) { score += 15; reasons.push("中间大区域"); }
    if (queryVisible(["textarea", "[contenteditable='true']", "[role='textbox']"], node).length) { score += 15; reasons.push("包含输入框"); }
    if (rect.width < 260 || isNavLike(text, node)) score -= 40;
    return { score, reason: reasons.join("；") || "未命中聊天窗口特征" };
  }

  function chatMessageCandidates() {
    const roots = [];
    for (const node of queryVisible([".message-list", ".chat-message-list", ".im-message-list", ".chat-content", ".conversation-content", "[class*='message-list']", "[class*='chat-content']", "[class*='conversation']", "main", "section", "div"])) {
      const text = textOf(node);
      if (text.length < 30 || text.length > 10000) continue;
      const scored = chatRootScore(node);
      if (scored.score >= 35) roots.push({ node, ...scored });
    }
    return roots.sort((a, b) => b.score - a.score || b.node.getBoundingClientRect().height - a.node.getBoundingClientRect().height);
  }

  function extractChat() {
    const debug = { chat_message_candidates: [] };
    try {
      const roots = chatMessageCandidates();
      debug.chat_message_candidates = roots.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      const root = roots[0]?.node || null;
      const candidate = extractCandidate();
      if (!root) return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "unknown", error: "未检测到当前聊天窗口", debug };

      const messageNodes = queryVisible([".message", ".chat-item", ".im-message", "[class*='message-item']", "[class*='bubble']", "[class*='msg']"], root);
      const rawNodes = messageNodes.length ? messageNodes : Array.from(root.children).filter((node) => node instanceof Element && isVisible(node));
      const latest = rawNodes.map((node) => {
        const text = oneLine(node.innerText || node.textContent || "");
        const cls = String(node.className || "").toLowerCase();
        const role = /mine|self|right|hr|boss/.test(cls) ? "hr" : (/left|geek|candidate|other/.test(cls) ? "candidate" : "unknown");
        return { role, text };
      }).filter((item) => item.text.length > 1 && item.text.length < 1000 && !isNavLike(item.text, root) && !parseJobTitleFromText(item.text)).slice(-30);
      const text = latest.map((item) => item.text).join("\n");
      if (!text) return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "unknown", error: "未检测到当前聊天消息", debug };
      return { ok: true, candidate_name: candidate.candidate.name || "", text, latest_messages: latest, source: "chat_messages", error: "", debug };
    } catch (e) {
      return { ok: false, candidate_name: "", text: "", latest_messages: [], source: "unknown", error: `聊天抓取异常：${e.message || e}`, debug };
    }
  }

  function detectPageType() {
    const body = textOf(document.body).slice(0, 8000);
    if (/\/web\/chat/.test(location.href) || chatMessageCandidates()[0] || chatJobCardCandidates()[0] || body.includes("沟通")) return "chat_page";
    if (/职位描述|任职要求|发布职位|招聘中|岗位职责/.test(body)) return "job_page";
    if (/期望职位|工作经历|教育经历/.test(body)) return "candidate_page";
    return "unknown";
  }

  function extractPageContext() {
    try {
      const jobRes = extractJob();
      const candidateRes = extractCandidate();
      const chatRes = extractChat();
      const warnings = [];
      if (!jobRes.ok) warnings.push("未识别当前沟通岗位，请确认聊天中有岗位卡或手动配置岗位");
      if (!candidateRes.ok) warnings.push("未识别候选人姓名，请打开具体候选人聊天或在线简历");
      if (candidateRes.warning) warnings.push(candidateRes.warning);
      if (!chatRes.ok && detectPageType() === "chat_page") warnings.push(chatRes.error || "未检测到当前聊天窗口");
      const job = jobRes.job || emptyJob();
      const candidate = candidateRes.candidate || emptyCandidate();
      const base = candidate.name ? `${candidate.name}|${job.title || ""}|${location.href}` : `${document.title}|${location.href}`;
      return {
        ok: true,
        page_type: detectPageType(),
        url: location.href,
        title: document.title,
        job,
        candidate,
        chat: { candidate_name: chatRes.candidate_name || candidate.name || "", messages_text: chatRes.text || "", latest_messages: chatRes.latest_messages || [], source: chatRes.source || "unknown" },
        context_id: simpleHash(base),
        warnings: uniq(warnings),
      };
    } catch (e) {
      return { ok: true, page_type: "unknown", url: location.href, title: document.title, job: emptyJob(), candidate: emptyCandidate(), chat: { candidate_name: "", messages_text: "", latest_messages: [], source: "unknown" }, context_id: simpleHash(`${document.title}|${location.href}`), warnings: [`页面上下文抓取异常：${e.message || e}`] };
    }
  }

  function inputCandidates() {
    const searchWords = ["搜索", "搜索牛人", "搜索职位", "搜索聊天"];
    return queryVisible(["textarea", "[contenteditable='true']", "[role='textbox']", "input[type='text']", ".ql-editor", ".ProseMirror"])
      .filter((el) => {
        const placeholder = el.getAttribute("placeholder") || "";
        const meta = `${el.className || ""} ${el.id || ""} ${placeholder} ${el.getAttribute("role") || ""}`;
        if (includesAny(placeholder, searchWords) || /search|搜索/.test(meta)) return false;
        if (isExtensionDom(el)) return false;
        return true;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const meta = `${el.className || ""} ${el.id || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("role") || ""}`.toLowerCase();
        let score = 0;
        const reasons = [];
        if (/message|chat|input|editor|reply|发送|沟通/.test(meta)) { score += 30; reasons.push("类名/属性像聊天输入"); }
        if (el.tagName === "TEXTAREA") { score += 20; reasons.push("textarea"); }
        if (el.isContentEditable || el.getAttribute("contenteditable") === "true") { score += 15; reasons.push("contenteditable"); }
        if (el.getAttribute("role") === "textbox") { score += 15; reasons.push("role=textbox"); }
        if (rect.y > window.innerHeight * 0.45) { score += 15; reasons.push("位于页面下半部分"); }
        if (rect.width > 180) { score += 5; reasons.push("宽度适合输入"); }
        return { el, score, reason: reasons.join("；") };
      })
      .sort((a, b) => b.score - a.score);
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
    try { el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text })); } catch {}
  }

  function fillGreeting(text) {
    try {
      const candidates = inputCandidates();
      const target = candidates[0]?.el;
      if (target) {
        const method = target.tagName === "TEXTAREA" ? "textarea" : (target.tagName === "INPUT" ? "input" : (target.getAttribute("role") === "textbox" ? "role-textbox" : "contenteditable"));
        setNativeValue(target, text || "");
        return { ok: true, target_found: true, method, filled_text_preview: (text || "").slice(0, 40) };
      }
      return {
        ok: false,
        error: "未找到可输入的聊天框",
        debug: {
          textarea_count: document.querySelectorAll("textarea").length,
          input_count: document.querySelectorAll("input").length,
          contenteditable_count: document.querySelectorAll("[contenteditable='true']").length,
          textbox_count: document.querySelectorAll("[role='textbox']").length,
          candidates: candidates.slice(0, 20).map((item) => debugNode(item.el, item.score, item.reason)),
        },
      };
    } catch (e) {
      return { ok: false, error: `填入输入框异常：${e.message || e}`, debug: {} };
    }
  }

  function visibleBlocks() {
    const blocks = [];
    for (const node of queryVisible(["main", "section", "article", "aside", "div", "li", "p"])) {
      const text = textOf(node);
      if (text.length < 10 || text.length > 400 || isNavLike(text, node)) continue;
      blocks.push({ ...debugNode(node, 0, "visible_block"), tag: node.tagName.toLowerCase() });
      if (blocks.length >= 100) break;
    }
    return blocks;
  }

  function debugDom() {
    try {
      const job = extractJob();
      const candidate = extractCandidate();
      const chat = extractChat();
      return {
        ok: true,
        url: location.href,
        title: document.title,
        page_type: detectPageType(),
        visible_blocks: visibleBlocks(),
        chat_job_card_candidates: chatJobCardCandidates().slice(0, 20).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title })),
        resume_modal_candidates: resumeModalCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        profile_panel_candidates: profilePanelCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_header_candidates: chatHeaderCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        selected_chat_item_candidates: selectedChatItemCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_message_candidates: chatMessageCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        input_candidates: inputCandidates().slice(0, 20).map((item) => debugNode(item.el, item.score, item.reason)),
        candidate_extraction_debug: candidate,
        job_extraction_debug: job,
        chat_extraction_debug: chat,
      };
    } catch (e) {
      return { ok: false, error: `DOM 调试异常：${e.message || e}`, url: location.href, title: document.title, debug: { stack: e.stack || "" } };
    }
  }

  function safeHandle(message, sender, sendResponse) {
    try {
      if (message?.type === "PING") sendResponse({ ok: true, message: "content alive", url: location.href, title: document.title });
      else if (message?.type === "DEBUG_DOM") sendResponse(debugDom());
      else if (message?.type === "EXTRACT_PAGE_CONTEXT") sendResponse(extractPageContext());
      else if (message?.type === "EXTRACT_JOB") sendResponse(extractJob());
      else if (message?.type === "EXTRACT_CANDIDATE") sendResponse(extractCandidate());
      else if (message?.type === "EXTRACT_CHAT") sendResponse(extractChat());
      else if (message?.type === "FILL_GREETING") sendResponse(fillGreeting(message.text || ""));
      else sendResponse({ ok: false, error: `未知消息类型: ${message?.type || "empty"}`, debug: { url: location.href, title: document.title } });
    } catch (e) {
      sendResponse({ ok: false, error: `content.js handler 异常：${e.message || e}`, debug: { type: message?.type || "", url: location.href, title: document.title, stack: e.stack || "" } });
    }
    return true;
  }

  chrome.runtime.onMessage.addListener(safeHandle);
  window[LISTENER_KEY] = safeHandle;
  window.__AI_RECRUIT_ASSISTANT_CONTENT_READY__ = true;
})();
