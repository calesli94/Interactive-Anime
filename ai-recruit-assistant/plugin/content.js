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

  const NAV_WORDS = ["全部职位", "未读", "牛人已读未回", "批量", "职位管理", "推荐牛人", "深度搜索", "搜索", "沟通", "意向沟通", "牛人管理", "我的客服", "招聘规范", "项目外包", "直播招聘", "招聘数据", "VIP", "面试", "账号", "导航", "更多", "客服", "消息", "招聘统计", "扫码登录", "充值"];
  const CHAT_LIST_CLASS_BLACKLIST = ["chat-user", "user-container", "user-list", "chat-top-filter", "chat-message-filter", "chat-message-filter-left", "boss-menu", "sidebar", "nav", "menu", "filter", "search", "recommend", "job-list"];
  const CHAT_LIST_LAYOUT_CLASS_BLACKLIST = ["side", "sidebar", "nav", "menu", "filter", "search", "recommend", "job-list"];
  const CHAT_LIST_TEXT_BLACKLIST = ["全部职位", "未读", "牛人已读未回", "批量", "职位管理", "推荐牛人", "深度搜索", "搜索", "意向沟通", "牛人管理", "我的客服", "招聘规范"];
  const BAD_NAMES = ["BOSS直聘", "AI招聘助手", "职位管理", "推荐牛人", "沟通", "搜索", "当前候选人", "期望职位", "工作经历", "教育经历", "招聘规范", "我的客服", "面试", "招聘助手", "在线简历", "简历", "未识别", "本科", "大专", "硕士", "博士", "高中", "中专", "招聘", "游戏", "上海", "北京", "广州", "深圳", "杭州"];
  const NAME_FORBIDDEN_WORDS = ["本科", "大专", "硕士", "博士", "高中", "中专", "10年以上", "5年", "3年", "1年", "39岁", "28岁", "23岁", "刚刚活跃", "今日活跃", "3日内活跃", "在线", "离职-随时到岗", "在职-月内到岗", "期望职位", "工作经历", "教育经历", "招聘", "高招", "游戏", "上海", "北京", "广州", "深圳", "杭州", "公司", "有限", "网络", "科技", "互娱", "传媒", "大学", "学院", "网易", "趣加", "三七互娱", "FunPlus"];
  const JOB_FORBIDDEN = [...NAV_WORDS, "道具", "意向沟通", "牛人", "人才", "聊天"];
  const JOB_AREA_SIGNALS = ["职位描述", "岗位职责", "任职要求", "技能要求", "加分项", "工作内容", "职位要求", "你将负责", "我们希望你", "工作地点", "薪资", "发布职位", "招聘中", "沟通的职位", "沟通职位", "沟通的岗位", "项目方向"];
  const RESUME_SIGNALS = ["期望职位", "工作经历", "教育经历", "项目经历", "技能标签", "技能", "在职", "到岗", "刚刚活跃", "今日活跃", "交换微信", "约面试"];
  const SKILL_WORDS = ["招聘", "高招", "猎头", "高端招聘", "人才地图", "Mapping", "人才资源", "HRBP", "人力资源", "UE", "Unreal", "虚幻", "Maya", "ZBrush", "Substance", "Blender", "原画", "角色原画", "角色设计", "场景", "场景设计", "道具设计", "动画", "动画设计", "二维动画设计", "分镜", "特效", "3D", "3D设计", "TA", "技术美术", "AIGC", "SAI", "Photoshop", "PhotoShop", "PS", "CSP", "csp", "AE", "Spine", "Unity", "Shader", "Python", "ComfyUI", "Stable Diffusion", "SD", "Midjourney", "剪辑", "AI视频", "AI绘画", "AI工具", "游戏美术", "美宣"];
  const PROJECT_WORDS = ["游戏", "趣加", "趣加科技", "网易", "网易游戏", "三七互娱", "3A", "次世代", "手游", "端游", "游戏美术", "角色", "场景", "道具", "美宣", "外包", "商业化皮肤", "角色原画", "道具设计", "二维动画设计", "AI视频", "AIGC", "高端招聘", "人才地图", "Mapping"];
  const CITY_RE = /上海|北京|广州|深圳|杭州|成都|武汉|苏州|南京|重庆|厦门|长沙|西安|天津|合肥|郑州|远程|青岛|宁波|佛山|东莞/;
  const SALARY_RE = /(?:面议|\d+\s*[kK]\s*[-~—至]\s*\d+\s*[kK](?:\s*[·・]\s*\d+薪)?|\d+\s*[-~—至]\s*\d+\s*[kK](?:\s*[·・]\s*\d+薪)?|\d+\s*万\s*[-~—至]\s*\d+\s*万)/;
  const JOB_EXP_RE = /(?:经验不限|\d+\s*[-~—至]\s*\d+\s*年|\d+\s*年以上|\d+\s*年)/;
  const EDU_REQ_RE = /学历不限|大专|本科|硕士|博士|高中|中专/;
  const COMPANY_NAME_RE = /公司|有限|网络|科技|互娱|传媒|大学|学院|网易|趣加|三七互娱|FunPlus|北京趣加科技有限公司|网易（杭州）网络有限公司/i;
  const JOB_TITLE_LABEL_BLACKLIST = ["薪资范围", "职位详情", "岗位职责", "职位职责", "工作内容", "工作地址", "工作地点", "任职要求", "职位要求", "技能要求", "加分项", "薪资详情", "展开全部", "职位描述", "项目方向"];
  const RESUME_SKILL_ALLOWLIST = ["UE", "Unreal", "Unity", "Shader", "Python", "Photoshop", "Spine", "Maya", "Blender", "ZBrush", "Substance", "Stable Diffusion", "ComfyUI", "Midjourney", "剪辑", "分镜", "镜头语言", "Maya", "AE", "C4D", "Houdini", "CSP", "SAI", "PS"];
  const RESUME_SKILL_DENYLIST = ["招聘", "高招", "猎头", "本科", "大专", "硕士", "博士", "上海", "北京", "广州", "深圳", "10年以上", "5年", "3年", "1年", "面议"];

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



  function classTokensOf(el) {
    const raw = `${el?.className || ""} ${el?.id || ""}`.toLowerCase();
    return raw.split(/[^a-z0-9_-]+/).filter(Boolean);
  }

  function hasClassToken(el, tokens) {
    const classTokens = classTokensOf(el);
    return tokens.some((token) => classTokens.some((item) => item === token || item.includes(token)));
  }

  function isLeftListGeometry(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return false;
    return rect.width > 0 && rect.left < 620 && rect.width < 560;
  }

  function isChatListOrNavigationElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const text = oneLine(el.innerText || el.textContent || "");
    const rect = el.getBoundingClientRect();
    if (hasClassToken(el, ["chat-user", "user-container", "user-list", "chat-top-filter", "chat-message-filter", "chat-message-filter-left", "boss-menu"])) return true;
    if (isLeftListGeometry(el) && hasClassToken(el, CHAT_LIST_LAYOUT_CLASS_BLACKLIST)) return true;
    if (isLeftListGeometry(el) && CHAT_LIST_TEXT_BLACKLIST.some((word) => text.includes(word) && text.length < 1200)) return true;
    if (isLeftListGeometry(el) && /(已读|送达|未读|沟通的职位|沟通职位)/.test(text)) return true;
    if (rect.left < 620 && el.closest?.(".chat-user, .user-container, .user-list, .chat-top-filter, .chat-message-filter, .chat-message-filter-left, .boss-menu")) return true;
    if (rect.left < 620 && el.closest?.(".sidebar, .side, .nav, .menu, .filter, .search, .recommend, .job-list")) return true;
    return false;
  }

  function activeChatPanelScore(node) {
    const text = textOf(node);
    const rect = node.getBoundingClientRect();
    const meta = `${node.className || ""} ${node.id || ""}`.toLowerCase();
    let score = 0;
    const reasons = [];
    const bubbleCount = node.querySelectorAll(".message, .chat-item, .im-message, [class*='message-item'], [class*='bubble'], [class*='msg']").length;
    const inputCount = queryVisible(["textarea", "[contenteditable='true']", "[role='textbox']"], node).filter((el) => !isChatListOrNavigationElement(el)).length;
    const actionHits = ["问意向", "求简历", "换电话", "换微信", "约面试", "不合适", "发送", "常用语"].filter((word) => text.includes(word));
    if (rect.width > 400) { score += 25; reasons.push("宽度大于400"); }
    if (rect.left > 600 || rect.x > 600) { score += 25; reasons.push("位于左侧列表右侧"); }
    else if (rect.left > 420 && rect.width > 520) { score += 15; reasons.push("明显大于左侧列表区域"); }
    if (bubbleCount > 0) { score += Math.min(30, bubbleCount * 4); reasons.push(`聊天气泡${bubbleCount}`); }
    if (inputCount > 0) { score += 25; reasons.push("包含聊天输入框"); }
    if (actionHits.length) { score += 20; reasons.push(`包含聊天动作：${actionHits.join("/")}`); }
    if (/chat|message|conversation|im/.test(meta)) { score += 10; reasons.push("类名像聊天主窗口"); }
    if (/今日活跃|刚刚活跃|在线|最近活跃|\d{2}岁|本科|大专/.test(text) && rect.y < 260) { score += 10; reasons.push("包含当前候选人顶部信息"); }
    if (isChatListOrNavigationElement(node)) { score -= 100; reasons.push("命中左侧列表/导航黑名单"); }
    return { score, reason: reasons.join("；") || "未命中当前聊天主窗口特征" };
  }

  function activeChatPanelAnchorNodes() {
    const anchors = [];
    for (const node of queryVisible([
      ".message-item", ".item-friend", ".item-myself", ".base-info-single-top", ".base-info-single-top-detail",
      ".experience-content", ".position-item.expect", ".resume-btn-content", ".chat-message-list", ".message-list",
      "[class*='message-item']", "[class*='base-info-single']", "[class*='experience-content']", "[class*='position-item']",
      "textarea", "[contenteditable='true']", "[role='textbox']",
    ])) {
      const rect = node.getBoundingClientRect();
      if (rect.left > 620 && rect.width > 80 && !isChatListOrNavigationElement(node) && !anchors.includes(node)) anchors.push(node);
    }
    return anchors;
  }

  function addPanelCandidateFromNode(node, out) {
    let current = node;
    for (let depth = 0; current && current instanceof Element && depth < 8; depth += 1, current = current.parentElement) {
      if (out.includes(current) || isExtensionDom(current) || isChatListOrNavigationElement(current)) continue;
      const rect = current.getBoundingClientRect();
      if (rect.width >= 400 && rect.height >= 120 && rect.left > 560) out.push(current);
    }
  }

  function activeChatPanelCandidates() {
    const nodes = [];
    for (const anchor of activeChatPanelAnchorNodes()) addPanelCandidateFromNode(anchor, nodes);
    for (const node of queryVisible([".chat-main", ".chat-panel", ".chat-container", ".conversation-main", ".message-container", ".im-chat", "[class*='chat-main']", "[class*='conversation']", "[class*='message-container']", "main", "section", "div"])) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 400 && rect.height >= 120 && rect.left > 560 && !nodes.includes(node) && !isChatListOrNavigationElement(node) && !isExtensionDom(node)) nodes.push(node);
    }
    return nodes
      .map((node) => ({ node, ...activeChatPanelScore(node) }))
      .filter((item) => item.score >= 45)
      .sort((a, b) => b.score - a.score || (b.node.getBoundingClientRect().height * b.node.getBoundingClientRect().width) - (a.node.getBoundingClientRect().height * a.node.getBoundingClientRect().width));
  }

  function findActiveChatMainPanel() {
    return activeChatPanelCandidates()[0]?.node || null;
  }

  function rejectedChatListBlocks() {
    const nodes = [];
    for (const node of queryVisible([".chat-user", ".user-container", ".user-list", ".chat-top-filter", ".chat-message-filter", ".chat-message-filter-left", "[class*='chat-user']", "[class*='user-container']", "[class*='user-list']", "[class*='chat-message-filter']", "[class*='boss-menu']", "[class*='sidebar']", "[class*='side']", "[class*='job-list']", "nav", "aside", "div", "li"])) {
      if (isChatListOrNavigationElement(node) && !nodes.includes(node)) nodes.push(node);
      if (nodes.length >= 30) break;
    }
    return nodes;
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

  function parseExperience(text) {
    const source = oneLine(text);
    if (/\d{2}\s*年应届生|应届生/.test(source)) return { experience_years: 0, experience_years_text: "应届生" };
    if (/无经验/.test(source)) return { experience_years: 0, experience_years_text: "无经验" };
    const range = source.match(/(\d+)\s*[-~—至]\s*(\d+)\s*年/);
    if (range) return { experience_years: Number.parseInt(range[1], 10) || 0, experience_years_text: `${range[1]}-${range[2]}年` };
    const over = source.match(/(\d+)\s*年以上/);
    if (over) return { experience_years: Number.parseInt(over[1], 10) || 0, experience_years_text: `${over[1]}年以上` };
    const exact = source.match(/(?:^|\s|\||｜)(\d+)\s*年(?:经验|工作经验)?(?:\s|\||｜|$)/);
    if (exact) return { experience_years: Number.parseInt(exact[1], 10) || 0, experience_years_text: `${exact[1]}年` };
    return { experience_years: null, experience_years_text: "" };
  }

  function parseYears(text) {
    return parseExperience(text).experience_years;
  }

  function parseEducation(text) {
    return (String(text || "").match(/学历不限|大专|本科|硕士|博士|研究生|中专|高中/) || [""])[0];
  }

  function isForbiddenName(value) {
    const name = oneLine(value).replace(/[：:，,。；;|｜]+$/g, "");
    if (!name || BAD_NAMES.includes(name) || NAME_FORBIDDEN_WORDS.includes(name) || includesAny(name, NAV_WORDS)) return true;
    if (COMPANY_NAME_RE.test(name)) return true;
    if (/^\d+/.test(name) || /岁|年|活跃|到岗|在线|学历|经验|职位|岗位|经历|薪|[Kk]$/.test(name)) return true;
    if (/^(本科|大专|硕士|博士|高中|中专|学历不限|招聘|高招|游戏|上海|北京|广州|深圳|杭州|成都|武汉|苏州|南京|重庆|厦门|长沙|西安|天津|合肥|郑州|远程)$/.test(name)) return true;
    return false;
  }

  function isValidHeaderNameToken(token) {
    const name = oneLine(token).replace(/^[姓名候选人联系人：:\s]+/, "").replace(/[：:，,。；;|｜]+$/g, "");
    if (!name || isForbiddenName(name)) return false;
    return /^[\u4e00-\u9fa5]{1,3}(?:先生|女士)$/.test(name) || /^[\u4e00-\u9fa5]{2,4}$/.test(name);
  }

  function extractNameFromHeaderText(text) {
    const source = cleanText(text).replace(/^[姓名候选人联系人：:\s]+/, "");
    const first = source.split(/[\s|｜\n\r,，]+/).map(oneLine).find(Boolean) || "";
    const token = first.replace(/^[姓名候选人联系人：:\s]+/, "").replace(/[：:，,。；;|｜]+$/g, "");
    return isValidHeaderNameToken(token) ? token : "";
  }

  function parseNameFromText(text) {
    return extractNameFromHeaderText(text);
  }

  function parsePersonBasics(text) {
    const exp = parseExperience(text);
    return {
      name: parseNameFromText(text),
      age: parseAge(text),
      experience_years: exp.experience_years,
      experience_years_text: exp.experience_years_text,
      education: parseEducation(text),
    };
  }

  function emptyJob(source = "unknown") {
    return { title: "", city: "", salary: "", experience_required: "", education_required: "", description: "", responsibilities: [], requirements: [], preferred_keywords: [], keywords: [], raw_text: "", source, jd_complete: false, warning: "" };
  }

  function emptyCandidate(source = "unknown") {
    return {
      name: "",
      age: null,
      experience_years: null,
      experience_years_text: "",
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

  function pickJobDebug(job) {
    return {
      title: job?.title || "",
      city: job?.city || "",
      salary: job?.salary || "",
      education_required: job?.education_required || "",
      experience_required: job?.experience_required || "",
      source: job?.source || "",
      jd_complete: Boolean(job?.jd_complete),
    };
  }

  function pickCandidateDebug(candidate) {
    return {
      name: candidate?.name || "",
      age: candidate?.age || null,
      experience_years: candidate?.experience_years ?? null,
      experience_years_text: candidate?.experience_years_text || "",
      education: candidate?.education || "",
      source: candidate?.source || "",
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

  function cleanJobTitleCandidate(value) {
    return oneLine(value)
      .replace(SALARY_RE, "")
      .replace(CITY_RE, "")
      .replace(EDU_REQ_RE, "")
      .replace(JOB_EXP_RE, "")
      .replace(/[：:\s]+$/g, "")
      .replace(/^[：:\s]+/g, "")
      .trim();
  }

  function isForbiddenJobTitleLabel(value) {
    const title = cleanJobTitleCandidate(value);
    if (!title) return true;
    return JOB_TITLE_LABEL_BLACKLIST.some((label) => title === label || title.startsWith(`${label}:`) || title.startsWith(`${label}：`));
  }

  function isValidJobTitle(title) {
    const value = cleanJobTitleCandidate(title);
    if (!value || value.length < 2 || value.length > 80) return false;
    if (isForbiddenJobTitleLabel(value)) return false;
    if (JOB_FORBIDDEN.some((word) => value === word || (value.includes(word) && value.length <= word.length + 2))) return false;
    if (/^(职位|岗位|沟通|搜索|更多|账号|导航|薪资范围)$/.test(value)) return false;
    return true;
  }

  function extractJobTitleFromModal(rawText) {
    const raw = cleanText(rawText);
    const topLines = linesOf(raw).slice(0, 18).filter((line) => !includesAny(line, NAV_WORDS));
    for (const line of topLines) {
      const salary = (line.match(SALARY_RE) || [""])[0];
      if (!salary) continue;
      const beforeSalary = cleanJobTitleCandidate(line.slice(0, line.indexOf(salary)));
      if (isValidJobTitle(beforeSalary)) return beforeSalary;
    }
    const salaryIndex = topLines.findIndex((line) => SALARY_RE.test(line));
    if (salaryIndex > 0) {
      const previous = cleanJobTitleCandidate(topLines[salaryIndex - 1]);
      if (isValidJobTitle(previous)) return previous;
    }
    for (const line of topLines) {
      const title = cleanJobTitleCandidate(line);
      if (isValidJobTitle(title) && !/薪资范围|职位详情|岗位职责|任职要求|工作地址|薪资详情|展开全部/.test(title)) return title;
    }
    return "";
  }

  function parseJobModalTop(rawText) {
    const raw = cleanText(rawText);
    const topLines = linesOf(raw).slice(0, 16).filter((line) => !includesAny(line, NAV_WORDS));
    const compactTop = oneLine(topLines.join(" "));
    const salary = (compactTop.match(SALARY_RE) || raw.match(SALARY_RE) || [""])[0].replace(/\s+/g, "");
    const title = extractJobTitleFromModal(raw);
    const metaLine = topLines.find((line) => CITY_RE.test(line) && (EDU_REQ_RE.test(line) || JOB_EXP_RE.test(line) || SALARY_RE.test(line))) || compactTop;
    const addressLine = linesOf(raw).find((line) => /工作地址|工作地点|地址/.test(line) && CITY_RE.test(line)) || "";
    return {
      title,
      city: (metaLine.match(CITY_RE) || addressLine.match(CITY_RE) || raw.match(CITY_RE) || [""])[0],
      salary,
      education_required: (metaLine.match(EDU_REQ_RE) || raw.match(EDU_REQ_RE) || [""])[0],
      experience_required: (metaLine.match(JOB_EXP_RE) || raw.match(JOB_EXP_RE) || [""])[0],
    };
  }

  function jobDetailModalScore(node) {
    const text = textOf(node);
    const parsed = parseJobModalTop(text);
    const signals = ["薪资详情", "职位详情", "职位描述", "岗位职责", "职位职责", "工作内容", "任职要求", "职位要求", "技能要求", "工作地址", "工作地点"].filter((word) => text.includes(word));
    const rect = node.getBoundingClientRect();
    let score = signals.length * 18;
    const reasons = [];
    if (signals.length) reasons.push(`岗位详情信号：${signals.join("/")}`);
    if (parsed.title) { score += 20; reasons.push(`标题：${parsed.title}`); }
    if (parsed.salary) { score += 20; reasons.push(`薪资：${parsed.salary}`); }
    if (parsed.city) { score += 10; reasons.push(`城市：${parsed.city}`); }
    if (/modal|dialog|drawer|job|position/i.test(`${node.className || ""} ${node.id || ""}`)) { score += 10; reasons.push("类名像岗位详情"); }
    if (rect.width > 360 && rect.height > 220) { score += 5; reasons.push("面积像详情区域"); }
    return { ...parsed, score, reason: reasons.join("；") || "未命中岗位详情特征" };
  }

  function jobDetailModalCandidates() {
    const nodes = [];
    for (const node of queryVisible(["[role='dialog']", ".modal", ".dialog", ".drawer", ".job-detail", ".position-detail", ".job-sec", ".job-box", "[class*='modal']", "[class*='dialog']", "[class*='drawer']", "[class*='job-detail']", "[class*='position-detail']", "main", "section", "article", "div"])) {
      const text = textOf(node);
      if (text.length < 60 || text.length > 16000 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
      if (!/(薪资详情|职位详情|职位描述|岗位职责|职位职责|工作内容|你将负责|任职要求|职位要求|技能要求|我们希望你|工作地址|工作地点)/.test(text)) continue;
      if (/期望职位|工作经历|教育经历/.test(text) && !/职位详情|岗位职责|任职要求|工作地址/.test(text)) continue;
      const scored = jobDetailModalScore(node);
      if (scored.score >= 55 && scored.title && (scored.salary || /岗位职责|任职要求|职位描述/.test(text))) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function chatJobCardCandidates(root = document) {
    const candidates = [];
    const selectors = [
      ".message-list *", ".chat-content *", ".im-message-list *", ".conversation-content *",
      "[class*='message'] *", "[class*='bubble'] *", "[class*='card']", "[class*='job']", "div", "li", "section",
    ];
    for (const node of queryVisible(selectors, root)) {
      const text = textOf(node);
      if (text.length < 4 || text.length > 300 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
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
      if (text.length < 20 || text.length > 5000 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
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

  function collectSectionLines(rawText, headers, stopHeaders) {
    const lines = linesOf(rawText).filter((line) => !includesAny(line, NAV_WORDS));
    const out = [];
    let active = false;
    for (const line of lines) {
      if (headers.some((pattern) => pattern.test(line))) {
        active = true;
        const stripped = line.replace(new RegExp(headers.map((p) => p.source).join("|")), "").replace(/^[:：\s]+/, "").trim();
        if (stripped && stripped.length > 2) out.push(stripped);
        continue;
      }
      if (active && stopHeaders.some((pattern) => pattern.test(line))) break;
      if (active && line.length >= 2 && line.length <= 220) out.push(line);
      if (out.length >= 16) break;
    }
    return uniq(out).slice(0, 16);
  }

  function splitJobDetail(rawText) {
    const responsibilities = collectSectionLines(
      rawText,
      [/岗位职责/, /职位职责/, /工作内容/, /你将负责/, /职位描述/, /项目方向/],
      [/任职要求/, /职位要求/, /技能要求/, /我们希望你/, /加分项/, /工作地址/, /薪资详情/],
    );
    const requirements = collectSectionLines(
      rawText,
      [/任职要求/, /职位要求/, /技能要求/, /我们希望你/, /加分项/],
      [/岗位职责/, /职位职责/, /工作内容/, /你将负责/, /职位描述/, /工作地址/, /薪资详情/],
    );
    const lines = linesOf(rawText).filter((line) => !includesAny(line, NAV_WORDS));
    const fallbackResponsibilities = lines.filter((line) => /负责|推进|完成|参与|协作/.test(line)).slice(0, 12);
    const fallbackRequirements = lines.filter((line) => /要求|熟悉|经验|能力|优先|掌握|本科|大专/.test(line)).slice(0, 16);
    const preferred_keywords = uniq([...safeKeywords(rawText, [...SKILL_WORDS, ...PROJECT_WORDS]), ...lines.filter((line) => /加分项|优先|项目方向/.test(line)).slice(0, 8)]);
    return {
      responsibilities: responsibilities.length ? responsibilities : fallbackResponsibilities,
      requirements: requirements.length ? requirements : fallbackRequirements,
      preferred_keywords,
    };
  }

  function buildJobFromCandidate(item, source) {
    const rawText = textOf(item.node);
    const detail = splitJobDetail(rawText);
    const modalParsed = source === "job_detail_modal" ? parseJobModalTop(rawText) : {};
    const jdComplete = source === "job_detail_modal" ? Boolean((modalParsed.title || item.title) && rawText.length > 80 && (detail.responsibilities.length || detail.requirements.length)) : (source !== "chat_job_card" && Boolean(rawText && (detail.responsibilities.length || detail.requirements.length || /职位描述|岗位职责|任职要求|技能要求|加分项|工作内容|职位要求|你将负责|我们希望你/.test(rawText))));
    return {
      title: modalParsed.title || item.title,
      city: source === "chat_job_card" ? "" : (modalParsed.city || (rawText.match(CITY_RE) || [""])[0]),
      salary: source === "chat_job_card" ? "" : (modalParsed.salary || (rawText.match(SALARY_RE) || [""])[0]),
      experience_required: source === "chat_job_card" ? "" : (modalParsed.experience_required || (rawText.match(JOB_EXP_RE) || [""])[0]),
      education_required: source === "chat_job_card" ? "" : (modalParsed.education_required || (rawText.match(EDU_REQ_RE) || [""])[0]),
      description: jdComplete ? rawText.slice(0, 1600) : "",
      responsibilities: jdComplete ? detail.responsibilities : [],
      requirements: jdComplete ? detail.requirements : [],
      preferred_keywords: jdComplete ? detail.preferred_keywords : [],
      keywords: safeKeywords(rawText, [...SKILL_WORDS, ...PROJECT_WORDS]),
      raw_text: rawText,
      source: source === "job_detail_modal" ? "job_detail_modal" : (jdComplete ? "job_detail" : source),
      jd_complete: jdComplete,
      warning: jdComplete ? "" : "当前页面仅识别到岗位名称，未识别岗位职责和任职要求，请打开该岗位详情页或手动补充岗位要求",
    };
  }

  function extractJob() {
    const debug = { job_detail_modal_candidates: [], chat_job_card_candidates: [], job_area_candidates: [], active_chat_panel_candidates: [], rejected_chat_list_blocks: [], job_parse_result: null };
    try {
      debug.rejected_chat_list_blocks = rejectedChatListBlocks().slice(0, 20).map((node) => debugNode(node, 0, "rejected_chat_list"));
      const modalItems = jobDetailModalCandidates();
      debug.job_detail_modal_candidates = modalItems.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title, parsed_city: item.city, parsed_salary: item.salary, parsed_experience: item.experience_required, parsed_education: item.education_required }));
      if (modalItems[0]) {
        const job = buildJobFromCandidate(modalItems[0], "job_detail_modal");
        debug.job_parse_result = pickJobDebug(job);
        return { ok: true, job, error: "", debug };
      }
      const isChatPage = /\/web\/chat/.test(location.href) || activeChatPanelCandidates().length > 0;
      if (isChatPage) {
        const panelItems = activeChatPanelCandidates();
        debug.active_chat_panel_candidates = panelItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
        const panel = panelItems[0]?.node || null;
        if (!panel) return { ok: false, job: emptyJob("chat_active_panel_missing"), error: "未在当前聊天窗口识别到沟通岗位，请确认当前对话中有岗位卡或手动配置岗位", debug };
        const cards = chatJobCardCandidates(panel);
        debug.chat_job_card_candidates = cards.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title }));
        if (cards[0]) { const job = buildJobFromCandidate(cards[0], "chat_job_card"); debug.job_parse_result = pickJobDebug(job); return { ok: true, job, error: "", debug }; }
        return { ok: false, job: emptyJob("chat_job_card_missing"), error: "未在当前聊天窗口识别到沟通岗位，请确认当前对话中有岗位卡或手动配置岗位", debug };
      }

      const areas = jobAreaCandidates();
      debug.job_area_candidates = areas.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title }));
      if (areas[0]) { const job = buildJobFromCandidate(areas[0], "job_area"); debug.job_parse_result = pickJobDebug(job); return { ok: true, job, error: "", debug }; }
      return { ok: false, job: emptyJob(), error: "未识别当前沟通岗位", debug };
    } catch (e) {
      return { ok: false, job: emptyJob(), error: `岗位抓取异常：${e.message || e}`, debug };
    }
  }

  function expectedParts(text) {
    const line = linesOf(text).find((item) => /期望职位|期望[:：]/.test(item)) || "";
    const normalized = line.replace(/^(期望职位|期望)[:：\s]*/, "").replace(/期望职位|期望[:：]?/g, " ");
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
      if (text.length < 80 || text.length > 12000 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
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
    if (/期望职位|期望[:：]/.test(text)) { score += 25; reasons.push("包含期望职位/期望方向"); }
    if (text.includes("工作经历") || /\d{4}[.-]\d{2}/.test(text) || /experience-content/.test(`${node.className || ""}`)) { score += 25; reasons.push("包含工作经历"); }
    if (/技能标签|技能/.test(text)) { score += 10; reasons.push("包含技能"); }
    return { score, reason: reasons.join("；") || "未命中资料区特征" };
  }

  function profilePanelCandidates() {
    const nodes = [];
    for (const node of queryVisible([".resume-detail", ".geek-detail", ".candidate-detail", ".profile", "[class*='resume']", "[class*='geek']", "[class*='candidate']", "aside", "main", "section", "article", "div"])) {
      const text = textOf(node);
      if (text.length < 60 || text.length > 8000 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
      const scored = profilePanelScore(node);
      if (scored.score >= 45) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function isForbiddenCandidateHeaderNode(node) {
    const text = textOf(node);
    const cls = String(node?.className || "").toLowerCase();
    if (/experience-content|detail-list|company|education|project|job-detail|position-detail|map|recommend/.test(cls)) return true;
    if (/工作经历|教育经历|项目经历|岗位职责|职位详情|工作地址|推荐相似|地图/.test(text)) return true;
    return false;
  }

  function candidateHeaderScore(node) {
    const text = textOf(node);
    const parsedName = extractNameFromHeaderText(text);
    const exp = parseExperience(text);
    let score = 0;
    const reasons = [];
    if (parsedName) { score += 45; reasons.push(`头部姓名：${parsedName}`); }
    if (/base-info-single-top|base-info-single-detail|base-info-single-detial/i.test(`${node.className || ""} ${node.id || ""}`)) { score += 35; reasons.push("命中候选人顶部身份区类名"); }
    if (/name|header|top|user|geek|candidate|resume/i.test(`${node.className || ""} ${node.id || ""}`)) { score += 10; reasons.push("类名像候选人头部"); }
    if (/今日活跃|刚刚活跃|\d+日内活跃|在线|最近活跃/.test(text)) { score += 20; reasons.push("包含活跃状态"); }
    if (/\d{2}岁/.test(text)) { score += 10; reasons.push("包含年龄"); }
    if (exp.experience_years_text) { score += 10; reasons.push("包含年限"); }
    if (parseEducation(text)) { score += 10; reasons.push("包含学历"); }
    const rect = node.getBoundingClientRect();
    if (rect.y < window.innerHeight * 0.45) { score += 8; reasons.push("位于页面/弹窗上方"); }
    if (isForbiddenCandidateHeaderNode(node)) { score -= 120; reasons.push("命中经历/公司/岗位等禁用区域"); }
    return { score, reason: reasons.join("；") || "未命中候选人顶部身份区特征", parsedName, parsedAge: parseAge(text), parsedExperience: exp.experience_years_text, parsedEducation: parseEducation(text) };
  }

  function candidateHeaderCandidates(root = document) {
    const nodes = [];
    const selectors = [
      ".base-info-single-top", ".base-info-single-top-detail", ".base-info-single-detial",
      "[class*='base-info-single-top']", "[class*='base-info-single-detail']", "[class*='base-info-single-detial']",
      ".resume-header", ".candidate-header", ".geek-header", ".chat-header", ".conversation-header",
      "[class*='resume-header']", "[class*='candidate-header']", "[class*='geek-header']", "[class*='chat-header']", "[class*='conversation-header']",
      "header", "h1", "h2", "div",
    ];
    for (const node of queryVisible(selectors, root)) {
      const text = textOf(node);
      if (text.length < 2 || text.length > 700 || isNavLike(text, node) || isChatListOrNavigationElement(node) || isForbiddenCandidateHeaderNode(node)) continue;
      const scored = candidateHeaderScore(node);
      if (scored.score >= 55 && scored.parsedName) nodes.push({ node, ...scored });
    }
    return nodes.sort((a, b) => b.score - a.score || textOf(a.node).length - textOf(b.node).length);
  }

  function candidateHeaderDebugItem(item) {
    return {
      ...debugNode(item.node, item.score, item.reason),
      parsed_name: item.parsedName || "",
      parsed_age: item.parsedAge || null,
      parsed_experience: item.parsedExperience || "",
      parsed_education: item.parsedEducation || "",
    };
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
    const root = (/\/web\/chat/.test(location.href) ? findActiveChatMainPanel() : null) || document;
    for (const node of queryVisible([".chat-header", ".chat-user", ".conversation-header", ".message-header", "[class*='chat-header']", "[class*='conversation-header']", "[class*='chat-user']", "header", "div"], root)) {
      const text = textOf(node);
      if (text.length < 2 || text.length > 600 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
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

  function _resumeContains(text, word) {
    const source = String(text || "");
    const keyword = String(word || "");
    if (!keyword) return false;
    if (/^[a-z0-9 +#.-]+$/i.test(keyword)) return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(source);
    return source.includes(keyword);
  }

  function collectResumeKeywords(text, words) {
    return uniq(words.filter((word) => _resumeContains(text, word)));
  }

  function parseResumeStructured(resumeText) {
    const raw = cleanText(resumeText);
    const basics = parsePersonBasics(raw);
    const expected = expectedParts(raw);
    const companies = collectResumeKeywords(raw, ["网易", "腾讯游戏", "米哈游", "莉莉丝", "FunPlus", "趣加", "三七", "三七互娱", "完美", "字节游戏", "盛大", "IGG", "沐瞳", "巨人", "游族"]);
    const gameWords = ["游戏", "MMO", "SLG", "二次元", "主策划", "数值", "UE", "Unity", "技术美术", "原画", "动画", "TA", "特效", "美术外包", "发行", "海外发行"];
    const aiWords = ["AI", "AIGC", "Stable Diffusion", "ComfyUI", "LLM", "GPT", "Midjourney"];
    const industries = [];
    if (collectResumeKeywords(raw, gameWords).length || companies.length) industries.push("游戏");
    if (collectResumeKeywords(raw, aiWords).length) industries.push("AI");
    const recruitingDomains = [];
    if (collectResumeKeywords(raw, ["招聘", "猎头", "高招", "mapping", "Mapping", "人才地图", "招聘经理", "招聘专家", "HRBP", "人力资源"]).length) recruitingDomains.push("招聘");
    if (collectResumeKeywords(raw, ["高端招聘", "高招", "CXO", "VP", "总监", "制作人", "主策", "主策划", "技术负责人", "美术负责人"]).length) recruitingDomains.push("高端招聘");
    if (collectResumeKeywords(raw, ["猎头", "猎头顾问", "headhunter"]).length) recruitingDomains.push("猎头");
    const roles = collectResumeKeywords(raw, ["技术美术", "TA", "原画", "动画", "特效", "视频", "招聘", "HR", "猎头", "制作人", "主策划", "程序", "Unity", "UE", "美术负责人", "技术负责人"]);
    const rejected_skills = collectResumeKeywords(raw, RESUME_SKILL_DENYLIST);
    const skills = collectResumeKeywords(raw, RESUME_SKILL_ALLOWLIST).filter((word) => !rejected_skills.includes(word));
    const projects = linesOf(raw).filter((line) => /项目|游戏|作品|上线|发行|海外|AIGC|AI视频/.test(line) && line.length <= 120).slice(0, 12);
    const keywords = uniq([...industries, ...roles, ...skills, ...recruitingDomains, ...companies]);
    const game_related = industries.includes("游戏") || companies.length > 0;
    const ai_related = industries.includes("AI") || skills.some((item) => /Stable Diffusion|ComfyUI|Midjourney|AI/.test(item));
    const tech_related = roles.some((item) => /技术美术|TA|程序|Unity|UE|技术负责人/.test(item)) || skills.some((item) => /UE|Unreal|Unity|Shader|Python/.test(item));
    const confidence = Math.min(100, 20 + (basics.name ? 10 : 0) + (basics.experience_years !== null ? 10 : 0) + industries.length * 15 + roles.length * 5 + skills.length * 3 + recruitingDomains.length * 10 + companies.length * 5);
    return {
      candidate_name: basics.name,
      current_title: expected.expected_position || (raw.match(/(?:当前职位|在职职位|职位|岗位)[:：\s]*([^\n。；;|]{2,40})/) || ["", ""])[1] || "",
      city: expected.expected_city || (raw.match(CITY_RE) || [""])[0],
      years_experience: basics.experience_years,
      education: basics.education,
      industries: uniq(industries),
      roles,
      skills,
      companies,
      projects,
      keywords,
      recruiting_domains: uniq(recruitingDomains),
      game_related,
      ai_related,
      tech_related,
      confidence,
      rejected_skills: uniq(rejected_skills),
    };
  }

  async function parseResumeWithAI(structuredData) {
    void structuredData;
    return null;
  }

  function sourceCandidateFromRaw(rawText, source, headerText = rawText) {
    const raw = cleanText(rawText);
    const header = cleanText(headerText);
    const basics = parsePersonBasics(header);
    const expected = expectedParts(raw);
    const structured = source === "selected_chat_item" ? parseResumeStructured(header || raw) : parseResumeStructured(raw);
    const skills = structured.skills.length ? structured.skills : safeKeywords(raw, SKILL_WORDS).filter((word) => !RESUME_SKILL_DENYLIST.includes(word));
    const projectKeywords = uniq([...safeKeywords(raw, PROJECT_WORDS), ...structured.industries, ...structured.recruiting_domains, ...structured.roles]);
    const currentTitle = structured.current_title || expected.expected_position || (raw.match(/(?:当前职位|在职职位|求职意向|职位|期望)[:：\s]*([^\n。；;|]{2,40})/) || ["", ""])[1] || "";
    return {
      ...emptyCandidate(source),
      ...basics,
      title: currentTitle,
      current_title: currentTitle,
      city: structured.city || expected.expected_city || (raw.match(CITY_RE) || [""])[0],
      expected_position: expected.expected_position,
      expected_city: expected.expected_city,
      salary_expectation: expected.salary_expectation || (raw.match(SALARY_RE) || [""])[0],
      skills: source === "selected_chat_item" ? [] : skills,
      structured_resume: structured,
      project_keywords: source === "selected_chat_item" ? [] : projectKeywords,
      work_experiences: source === "selected_chat_item" ? [] : raw.split(/(?=\d{4}[.-]|\d+年|公司|项目|工作经历)/).map(oneLine).filter((line) => line.length > 8 && !/^\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(line)).slice(0, 8),
      raw_text: source === "selected_chat_item" ? "" : raw.slice(0, 5000),
      source,
      sources_used: [source],
      warnings: source === "selected_chat_item" ? ["仅从左侧会话列表识别到姓名，建议打开在线简历"] : (source === "candidate_header" || source === "resume_modal" || source === "profile_panel" || source === "active_chat_profile" ? [] : ["当前候选人信息不完整，请打开在线简历后再分析"]),
    };
  }

  function sourceCandidateFromNode(item, source) {
    const raw = textOf(item.node);
    const headerItem = candidateHeaderCandidates(item.node)[0];
    const headerText = source === "candidate_header" ? raw : (headerItem ? textOf(headerItem.node) : (source === "chat_header" || source === "selected_chat_item" ? raw : ""));
    return sourceCandidateFromRaw(raw, source, headerText);
  }

  function activeChatProfileCandidate() {
    const root = findActiveChatMainPanel() || document;
    const header = candidateHeaderCandidates(root)[0];
    if (!header) return null;
    const headerText = textOf(header.node);
    const supplementTexts = [headerText];
    for (const node of queryVisible([".position-item.expect", ".resume-btn-content", "[class*='position-item']"], root)) {
      if (isForbiddenCandidateHeaderNode(node) || isChatListOrNavigationElement(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.left >= 620) supplementTexts.push(textOf(node));
    }
    const raw = uniq(supplementTexts.filter(Boolean)).join("\n");
    const candidate = sourceCandidateFromRaw(raw, "active_chat_profile", headerText);
    candidate.profile_complete = Boolean(candidate.name && (candidate.age || candidate.experience_years || candidate.education));
    return candidate.name ? candidate : null;
  }

  function visibleTextFallback() {
    return { skills: [], project_keywords: [], raw_text: "" };
  }

  function completeAndScore(candidate) {
    const basicsCount = [candidate.age, candidate.experience_years, candidate.education].filter(Boolean).length;
    const complete = Boolean(candidate.name && basicsCount >= 2 && /期望职位|工作经历/.test(candidate.raw_text || ""));
    let confidence = 0;
    if (candidate.sources_used.includes("candidate_header")) confidence += 45;
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
    candidate.confidence = candidate.sources_used.length === 1 && candidate.sources_used.includes("selected_chat_item") ? Math.min(40, confidence) : Math.min(100, confidence);
    if (!complete && candidate.name && !candidate.warnings.includes("当前候选人信息不完整，请打开在线简历后再分析")) candidate.warnings.push("当前候选人信息不完整，请打开在线简历后再分析");
    return candidate;
  }

  function mergeCandidate(primary, supplements) {
    const result = { ...primary };
    for (const extra of supplements) {
      result.sources_used = uniq([...(result.sources_used || []), ...(extra.sources_used || [])]);
      for (const key of ["age", "experience_years"]) if (!result[key] && extra[key]) result[key] = extra[key];
      if (!result.experience_years_text && extra.experience_years_text) result.experience_years_text = extra.experience_years_text;
      for (const key of ["education", "expected_position", "expected_city", "salary_expectation", "current_title", "title", "city"]) if (!result[key] && extra[key]) result[key] = extra[key];
      if (!extra.sources_used?.includes("selected_chat_item")) {
        result.skills = uniq([...(result.skills || []), ...(extra.skills || [])]);
        result.project_keywords = uniq([...(result.project_keywords || []), ...(extra.project_keywords || [])]);
        result.work_experiences = uniq([...(result.work_experiences || []), ...(extra.work_experiences || [])]).slice(0, 8);
      }
      result.warnings = uniq([...(result.warnings || []), ...(extra.warnings || [])]);
    }
    return completeAndScore(result);
  }

  function extractCandidate() {
    const debug = { candidate_header_candidates: [], resume_modal_candidates: [], profile_panel_candidates: [], chat_header_candidates: [], selected_chat_item_candidates: [], active_chat_profile_candidate: null, candidate_parse_result: null };
    try {
      const resumeItems = resumeModalCandidates();
      const profileItems = profilePanelCandidates();
      const candidateHeaderItems = candidateHeaderCandidates();
      const headerItems = chatHeaderCandidates();
      const selectedItems = selectedChatItemCandidates();
      const activeProfile = activeChatProfileCandidate();
      debug.candidate_header_candidates = candidateHeaderItems.slice(0, 10).map(candidateHeaderDebugItem);
      debug.resume_modal_candidates = resumeItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.profile_panel_candidates = profileItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.chat_header_candidates = headerItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.selected_chat_item_candidates = selectedItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.active_chat_profile_candidate = activeProfile ? { source: activeProfile.source, name: activeProfile.name, raw_text_preview: activeProfile.raw_text.slice(0, 240) } : null;

      const sources = [];
      if (candidateHeaderItems[0]) sources.push(sourceCandidateFromNode(candidateHeaderItems[0], "candidate_header"));
      if (activeProfile) sources.push(activeProfile);
      if (headerItems[0]) sources.push(sourceCandidateFromNode(headerItems[0], "chat_header"));
      if (resumeItems[0]) sources.push(sourceCandidateFromNode(resumeItems[0], "resume_modal"));
      if (profileItems[0]) sources.push(sourceCandidateFromNode(profileItems[0], "profile_panel"));
      if (selectedItems[0]) sources.push(sourceCandidateFromNode(selectedItems[0], "selected_chat_item"));

      const primary = sources.find((item) => item.name && item.source === "candidate_header")
        || sources.find((item) => item.name && item.source === "active_chat_profile")
        || sources.find((item) => item.name && item.source === "chat_header")
        || sources.find((item) => item.name && item.source === "resume_modal")
        || sources.find((item) => item.name && item.source === "profile_panel")
        || sources.find((item) => item.name && item.source === "selected_chat_item");
      const fallback = visibleTextFallback();
      debug.visible_text_fallback = { skills: fallback.skills, project_keywords: fallback.project_keywords, text_preview: fallback.raw_text.slice(0, 240) };

      if (!primary) {
        const candidate = { ...emptyCandidate("unknown"), skills: fallback.skills, project_keywords: fallback.project_keywords, raw_text: fallback.raw_text, sources_used: fallback.raw_text ? ["visible_text_fallback"] : [], warnings: ["未识别候选人姓名，请打开具体候选人聊天或在线简历"] };
        debug.candidate_parse_result = pickCandidateDebug(candidate);
        return { ok: false, candidate, warning: candidate.warnings[0], error: "未识别候选人姓名，请打开具体候选人聊天或在线简历", debug };
      }

      const candidate = mergeCandidate(primary, sources.filter((item) => item !== primary));
      candidate.skills = uniq([...candidate.skills, ...fallback.skills]);
      candidate.project_keywords = uniq([...candidate.project_keywords, ...fallback.project_keywords]);
      if (fallback.raw_text && !candidate.sources_used.includes("visible_text_fallback")) candidate.sources_used.push("visible_text_fallback");
      completeAndScore(candidate);
      debug.candidate_parse_result = pickCandidateDebug(candidate);
      return { ok: Boolean(candidate.name), candidate, warning: candidate.warnings[0] || "", error: candidate.name ? "" : "未识别候选人姓名", debug };
    } catch (e) {
      return { ok: false, candidate: emptyCandidate(), warning: "", error: `候选人抓取异常：${e.message || e}`, debug };
    }
  }

  function chatRootScore(node) {
    return activeChatPanelScore(node);
  }

  function chatMessageCandidates(root = findActiveChatMainPanel()) {
    if (!root) return [];
    return [{ node: root, ...activeChatPanelScore(root) }];
  }

  function extractChat() {
    const debug = { possible_panels: [], rejected_left_list_count: 0, rejected_chat_list_blocks: [], active_chat_panel_candidates: [], accepted_chat_message_candidates: [], rejected_raw_text_sources: [] };
    try {
      const panelItems = activeChatPanelCandidates();
      const rejected = rejectedChatListBlocks();
      debug.possible_panels = panelItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      debug.active_chat_panel_candidates = debug.possible_panels;
      debug.rejected_left_list_count = rejected.length;
      debug.rejected_chat_list_blocks = rejected.slice(0, 20).map((node) => debugNode(node, 0, "rejected_chat_list"));
      const panel = panelItems[0]?.node || null;
      const candidate = extractCandidate();
      if (!panel) return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "unknown", error: "未检测到当前聊天主窗口", debug };

      const messageNodes = queryVisible([".message", ".chat-item", ".im-message", "[class*='message-item']", "[class*='bubble']", "[class*='msg']"], panel)
        .filter((node) => !isChatListOrNavigationElement(node));
      const rawNodes = (messageNodes.length ? messageNodes : Array.from(panel.children).filter((node) => node instanceof Element && isVisible(node) && !isChatListOrNavigationElement(node)));
      const latest = rawNodes.map((node) => {
        const text = oneLine(node.innerText || node.textContent || "");
        const cls = String(node.className || "").toLowerCase();
        const role = /mine|self|right|hr|boss/.test(cls) ? "hr" : (/left|geek|candidate|other/.test(cls) ? "candidate" : "unknown");
        return { role, text, node };
      }).filter((item) => {
        if (item.text.length <= 1 || item.text.length >= 1000) return false;
        if (isNavLike(item.text, item.node) || isChatListOrNavigationElement(item.node)) return false;
        if (parseJobTitleFromText(item.text)) return false;
        return true;
      }).slice(-30);
      debug.accepted_chat_message_candidates = latest.slice(0, 20).map((item) => debugNode(item.node, 0, "accepted_chat_message"));
      const safeLatest = latest.map(({ role, text }) => ({ role, text }));
      const text = safeLatest.map((item) => item.text).join("\n");
      if (!text) return { ok: false, candidate_name: candidate.candidate.name || "", text: "", latest_messages: [], source: "active_chat_main_panel", error: "未检测到当前聊天消息", debug };
      return { ok: true, candidate_name: candidate.candidate.name || "", text, latest_messages: safeLatest, source: "active_chat_main_panel", error: "", debug };
    } catch (e) {
      return { ok: false, candidate_name: "", text: "", latest_messages: [], source: "unknown", error: `聊天抓取异常：${e.message || e}`, debug };
    }
  }

  function detectPageType() {
    const body = textOf(document.body).slice(0, 8000);
    if (/\/web\/chat/.test(location.href) || findActiveChatMainPanel() || body.includes("沟通")) return "chat_page";
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
      if (text.length < 10 || text.length > 400 || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
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
        rejected_chat_list_blocks: rejectedChatListBlocks().slice(0, 20).map((node) => debugNode(node, 0, "rejected_chat_list")),
        active_chat_panel_candidates: activeChatPanelCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        accepted_chat_message_candidates: (chat.debug?.accepted_chat_message_candidates || []),
        rejected_raw_text_sources: (chat.debug?.rejected_chat_list_blocks || []),
        job_detail_modal_candidates: jobDetailModalCandidates().slice(0, 20).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title, parsed_city: item.city, parsed_salary: item.salary, parsed_experience: item.experience_required, parsed_education: item.education_required })),
        chat_job_card_candidates: chatJobCardCandidates().slice(0, 20).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title })),
        candidate_header_candidates: candidateHeaderCandidates().slice(0, 20).map(candidateHeaderDebugItem),
        resume_modal_candidates: resumeModalCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        profile_panel_candidates: profilePanelCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_header_candidates: chatHeaderCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        selected_chat_item_candidates: selectedChatItemCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_message_candidates: chatMessageCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        input_candidates: inputCandidates().slice(0, 20).map((item) => debugNode(item.el, item.score, item.reason)),
        candidate_parse_result: candidate.debug?.candidate_parse_result || pickCandidateDebug(candidate.candidate),
        resume_parse_debug: candidate.candidate?.structured_resume ? {
          candidate_name: candidate.candidate.structured_resume.candidate_name,
          industries: candidate.candidate.structured_resume.industries,
          recruiting_domains: candidate.candidate.structured_resume.recruiting_domains,
          roles: candidate.candidate.structured_resume.roles,
          skills: candidate.candidate.structured_resume.skills,
          companies: candidate.candidate.structured_resume.companies,
          game_related: candidate.candidate.structured_resume.game_related,
          ai_related: candidate.candidate.structured_resume.ai_related,
          tech_related: candidate.candidate.structured_resume.tech_related,
          rejected_skills: candidate.candidate.structured_resume.rejected_skills,
        } : {},
        job_parse_result: job.debug?.job_parse_result || pickJobDebug(job.job),
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
