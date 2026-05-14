(() => {
  const LOADED_KEY = "__AI_RECRUIT_CONTENT_LOADED__";
  const LISTENER_KEY = "__AI_RECRUIT_ASSISTANT_ON_MESSAGE__";
  const isRecommendPage = /\/web\/(chat|geek)\/recommend(?:[/?#]|$)/i.test(location.href);

  if (window[LOADED_KEY]) return;
  window[LOADED_KEY] = true;
  console.log("[AI Recruit] content loaded once", location.href);
  if (isRecommendPage) console.log("[AI Recruit] recommend scanner passive mode");

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
  const JOB_DETAIL_TAG_TITLE_BLACKLIST = ["公司管理", "短视频", "猎头经验", "高管招聘经验", "技术美术", "TA", "游戏", "AI视频技术", "本科", "5-10年", "薪资范围", "职位详情", "岗位职责", "任职要求", "工作地址"];
  const JOB_TITLE_LABEL_RE = /薪资详情|薪资范围|职位详情|岗位职责|职位职责|工作内容|任职要求|职位要求|工作地址|工作地点|展开全部/;
  const JOB_DETAIL_TAG_STOP_RE = /^(岗位职责|职位职责|工作内容|你将负责|职位描述|任职要求|职位要求|技能要求|我们希望你|加分项|薪资详情|工作地址|工作地点|公司介绍|团队介绍)/;
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
      title_source: job?.title_source || "",
      title_source_text: job?.title_source_text || "",
      rejected_title_candidates: job?.rejected_title_candidates || [],
      job_title_candidates: job?.job_title_candidates || [],
      fallback_title_used: Boolean(job?.fallback_title_used),
      preferred_keywords: job?.preferred_keywords || [],
      education_required: job?.education_required || "",
      experience_required: job?.experience_required || "",
      source: job?.source || "",
      jd_complete: Boolean(job?.jd_complete),
    };
  }

  function candidateCompletenessDebug(candidate) {
    const raw = candidate?.raw_text || "";
    const skills = Array.isArray(candidate?.skills) ? candidate.skills : [];
    const hasName = Boolean(candidate?.name);
    const hasAge = Boolean(candidate?.age);
    const hasExperience = Boolean(candidate?.experience_years || candidate?.experience_years_text);
    const hasEducation = Boolean(candidate?.education);
    const hasWorkExperienceText = /工作经历/.test(raw);
    const hasCompanyExperience = /(?:公司|有限公司|科技|网络|互动|互娱|游戏|信息技术|文化传媒|工作经历|任职|负责)/.test(raw) || (candidate?.work_experiences || []).length > 0;
    const careerChecks = [
      Boolean(candidate?.current_title),
      Boolean(candidate?.expected_position),
      skills.length >= 2,
      hasWorkExperienceText,
      hasCompanyExperience,
      raw.length > 300,
    ];
    const careerCount = careerChecks.filter(Boolean).length;
    const missingFields = [];
    if (!hasName) missingFields.push("name");
    if (!hasAge) missingFields.push("age");
    if (!hasExperience) missingFields.push("experience");
    if (!hasEducation) missingFields.push("education");
    if (careerCount < 2) missingFields.push("career_info_at_least_two");
    const profileComplete = hasName && hasAge && hasExperience && hasEducation && careerCount >= 2;
    return {
      profile_complete: profileComplete,
      confidence: candidate?.confidence || 0,
      has_name: hasName,
      has_age: hasAge,
      has_experience: hasExperience,
      has_education: hasEducation,
      skills_count: skills.length,
      raw_text_length: raw.length,
      has_work_experience_text: hasWorkExperienceText,
      completeness_reason: profileComplete ? `基础信息完整，职业信息命中 ${careerCount}/6 项` : `缺少字段或职业信息不足，仅命中 ${careerCount}/6 项`,
      missing_fields: missingFields,
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
      profile_complete: Boolean(candidate?.profile_complete),
      confidence: candidate?.confidence || 0,
      candidate_completeness_debug: candidateCompletenessDebug(candidate),
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

  function validateJobTitle(title) {
    const value = cleanJobTitleCandidate(title);
    if (!value || value.length < 2 || value.length > 80) return false;
    if (JOB_TITLE_LABEL_RE.test(value)) return false;
    if (isForbiddenJobTitleLabel(value)) return false;
    if (JOB_FORBIDDEN.some((word) => value === word || (value.includes(word) && value.length <= word.length + 2))) return false;
    if (/^(职位|岗位|沟通|搜索|更多|账号|导航|薪资范围)$/.test(value)) return false;
    return true;
  }

  function isValidJobTitle(title) {
    return validateJobTitle(title);
  }

  function isGenericJobDetailTag(value) {
    const text = cleanJobTitleCandidate(value);
    if (!text) return false;
    if (JOB_DETAIL_TAG_TITLE_BLACKLIST.includes(text)) return true;
    if (/^(本科|大专|硕士|博士|学历不限|经验不限|\d+\s*[-~—至]\s*\d+\s*年|\d+\s*年以上|\d+\s*年)$/.test(text)) return true;
    return false;
  }

  function isTagLikeElement(node) {
    const cls = String(node?.className || "").toLowerCase();
    return /tag|label|badge|keyword|skill/.test(cls);
  }

  function rejectTitleCandidate(value, reason = "职位详情标签，不能作为岗位名称") {
    const title = cleanJobTitleCandidate(value);
    return title ? { title, reason } : null;
  }

  function normalizeSalary(value) {
    return String(value || "").replace(/\s+/g, "").replace(/[~—至]/g, "-");
  }

  function parseJobHeaderText(headerText, source = "job_detail_modal_header") {
    const header = cleanText(headerText);
    const salaryMatch = header.match(SALARY_RE);
    if (!salaryMatch) return { title: "", salary: "", city: "", education_required: "", experience_required: "", title_source: "", title_source_text: "", rejected_title_candidates: [] };
    const salary = normalizeSalary(salaryMatch[0]);
    const salaryIndex = header.indexOf(salaryMatch[0]);
    const title = cleanJobTitleCandidate(header.slice(0, salaryIndex));
    const afterSalary = header.slice(salaryIndex + salaryMatch[0].length);
    if (!validateJobTitle(title)) {
      return { title: "", salary, city: "", education_required: "", experience_required: "", title_source: "", title_source_text: oneLine(header), rejected_title_candidates: [rejectTitleCandidate(title, "包含薪资/职位详情等标签，不能作为岗位名称")].filter(Boolean) };
    }
    return {
      title,
      salary,
      city: (afterSalary.match(CITY_RE) || [""])[0],
      education_required: (afterSalary.match(EDU_REQ_RE) || [""])[0],
      experience_required: (afterSalary.match(JOB_EXP_RE) || [""])[0],
      title_source: source,
      title_source_text: oneLine(header),
      rejected_title_candidates: [],
    };
  }

  function parseTopTitleSalaryText(text, source = "job_detail_modal_top_text") {
    const parsed = parseJobHeaderText(cleanText(text).slice(0, 160), source);
    if (parsed.title) return parsed;
    return { title: "", salary: parsed.salary || "", city: "", education_required: "", experience_required: "", title_source: "", title_source_text: parsed.title_source_text || "", rejected_title_candidates: parsed.rejected_title_candidates || [] };
  }

  function findJobDetailHeader(modalEl) {
    if (!modalEl) return { text: "", candidates: [], rejected_title_candidates: [] };
    const modalRect = modalEl.getBoundingClientRect();
    const candidates = [];
    const rejected = [];
    for (const node of queryVisible([".job-title", ".job-name", ".position-title", ".position-name", ".name", "[class*='job-title']", "[class*='job-name']", "[class*='position-title']", "[class*='position-name']", "h1", "h2", "h3", "div", "section", "header", "span"], modalEl)) {
      const text = oneLine(textOf(node));
      if (text.length < 4 || text.length > 220 || !SALARY_RE.test(text) || isNavLike(text, node) || isChatListOrNavigationElement(node)) continue;
      const rect = node.getBoundingClientRect();
      const topOffset = rect.top - modalRect.top;
      if (topOffset < 0 || topOffset > 120) continue;
      if (JOB_TITLE_LABEL_RE.test(text) || isTagLikeElement(node)) {
        rejected.push(rejectTitleCandidate(text, "薪资/职位详情标签区域，不能作为岗位名称"));
        continue;
      }
      const parsed = parseJobHeaderText(text, "job_detail_modal_header");
      if (parsed.title) candidates.push({ text, top: Math.round(topOffset), title: parsed.title, salary: parsed.salary, source: "job_detail_modal_header" });
      else rejected.push(...(parsed.rejected_title_candidates || []));
    }
    candidates.sort((a, b) => a.top - b.top || a.text.length - b.text.length);
    return { text: candidates[0]?.text || "", candidates, rejected_title_candidates: rejected.filter(Boolean) };
  }

  function topTitleElementCandidates(root) {
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    return queryVisible([".job-title", ".job-name", ".position-title", ".position-name", ".name", "[class*='job-title']", "[class*='job-name']", "[class*='position-title']", "[class*='position-name']", "h1", "h2", "h3", "div", "span"], root)
      .filter((node) => {
        const text = textOf(node);
        if (text.length < 4 || text.length > 120 || isNavLike(text, node) || isChatListOrNavigationElement(node)) return false;
        if (isTagLikeElement(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.top <= rootRect.top + Math.max(160, rootRect.height * 0.22);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || textOf(a).length - textOf(b).length);
  }

  function extractJobDetailTags(root, rawText = "") {
    const tags = [];
    const rejected = [];
    const pushTag = (value, reason = "职位详情标签，不能作为岗位名称") => {
      const tag = cleanJobTitleCandidate(value);
      if (!tag || tag.length > 30) return;
      if (SALARY_RE.test(tag) || CITY_RE.test(tag) || JOB_EXP_RE.test(tag) || EDU_REQ_RE.test(tag)) {
        if (isGenericJobDetailTag(tag)) rejected.push(rejectTitleCandidate(tag, reason));
        return;
      }
      if (isForbiddenJobTitleLabel(tag)) {
        rejected.push(rejectTitleCandidate(tag, reason));
        return;
      }
      tags.push(tag);
      rejected.push(rejectTitleCandidate(tag, reason));
    };

    const lines = linesOf(rawText);
    const detailIndex = lines.findIndex((line) => /^职位详情/.test(line));
    if (detailIndex >= 0) {
      for (const line of lines.slice(detailIndex + 1)) {
        if (JOB_DETAIL_TAG_STOP_RE.test(line)) break;
        if (!line || includesAny(line, NAV_WORDS)) continue;
        for (const part of line.split(/[、,，|/\s]+/).map(oneLine).filter(Boolean)) pushTag(part);
      }
    }

    if (root) {
      for (const node of queryVisible(["[class*='tag']", "[class*='label']", "[class*='badge']", "[class*='keyword']", "[class*='skill']", ".tag", ".label", ".badge"], root)) {
        const text = textOf(node);
        if (text.length < 2 || text.length > 30 || isNavLike(text, node)) continue;
        const beforeText = cleanText((node.parentElement?.innerText || "").slice(0, 500));
        if (/职位详情/.test(beforeText) || isGenericJobDetailTag(text)) pushTag(text);
      }
    }

    return {
      preferred_keywords: uniq(tags),
      rejected_title_candidates: uniq(rejected.filter(Boolean).map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)),
    };
  }

  function extractJobTitleFromModal(rawText, root = null) {
    const raw = cleanText(rawText);
    const detailTags = extractJobDetailTags(root, raw);
    const header = findJobDetailHeader(root);
    const rejected = [...detailTags.rejected_title_candidates, ...header.rejected_title_candidates];
    const titleCandidates = [...header.candidates];
    const allTitleCandidates = () => [
      ...titleCandidates,
      ...rejected.filter(Boolean).map((item) => ({ text: item.title, title: item.title, source: "rejected", rejected: true, reason: item.reason })),
    ];

    if (header.text) {
      const parsed = parseJobHeaderText(header.text, "job_detail_modal_header");
      if (parsed.title) {
        return { ...parsed, rejected_title_candidates: rejected, preferred_keywords: detailTags.preferred_keywords, job_title_candidates: allTitleCandidates() };
      }
      rejected.push(...(parsed.rejected_title_candidates || []));
    }

    for (const node of topTitleElementCandidates(root)) {
      const nodeText = textOf(node);
      if (JOB_TITLE_LABEL_RE.test(nodeText)) {
        rejected.push(rejectTitleCandidate(nodeText, "薪资/职位详情标签区域，不能作为岗位名称"));
        continue;
      }
      const parsed = parseTopTitleSalaryText(nodeText, "job_detail_modal_top_element");
      if (parsed.title) {
        titleCandidates.push({ text: parsed.title_source_text, title: parsed.title, salary: parsed.salary, source: parsed.title_source });
        return { ...parsed, rejected_title_candidates: rejected, preferred_keywords: detailTags.preferred_keywords, job_title_candidates: allTitleCandidates() };
      }
      rejected.push(...(parsed.rejected_title_candidates || []));
    }

    const parsedTop = parseTopTitleSalaryText(raw, "job_detail_modal_top_160_chars");
    if (parsedTop.title) {
      titleCandidates.push({ text: parsedTop.title_source_text, title: parsedTop.title, salary: parsedTop.salary, source: parsedTop.title_source });
      return { ...parsedTop, rejected_title_candidates: rejected, preferred_keywords: detailTags.preferred_keywords, job_title_candidates: allTitleCandidates() };
    }
    rejected.push(...(parsedTop.rejected_title_candidates || []));

    const topLines = linesOf(raw).slice(0, 12).filter((line) => !includesAny(line, NAV_WORDS));
    const salaryIndex = topLines.findIndex((line) => SALARY_RE.test(line));
    if (salaryIndex > 0) {
      const previous = cleanJobTitleCandidate(topLines[salaryIndex - 1]);
      if (validateJobTitle(previous) && !isGenericJobDetailTag(previous)) {
        const parsed = parseJobHeaderText(`${previous} ${topLines[salaryIndex]}`, "job_detail_modal_line_before_salary");
        titleCandidates.push({ text: parsed.title_source_text, title: parsed.title, salary: parsed.salary, source: parsed.title_source });
        return { ...parsed, rejected_title_candidates: rejected, preferred_keywords: detailTags.preferred_keywords, job_title_candidates: allTitleCandidates() };
      }
      rejected.push(rejectTitleCandidate(previous));
    }

    return { title: "", salary: "", city: "", education_required: "", experience_required: "", title_source: "", title_source_text: "", rejected_title_candidates: rejected.filter(Boolean), preferred_keywords: detailTags.preferred_keywords, job_title_candidates: allTitleCandidates() };
  }

  function parseJobModalTop(rawText, root = null) {
    const raw = cleanText(rawText);
    const topLines = linesOf(raw).slice(0, 16).filter((line) => !includesAny(line, NAV_WORDS));
    const compactTop = oneLine(topLines.join(" "));
    const parsedTitle = extractJobTitleFromModal(raw, root);
    const salary = normalizeSalary(parsedTitle.salary || (compactTop.match(SALARY_RE) || raw.match(SALARY_RE) || [""])[0]);
    const metaLine = topLines.find((line) => CITY_RE.test(line) && (EDU_REQ_RE.test(line) || JOB_EXP_RE.test(line) || SALARY_RE.test(line))) || compactTop;
    const addressLine = linesOf(raw).find((line) => /工作地址|工作地点|地址/.test(line) && CITY_RE.test(line)) || "";
    return {
      title: parsedTitle.title,
      city: parsedTitle.city || (metaLine.match(CITY_RE) || addressLine.match(CITY_RE) || raw.match(CITY_RE) || [""])[0],
      salary,
      education_required: parsedTitle.education_required || (metaLine.match(EDU_REQ_RE) || raw.match(EDU_REQ_RE) || [""])[0],
      experience_required: parsedTitle.experience_required || (metaLine.match(JOB_EXP_RE) || raw.match(JOB_EXP_RE) || [""])[0],
      title_source: parsedTitle.title_source,
      title_source_text: parsedTitle.title_source_text,
      rejected_title_candidates: parsedTitle.rejected_title_candidates || [],
      job_title_candidates: parsedTitle.job_title_candidates || [],
      preferred_keywords: parsedTitle.preferred_keywords || [],
    };
  }

  function jobDetailModalScore(node) {
    const text = textOf(node);
    const parsed = parseJobModalTop(text, node);
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
      if (scored.score >= 55 && (scored.title || scored.salary || /岗位职责|任职要求|职位描述/.test(text))) nodes.push({ node, ...scored });
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

  function buildJobFromCandidate(item, source, fallbackJob = null) {
    const rawText = textOf(item.node);
    const detail = splitJobDetail(rawText);
    const modalParsed = source === "job_detail_modal" ? parseJobModalTop(rawText, item.node) : {};
    const fallbackTitle = validateJobTitle(fallbackJob?.title || "") ? fallbackJob.title : "";
    const title = validateJobTitle(modalParsed.title || item.title || "") ? (modalParsed.title || item.title) : fallbackTitle;
    const fallbackTitleUsed = Boolean(fallbackTitle && title === fallbackTitle && !validateJobTitle(modalParsed.title || item.title || ""));
    const jdComplete = source === "job_detail_modal" ? Boolean(title && rawText.length > 80 && (detail.responsibilities.length || detail.requirements.length)) : (source !== "chat_job_card" && Boolean(rawText && (detail.responsibilities.length || detail.requirements.length || /职位描述|岗位职责|任职要求|技能要求|加分项|工作内容|职位要求|你将负责|我们希望你/.test(rawText))));
    return {
      title,
      title_source: fallbackTitleUsed ? "chat_job_card_fallback" : (modalParsed.title_source || item.title_source || source),
      title_source_text: fallbackTitleUsed ? fallbackTitle : (modalParsed.title_source_text || item.title_source_text || ""),
      rejected_title_candidates: modalParsed.rejected_title_candidates || item.rejected_title_candidates || [],
      job_title_candidates: modalParsed.job_title_candidates || item.job_title_candidates || [],
      fallback_title_used: Boolean(fallbackTitleUsed || modalParsed.fallback_title_used || item.fallback_title_used),
      city: source === "chat_job_card" ? "" : (modalParsed.city || (rawText.match(CITY_RE) || [""])[0]),
      salary: source === "chat_job_card" ? "" : (modalParsed.salary || (rawText.match(SALARY_RE) || [""])[0]),
      experience_required: source === "chat_job_card" ? "" : (modalParsed.experience_required || (rawText.match(JOB_EXP_RE) || [""])[0]),
      education_required: source === "chat_job_card" ? "" : (modalParsed.education_required || (rawText.match(EDU_REQ_RE) || [""])[0]),
      description: jdComplete ? rawText.slice(0, 1600) : "",
      responsibilities: jdComplete ? detail.responsibilities : [],
      requirements: jdComplete ? detail.requirements : [],
      preferred_keywords: jdComplete ? uniq([...(modalParsed.preferred_keywords || []), ...detail.preferred_keywords]) : [],
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
      const isChatPage = /\/web\/chat/.test(location.href) || activeChatPanelCandidates().length > 0;
      const panelItems = isChatPage ? activeChatPanelCandidates() : [];
      debug.active_chat_panel_candidates = panelItems.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason));
      const panel = panelItems[0]?.node || null;
      const cards = panel ? chatJobCardCandidates(panel) : [];
      debug.chat_job_card_candidates = cards.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title }));
      const fallbackJob = cards[0] ? buildJobFromCandidate(cards[0], "chat_job_card") : null;

      const modalItems = jobDetailModalCandidates();
      debug.job_detail_modal_candidates = modalItems.slice(0, 10).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title, parsed_city: item.city, parsed_salary: item.salary, title_source: item.title_source || "", title_source_text: item.title_source_text || "", rejected_title_candidates: item.rejected_title_candidates || [], job_title_candidates: item.job_title_candidates || [], preferred_keywords: item.preferred_keywords || [], parsed_experience: item.experience_required, parsed_education: item.education_required }));
      if (modalItems[0]) {
        const job = buildJobFromCandidate(modalItems[0], "job_detail_modal", fallbackJob);
        debug.job_parse_result = pickJobDebug(job);
        return { ok: true, job, error: "", debug };
      }
      if (isChatPage) {
        if (!panel) return { ok: false, job: emptyJob("chat_active_panel_missing"), error: "未在当前聊天窗口识别到沟通岗位，请确认当前对话中有岗位卡或手动配置岗位", debug };
        if (fallbackJob) { debug.job_parse_result = pickJobDebug(fallbackJob); return { ok: true, job: fallbackJob, error: "", debug }; }
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
    for (const node of queryVisible([".resume-detail", ".geek-detail", ".candidate-detail", ".profile", ".base-info-single-container", ".base-info-single-main", ".base-info-single-top", ".experience-content", ".detail-list", "[class*='resume']", "[class*='geek']", "[class*='candidate']", "[class*='base-info-single']", "[class*='experience-content']", "[class*='detail-list']", "aside", "main", "section", "article", "div"])) {
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
      ".base-info-single-container", ".base-info-single-main", ".base-info-single-top", ".base-info-single-top-detail", ".base-info-single-detial",
      "[class*='base-info-single-container']", "[class*='base-info-single-main']", "[class*='base-info-single-top']", "[class*='base-info-single-detail']", "[class*='base-info-single-detial']",
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


  function parseContactAssets(raw) {
    const text = cleanText(raw);
    const phone = (text.match(/(?:^|[^\d])(1[3-9]\d[\s-]?\d{4}[\s-]?\d{4})(?:[^\d]|$)/)?.[1] || "").replace(/[\s-]/g, "");
    const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] || "";
    const wechat = (text.match(/(?:微信号?|wx|wechat)\s*[:：]?\s*([A-Za-z][A-Za-z0-9_-]{5,19})/i)?.[1] || "").trim();
    return { phone, wechat, email };
  }

  function parseCompanyAssets(raw) {
    const known = ["网易", "腾讯", "腾讯游戏", "米哈游", "完美世界", "三七互娱", "FunPlus", "莉莉丝", "字节", "字节跳动", "鹰角", "叠纸", "4399", "趣加", "盛大", "IGG", "沐瞳", "巨人", "游族"];
    const companyMatches = Array.from(String(raw || "").matchAll(/[\u4e00-\u9fa5A-Za-z0-9（）()]{2,30}(?:科技|网络|信息技术|互动|互娱|游戏|文化传媒|传媒)?有限公司/g)).map((m) => m[0]);
    const companies = uniq([...collectResumeKeywords(raw, known), ...companyMatches]);
    return { companies, company_keywords: companies };
  }

  function parseProjectAssets(raw) {
    const projectWords = ["项目", "产品", "游戏", "参与项目", "负责项目", "作品集", "上线项目", "SLG", "MMO", "FPS", "ARPG", "开放世界", "二次元", "UE项目", "手游项目", "主机项目", "3A"];
    const projects = linesOf(raw).filter((line) => /项目|产品|游戏|作品集|上线|SLG|MMO|FPS|ARPG|开放世界|二次元|UE项目|手游项目|主机项目/.test(line) && line.length <= 160).slice(0, 20);
    const project_keywords = collectResumeKeywords(raw, projectWords);
    return { projects: uniq(projects), project_keywords };
  }

  function parseStyleAssets(raw) {
    const styleWords = ["欧美", "日韩", "二次元", "国风", "写实", "卡通", "Q版", "仙侠", "魔幻", "科幻", "末世", "暗黑", "女性向", "乙女", "赛博朋克", "休闲", "SLG", "MMO", "FPS", "3A", "开放世界"];
    const styles = collectResumeKeywords(raw, styleWords);
    return { styles, style_keywords: styles };
  }

  function parseResumeStructured(resumeText) {
    const raw = cleanText(resumeText);
    const basics = parsePersonBasics(raw);
    const expected = expectedParts(raw);
    const contact = parseContactAssets(raw);
    const companyAssets = parseCompanyAssets(raw);
    const projectAssets = parseProjectAssets(raw);
    const styleAssets = parseStyleAssets(raw);
    const companies = companyAssets.companies;
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
    const projects = projectAssets.projects.length ? projectAssets.projects : linesOf(raw).filter((line) => /项目|游戏|作品|上线|发行|海外|AIGC|AI视频/.test(line) && line.length <= 120).slice(0, 12);
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
      phone: contact.phone,
      wechat: contact.wechat,
      email: contact.email,
      companies,
      projects,
      styles: styleAssets.styles,
      project_keywords: projectAssets.project_keywords,
      style_keywords: styleAssets.style_keywords,
      company_keywords: companyAssets.company_keywords,
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
      phone: structured.phone || "",
      wechat: structured.wechat || "",
      email: structured.email || "",
      contact: { phone: structured.phone || "", wechat: structured.wechat || "", email: structured.email || "" },
      companies: structured.companies || [],
      projects: structured.projects || [],
      styles: structured.styles || [],
      company_keywords: structured.company_keywords || [],
      style_keywords: structured.style_keywords || [],
      skills: source === "selected_chat_item" ? [] : skills,
      structured_resume: structured,
      project_keywords: source === "selected_chat_item" ? [] : uniq([...projectKeywords, ...(structured.project_keywords || [])]),
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
    const raw = cleanText(textOf(document.body)).slice(0, 5000);
    if (!/期望职位|工作经历|教育经历|项目经历|技能/.test(raw)) return { skills: [], project_keywords: [], raw_text: "" };
    const structured = parseResumeStructured(raw);
    return {
      skills: structured.skills || [],
      project_keywords: uniq([...(structured.industries || []), ...(structured.recruiting_domains || []), ...(structured.roles || []), ...(structured.companies || [])]),
      raw_text: raw,
    };
  }

  function completeAndScore(candidate) {
    let confidence = 0;
    if (candidate.sources_used.includes("candidate_header")) confidence += 45;
    if (candidate.sources_used.includes("resume_modal")) confidence += 40;
    if (candidate.sources_used.includes("profile_panel")) confidence += 30;
    if (candidate.sources_used.includes("active_chat_profile")) confidence += 30;
    if (candidate.sources_used.includes("visible_text_fallback")) confidence += 15;
    if (candidate.sources_used.includes("chat_header")) confidence += 20;
    if (candidate.sources_used.includes("selected_chat_item")) confidence += 10;
    if (candidate.name) confidence += 20;
    if (candidate.age) confidence += 5;
    if (candidate.experience_years || candidate.experience_years_text) confidence += 5;
    if (candidate.education) confidence += 5;
    if ((candidate.skills || []).length >= 2) confidence += 10;
    if (/工作经历/.test(candidate.raw_text || "")) confidence += 10;
    if ((candidate.raw_text || "").length > 300) confidence += 10;

    candidate.confidence = candidate.sources_used.length === 1 && candidate.sources_used.includes("selected_chat_item") ? Math.min(40, confidence) : Math.min(100, confidence);
    const completeness = candidateCompletenessDebug(candidate);
    candidate.profile_complete = completeness.profile_complete;
    candidate.completeness_reason = completeness.completeness_reason;
    candidate.missing_fields = completeness.missing_fields;
    if (candidate.profile_complete) {
      candidate.confidence = Math.max(80, candidate.confidence);
      candidate.warnings = (candidate.warnings || []).filter((warning) => !/候选人信息不完整|打开在线简历后再分析|建议打开在线简历/.test(warning));
    } else if (candidate.name && !candidate.warnings.includes("当前候选人信息不完整，请打开在线简历后再分析")) {
      candidate.warnings.push("当前候选人信息不完整，请打开在线简历后再分析");
    }
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
        result.companies = uniq([...(result.companies || []), ...(extra.companies || [])]);
        result.projects = uniq([...(result.projects || []), ...(extra.projects || [])]);
        result.styles = uniq([...(result.styles || []), ...(extra.styles || [])]);
        result.company_keywords = uniq([...(result.company_keywords || []), ...(extra.company_keywords || [])]);
        result.style_keywords = uniq([...(result.style_keywords || []), ...(extra.style_keywords || [])]);
        result.project_keywords = uniq([...(result.project_keywords || []), ...(extra.project_keywords || [])]);
        for (const key of ["phone", "wechat", "email"]) if (!result[key] && extra[key]) result[key] = extra[key];
        result.work_experiences = uniq([...(result.work_experiences || []), ...(extra.work_experiences || [])]).slice(0, 8);
        result.raw_text = uniq([result.raw_text || "", extra.raw_text || ""].filter(Boolean)).join("\n").slice(0, 5000);
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
      if (fallback.raw_text) candidate.raw_text = uniq([candidate.raw_text || "", fallback.raw_text].filter(Boolean)).join("\n").slice(0, 5000);
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


  function detectCandidateListPageType() {
    const href = location.href.toLowerCase();
    const body = textOf(document.body).slice(0, 12000);
    if (/\/web\/(chat|geek)\/recommend(?:[/?#]|$)/.test(href)) return "recommend_page";
    if (/\/web\/(chat|geek|boss)\/search(?:[/?#]|$)/.test(href)) return "search_page";
    if (/深度搜索|搜索结果/.test(body)) return "search_page";
    if (/推荐牛人/.test(body)) return "recommend_page";
    if (/搜索/.test(body) && /牛人|候选人|\d{2}\s*岁|学历|经验/.test(body)) return "search_page";
    return "";
  }

  function isInViewport(node) {
    const rect = node?.getBoundingClientRect?.();
    if (!rect) return false;
    const viewH = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewW = window.innerWidth || document.documentElement.clientWidth || 0;
    return rect.bottom > 0 && rect.right > 0 && rect.top < viewH && rect.left < viewW;
  }

  function isCandidateScanExcludedElement(node) {
    if (!node || !(node instanceof Element)) return true;
    if (isExtensionDom(node)) return true;
    const text = oneLine(textOf(node));
    const rect = node.getBoundingClientRect();
    const tag = (node.tagName || "").toLowerCase();
    const cls = `${node.className || ""} ${node.id || ""}`.toLowerCase();
    if (["nav", "header", "footer", "aside"].includes(tag)) return true;
    if (node.closest?.("nav, header, footer, aside, .sidebar, .side, .menu, .filter, [class*='sidebar'], [class*='menu'], [class*='filter']")) return true;
    if (rect.width < 260 && rect.left < 260) return true;
    if (/sidebar|side-menu|nav|menu|filter|toolbar|pagination|advert|ad-/.test(cls)) return true;
    if (/职位管理|全部职位|招聘数据|我的客服|登录|充值|发布职位|筛选|清空|排序/.test(text) && !/\d{2}\s*岁|本科|大专|硕士|博士|打招呼/.test(text)) return true;
    return false;
  }

  function candidateContainerSignals(node) {
    const text = textOf(node);
    const one = oneLine(text);
    const rect = node.getBoundingClientRect();
    const hasGreeting = /打招呼/.test(one);
    const hasAge = /\d{2}\s*岁/.test(one);
    const hasYears = /(?:应届生|无经验|10\s*年以上|\d+\s*(?:[-~—至]\s*\d+\s*)?年(?:以上|经验|工作经验)?)/.test(one);
    const hasEducation = /本科|大专|硕士|博士|研究生|学历不限/.test(one);
    const hasSalary = /\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]|\d{1,2}\s*[kK]/.test(one) || SALARY_RE.test(one);
    const hasExpected = /期望/.test(one);
    const hasName = Boolean(extractCandidateListNameFromNode(node));
    return { text, one, rect, hasGreeting, hasAge, hasYears, hasEducation, hasSalary, hasExpected, hasName };
  }

  function candidateContainerRejectReason(node) {
    const signals = candidateContainerSignals(node);
    if (!signals.one || signals.one.length < 18 || signals.one.length > 1800) return "文本长度不符合候选人卡片";
    if (!isInViewport(node)) return "不在当前可视区域";
    if (isExtensionDom(node)) return "插件DOM";
    if (isCandidateScanExcludedElement(node)) return "侧栏/导航/筛选区域";
    if (isNavLike(signals.one, node) && !signals.hasGreeting) return "导航/筛选区域";
    if (signals.rect.width <= 600) return "宽度小于等于600";
    if (signals.rect.height <= 80) return "高度小于等于80";
    if (signals.rect.left <= 250) return "左侧位置小于等于250";
    if (!signals.hasGreeting) return "不包含打招呼";
    if (!(signals.hasAge || signals.hasYears)) return "缺少年龄或年限";
    if (!(signals.hasEducation || signals.hasSalary)) return "缺少学历或薪资";
    if (!(signals.hasExpected || signals.hasSalary)) return "缺少期望或薪资";
    return "";
  }

  function findCandidateContainerFromGreeting(node) {
    const visited = [];
    let current = node;
    for (let depth = 0; current && current instanceof Element && depth < 8; depth += 1, current = current.parentElement) {
      if (current === document.body || current === document.documentElement) break;
      if (isExtensionDom(current)) break;
      visited.push(current);
      const reason = candidateContainerRejectReason(current);
      if (!reason) return { node: current, depth, reason: "accepted_from_greeting" };
    }
    const best = visited
      .map((item, index) => ({ node: item, index, reason: candidateContainerRejectReason(item), rect: item.getBoundingClientRect(), text: oneLine(textOf(item)) }))
      .sort((a, b) => {
        const score = (a.text.includes("打招呼") ? 20 : 0) + (/\d{2}\s*岁/.test(a.text) ? 15 : 0) + (/本科|大专|硕士|博士|学历不限/.test(a.text) ? 10 : 0) + (/期望|\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]/.test(a.text) ? 10 : 0) + (a.rect.width > 600 ? 10 : 0);
        const bScore = (b.text.includes("打招呼") ? 20 : 0) + (/\d{2}\s*岁/.test(b.text) ? 15 : 0) + (/本科|大专|硕士|博士|学历不限/.test(b.text) ? 10 : 0) + (/期望|\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]/.test(b.text) ? 10 : 0) + (b.rect.width > 600 ? 10 : 0);
        return bScore - score || a.index - b.index;
      })[0];
    return { node: null, depth: -1, reason: best?.reason || "未找到候选人容器" };
  }

  function greetingCandidateControls() {
    return queryVisible(["button", "div", "span", "a"]).filter((node) => {
      const text = oneLine(textOf(node));
      if (text !== "打招呼") return false;
      if (isCandidateScanExcludedElement(node)) return false;
      return true;
    });
  }

  function candidateListCardScore(node) {
    const reason = candidateContainerRejectReason(node);
    const signals = candidateContainerSignals(node);
    if (reason) return { score: -100, reason };
    let score = 60;
    const reasons = ["打招呼锚点容器"];
    if (signals.hasName) { score += 10; reasons.push("姓名"); }
    if (signals.hasAge) { score += 10; reasons.push("年龄"); }
    if (signals.hasYears) { score += 10; reasons.push("年限"); }
    if (signals.hasEducation) { score += 8; reasons.push("学历"); }
    if (signals.hasSalary) { score += 6; reasons.push("薪资"); }
    if (signals.hasExpected) { score += 6; reasons.push("期望"); }
    const skillHits = safeKeywords(signals.one, SKILL_WORDS).length;
    if (skillHits) { score += Math.min(12, skillHits * 3); reasons.push("技能"); }
    return { score, reason: reasons.join("；") };
  }

  function candidateListCardNodes() {
    const buttons = greetingCandidateControls();
    const accepted = [];
    const rejected = [];
    for (const button of buttons) {
      const found = findCandidateContainerFromGreeting(button);
      if (!found.node) {
        rejected.push({ node: button, score: -100, reason: found.reason });
        continue;
      }
      const duplicate = accepted.some((item) => item.node === found.node || item.node.contains(found.node) || found.node.contains(item.node));
      if (duplicate) continue;
      accepted.push({ node: found.node, ...candidateListCardScore(found.node), anchor: button, depth: found.depth });
    }
    accepted.sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top);
    return { accepted, ranked: accepted, rejected, total_buttons: buttons.length };
  }

  function extractCandidateListNameFromNode(node) {
    const strongTexts = queryVisible(["strong", "b", "h3", "h4", "[class*='name']"], node)
      .map((item) => oneLine(textOf(item)))
      .filter((text) => text.length <= 20);
    for (const text of strongTexts) {
      const token = text.split(/[\s|｜,，]/).find(Boolean) || "";
      if (isValidHeaderNameToken(token)) return token;
    }
    return extractCandidateListName(textOf(node));
  }

  function extractCandidateListName(text) {
    const raw = cleanText(text);
    const activeMatch = raw.match(/([\u4e00-\u9fa5]{2,4})(?:\s*)?(?:刚刚活跃|今日活跃|本周活跃|近期活跃|在线)/);
    if (activeMatch && isValidHeaderNameToken(activeMatch[1])) return activeMatch[1];
    const ageMatch = raw.match(/([\u4e00-\u9fa5]{2,4})[^\n\r\u4e00-\u9fa5]{0,12}\d{2}\s*岁/);
    if (ageMatch && isValidHeaderNameToken(ageMatch[1])) return ageMatch[1];
    const lines = linesOf(text).slice(0, 10);
    for (const line of lines) {
      const cleaned = oneLine(line).replace(/^(?:牛人|候选人|姓名)[:：\s]*/, "").replace(/\s*(?:刚刚活跃|今日活跃|本周活跃|在线|近期活跃).*$/, "");
      const token = cleaned.split(/[\s|｜,，]/).find(Boolean) || "";
      if (isValidHeaderNameToken(token)) return token;
    }
    return parseNameFromText(text);
  }

  function extractCompaniesFromCard(text) {
    const lines = linesOf(text);
    return uniq(lines.filter((line) => COMPANY_NAME_RE.test(line) && !/期望|搜索|筛选|学历/.test(line)).map((line) => oneLine(line).replace(/\s+/g, " ").slice(0, 60))).slice(0, 5);
  }

  function extractSchoolsFromCard(text) {
    const lines = linesOf(text);
    return uniq(lines.filter((line) => /大学|学院|学校/.test(line) && !/筛选|搜索/.test(line)).map((line) => oneLine(line).slice(0, 60))).slice(0, 5);
  }

  function extractSkillsFromCardNode(node, raw) {
    const tagTexts = queryVisible(["span", "em", "i", "b", "label", "div"], node)
      .map((item) => oneLine(textOf(item)))
      .filter((text) => text.length >= 2 && text.length <= 18)
      .filter((text) => !/打招呼|岁|年|本科|大专|硕士|博士|期望|活跃|在线|立即沟通/.test(text));
    const extraSkillWords = ["Photoshop", "PhotoShop", "MAYA", "Maya", "Unity", "UE", "TA", "3D", "动画", "原画", "游戏动作", "人力资源管理", "行政管理", "特效", "Shader", "Python", "美术", "招聘", "猎头"];
    return uniq([...safeKeywords(raw, [...SKILL_WORDS, ...extraSkillWords]), ...tagTexts.filter((text) => safeKeywords(text, extraSkillWords).length)]).slice(0, 16);
  }

  function extractHighlightsFromCard(text) {
    return linesOf(text).filter((line) => /项目|负责|熟悉|精通|经验|作品|亮点|优势|技能|公司|大学|学院/.test(line) && !/打招呼|立即沟通/.test(line)).slice(0, 8);
  }

  function cardCandidateFromNode(item, pageType) {
    const raw = cleanText(textOf(item.node));
    const name = extractCandidateListNameFromNode(item.node) || extractCandidateListName(raw);
    const candidate = sourceCandidateFromRaw(raw, pageType === "recommend_page" ? "recommend_card" : "search_card", raw);
    const exp = parseExperience(raw);
    candidate.name = candidate.name || name;
    candidate.age = candidate.age || parseAge(raw);
    candidate.experience_years = candidate.experience_years ?? exp.experience_years;
    candidate.experience_years_text = candidate.experience_years_text || exp.experience_years_text;
    candidate.education = candidate.education || parseEducation(raw);
    candidate.salary_expectation = candidate.salary_expectation || (raw.match(SALARY_RE) || [""])[0];
    candidate.city = candidate.city || (raw.match(CITY_RE) || [""])[0];
    candidate.skills = uniq([...(candidate.skills || []), ...extractSkillsFromCardNode(item.node, raw).filter((word) => !RESUME_SKILL_DENYLIST.includes(word))]).slice(0, 16);
    candidate.companies = uniq([...(candidate.companies || []), ...extractCompaniesFromCard(raw)]).slice(0, 8);
    candidate.schools = extractSchoolsFromCard(raw);
    candidate.highlights = extractHighlightsFromCard(raw);
    candidate.source = pageType === "recommend_page" ? "recommend_card" : "search_card";
    candidate.sources_used = [candidate.source];
    candidate.raw_text = raw.slice(0, 3000);
    candidate.source_url = location.href;
    candidate.confidence = Math.max(candidate.confidence || 0, Math.min(95, 35 + item.score));
    candidate.profile_complete = Boolean(candidate.name && (candidate.age || candidate.experience_years !== null || candidate.education));
    candidate.warnings = [];
    return {
      name: candidate.name || "",
      age: candidate.age || null,
      experience_years: candidate.experience_years,
      experience_years_text: candidate.experience_years_text || "",
      education: candidate.education || "",
      city: candidate.city || "",
      expected_position: candidate.expected_position || "",
      current_title: candidate.current_title || candidate.title || "",
      salary_expectation: candidate.salary_expectation || "",
      skills: candidate.skills || [],
      companies: candidate.companies || [],
      schools: candidate.schools || [],
      highlights: candidate.highlights || [],
      raw_text: candidate.raw_text,
      source: candidate.source,
      source_url: candidate.source_url,
      profile_complete: false,
      confidence: candidate.confidence,
    };
  }


  function recommendCardSignals(node) {
    const text = textOf(node);
    const one = oneLine(text);
    const rect = node.getBoundingClientRect();
    const exp = parseExperience(one);
    const salary = (one.match(/\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]/) || one.match(SALARY_RE) || [""])[0];
    return {
      text,
      one,
      rect,
      name: extractCandidateListNameFromNode(node) || extractCandidateListName(text),
      age: parseAge(one),
      experience_years: exp.experience_years,
      experience_years_text: exp.experience_years_text,
      education: parseEducation(one),
      salary,
      hasAge: /\d{2}\s*岁/.test(one),
      hasExperience: /10\s*年以上|\d+\s*年/.test(one) || Boolean(exp.experience_years_text),
      hasEducation: /本科|大专|硕士|博士|学历不限/.test(one),
      hasSalary: Boolean(salary),
      hasExpected: /期望/.test(one),
    };
  }

  function rejectRecommendCardReason(node) {
    if (!node || !(node instanceof Element)) return "不是元素";
    if (!isVisible(node) || !isInViewport(node)) return "隐藏或不在可视区";
    if (isExtensionDom(node)) return "插件DOM";
    if (isCandidateScanExcludedElement(node)) return "侧栏/导航/筛选/广告区域";
    const s = recommendCardSignals(node);
    if (s.rect.left <= 250) return "不在主内容区";
    if (s.rect.width <= 600) return "宽度小于等于600";
    if (s.rect.height <= 100) return "高度小于等于100";
    if (s.rect.height > 850) return "高度过大，疑似列表父容器";
    if (!s.one || s.one.length < 30) return "文本过短";
    if (s.one.length > 2600) return "文本过长，疑似列表父容器";
    if (!s.hasAge) return "缺少年龄";
    if (!s.hasExperience) return "缺少年限";
    if (!s.hasEducation) return "缺少学历";
    if (!(s.hasExpected || s.hasSalary)) return "缺少期望或薪资";
    if (!s.name) return "缺少姓名";
    return "";
  }

  function scoreRecommendCard(node) {
    const reason = rejectRecommendCardReason(node);
    const s = recommendCardSignals(node);
    if (reason) return { score: -100, reason };
    let score = 60;
    const reasons = ["主内容候选人卡片"];
    if (s.name) { score += 15; reasons.push(`姓名:${s.name}`); }
    if (s.hasAge) { score += 10; reasons.push("年龄"); }
    if (s.hasExperience) { score += 10; reasons.push("年限"); }
    if (s.hasEducation) { score += 10; reasons.push("学历"); }
    if (s.hasExpected) { score += 8; reasons.push("期望"); }
    if (s.hasSalary) { score += 8; reasons.push("薪资"); }
    return { score, reason: reasons.join("；") };
  }

  function scanRecommendCandidateCards() {
    const nodes = queryVisible(["li", "article", "section", "div"]);
    const visibleMainBlocks = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left > 250 && rect.width > 600 && rect.height > 80 && isVisible(node) && isInViewport(node) && !isExtensionDom(node);
    });
    const candidates = [];
    const rejected = [];
    for (const node of visibleMainBlocks) {
      const scored = scoreRecommendCard(node);
      if (scored.score >= 60) candidates.push({ node, ...scored });
      else if (rejected.length < 80) rejected.push({ node, ...scored });
    }
    candidates.sort((a, b) => {
      const ar = a.node.getBoundingClientRect();
      const br = b.node.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height) || ar.top - br.top;
    });
    const accepted = [];
    for (const item of candidates) {
      const duplicate = accepted.some((existing) => existing.node === item.node || existing.node.contains(item.node) || item.node.contains(existing.node));
      if (!duplicate) accepted.push(item);
      if (accepted.length >= 30) break;
    }
    accepted.sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top);
    const debug = {
      page_type: detectCandidateListPageType() || detectPageType(),
      total_visible_blocks: visibleMainBlocks.length,
      possible_card_containers: candidates.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      accepted_previews: accepted.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
      rejected_previews: rejected.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
    };
    console.log("[AI Recruit] scanRecommendCandidateCards accepted", accepted.length);
    return { accepted, rejected, debug };
  }

  function recommendModalCandidate() {
    const item = resumeModalCandidates()[0];
    if (!item) return null;
    const candidate = cardCandidateFromNode({ node: item.node, score: Math.max(80, item.score || 0), reason: item.reason || "recommend_resume_modal" }, "recommend_page");
    candidate.source = "recommend_card";
    candidate.profile_complete = false;
    return candidate.name ? candidate : null;
  }

  function extractCandidateList() {
    const pageType = detectCandidateListPageType() || detectPageType();
    const useRecommendScanner = pageType === "recommend_page" || pageType === "search_page";
    const recommendScan = useRecommendScanner ? scanRecommendCandidateCards() : null;
    const legacyScan = useRecommendScanner ? null : candidateListCardNodes();
    const accepted = recommendScan?.accepted || legacyScan?.accepted || [];
    const rejected = recommendScan?.rejected || legacyScan?.rejected || [];
    const ranked = recommendScan?.accepted || legacyScan?.ranked || [];
    const totalButtons = legacyScan?.total_buttons || greetingCandidateControls().length;
    const candidates = [];
    const seen = new Set();
    const modalCandidate = useRecommendScanner ? recommendModalCandidate() : null;
    if (modalCandidate) {
      const key = `modal|${modalCandidate.name}|${modalCandidate.raw_text.slice(0, 80)}`;
      seen.add(key);
      candidates.push(modalCandidate);
    }
    for (const item of accepted) {
      const candidate = cardCandidateFromNode(item, pageType);
      candidate.profile_complete = false;
      const key = `${candidate.name}|${candidate.age || ""}|${candidate.experience_years ?? ""}|${candidate.education}|${candidate.expected_position}|${candidate.raw_text.slice(0, 80)}`;
      if (!candidate.name || seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= 25) break;
    }
    const recommendDebug = recommendScan?.debug || {
      page_type: pageType,
      possible_card_containers: ranked.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      accepted_previews: accepted.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
      rejected_previews: rejected.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
    };
    const debug = {
      detected_page_type: pageType === "recommend_page" ? "recommend_page" : (pageType === "search_page" ? "search_page" : pageType),
      page_type: pageType === "recommend_page" ? "recommend_page" : (pageType === "search_page" ? "search_page" : pageType),
      url: location.href,
      total_greeting_buttons: totalButtons || 0,
      total_buttons: totalButtons || 0,
      total_visible_blocks: recommendDebug.total_visible_blocks ?? 0,
      possible_card_containers: recommendDebug.possible_card_containers ?? ranked.length,
      candidate_containers_found: accepted.length,
      accepted_candidates: candidates.length,
      rejected_candidates: rejected.length,
      previews: accepted.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
      card_candidates_count: ranked.length,
      accepted_count: candidates.length,
      rejected_count: rejected.length,
      accepted_previews: accepted.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
      rejected_previews: rejected.slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
      modal_candidate_found: Boolean(modalCandidate),
    };
    const recommend_candidate_scan_debug = {
      page_type: debug.page_type,
      total_visible_blocks: recommendDebug.total_visible_blocks ?? debug.total_visible_blocks ?? 0,
      possible_card_containers: debug.possible_card_containers,
      accepted_count: debug.accepted_count,
      rejected_count: debug.rejected_count,
      accepted_previews: debug.accepted_previews,
      rejected_previews: debug.rejected_previews,
    };
    console.log("[AI Recruit] candidate list scan debug", { ...debug, recommend_candidate_scan_debug });
    return { ok: true, page_type: debug.page_type, candidates, debug, candidate_scan_debug: debug, candidate_list_scan_debug: debug, recommend_candidate_scan_debug };
  }

  function detectPageType() {
    const body = textOf(document.body).slice(0, 8000);
    const href = location.href.toLowerCase();
    const listPageType = detectCandidateListPageType();
    if (listPageType) return listPageType;
    if (/\/web\/chat\/index(?:[/?#]|$)/.test(href) || findActiveChatMainPanel()) return "chat_page";
    if (body.includes("沟通")) return "chat_page";
    if (/职位描述|任职要求|发布职位|招聘中|岗位职责/.test(body)) return "job_page";
    if (/期望职位|工作经历|教育经历/.test(body)) return "candidate_page";
    return "unknown";
  }

  function recommendPageJobDebug() {
    const blocks = queryVisible(["button", "span", "div", "section"])
      .map((node) => ({ node, text: oneLine(textOf(node)), rect: node.getBoundingClientRect() }))
      .filter((item) => item.text.length >= 2 && item.text.length <= 160)
      .filter((item) => item.rect.left > 180 && item.rect.top < 260)
      .filter((item) => /职位|岗位|招聘|推荐牛人|搜索/.test(item.text))
      .slice(0, 12);
    return {
      candidates: blocks.map((item) => ({ ...debugNode(item.node, 0, "recommend_job_context"), text: item.text })),
      selected_text: blocks.find((item) => /职位|岗位/.test(item.text))?.text || "",
    };
  }

  function extractPageContext() {
    try {
      const pageType = detectPageType();
      if (pageType === "recommend_page") {
        return {
          ok: true,
          page_type: pageType,
          url: location.href,
          title: document.title,
          job: emptyJob("recommend_page"),
          candidate: emptyCandidate("recommend_page"),
          chat: { candidate_name: "", messages_text: "", latest_messages: [], source: "recommend_page" },
          context_id: simpleHash(`${document.title}|${location.href}`),
          warnings: [],
          recommend_job_debug: recommendPageJobDebug(),
        };
      }
      const jobRes = extractJob();
      const candidateRes = extractCandidate();
      const chatRes = extractChat();
      const warnings = [];
      if (!jobRes.ok) warnings.push("未识别当前沟通岗位，请确认聊天中有岗位卡或手动配置岗位");
      if (!candidateRes.ok) warnings.push("未识别候选人姓名，请打开具体候选人聊天或在线简历");
      if (candidateRes.warning) warnings.push(candidateRes.warning);
      if (!chatRes.ok && pageType === "chat_page") warnings.push(chatRes.error || "未检测到当前聊天窗口");
      const job = jobRes.job || emptyJob();
      const candidate = candidateRes.candidate || emptyCandidate();
      const base = candidate.name ? `${candidate.name}|${job.title || ""}|${location.href}` : `${document.title}|${location.href}`;
      return {
        ok: true,
        page_type: pageType,
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
      const pageType = detectPageType();
      if (pageType === "recommend_page") {
        console.log("[AI Recruit] DEBUG_DOM recommend_page branch");
        const candidateList = extractCandidateList();
        return {
          ok: true,
          url: location.href,
          title: document.title,
          page_type: "recommend_page",
          page_router_debug: { detected_page_type: pageType, url: location.href },
          recommend_job_debug: recommendPageJobDebug(),
          recommend_candidate_scan_debug: candidateList.recommend_candidate_scan_debug,
          resume_modal_debug: resumeModalCandidates().slice(0, 10).map((item) => debugNode(item.node, item.score, item.reason)),
        };
      }
      const job = extractJob();
      const candidate = extractCandidate();
      const chat = extractChat();
      const candidateList = extractCandidateList();
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
        job_detail_modal_candidates: jobDetailModalCandidates().slice(0, 20).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title, parsed_city: item.city, parsed_salary: item.salary, title_source: item.title_source || "", title_source_text: item.title_source_text || "", rejected_title_candidates: item.rejected_title_candidates || [], job_title_candidates: item.job_title_candidates || [], preferred_keywords: item.preferred_keywords || [], parsed_experience: item.experience_required, parsed_education: item.education_required })),
        chat_job_card_candidates: chatJobCardCandidates().slice(0, 20).map((item) => ({ ...debugNode(item.node, item.score, item.reason), parsed_title: item.title })),
        candidate_header_candidates: candidateHeaderCandidates().slice(0, 20).map(candidateHeaderDebugItem),
        resume_modal_candidates: resumeModalCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        profile_panel_candidates: profilePanelCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_header_candidates: chatHeaderCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        selected_chat_item_candidates: selectedChatItemCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        chat_message_candidates: chatMessageCandidates().slice(0, 20).map((item) => debugNode(item.node, item.score, item.reason)),
        input_candidates: inputCandidates().slice(0, 20).map((item) => debugNode(item.el, item.score, item.reason)),
        candidate_parse_result: candidate.debug?.candidate_parse_result || pickCandidateDebug(candidate.candidate),
        candidate_completeness_debug: candidateCompletenessDebug(candidate.candidate),
        candidate_asset_parse_debug: {
          phone: candidate.candidate?.phone || "",
          wechat: candidate.candidate?.wechat || "",
          email: candidate.candidate?.email || "",
          companies: candidate.candidate?.companies || [],
          projects: candidate.candidate?.projects || [],
          styles: candidate.candidate?.styles || [],
          project_keywords: candidate.candidate?.project_keywords || [],
          style_keywords: candidate.candidate?.style_keywords || [],
          company_keywords: candidate.candidate?.company_keywords || [],
        },
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
        candidate_scan_debug: candidateList.candidate_scan_debug,
        candidate_list_scan_debug: candidateList.candidate_list_scan_debug,
        recommend_candidate_scan_debug: candidateList.recommend_candidate_scan_debug,
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
      else if (message?.type === "EXTRACT_CANDIDATE_LIST") sendResponse(extractCandidateList());
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
