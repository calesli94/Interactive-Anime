// content.js 运行在候选人页面里，负责读取当前页面 DOM。
// 第一阶段先抓 document.body.innerText，后续可以在这里补充 BOSS 直聘专用 selector。

function guessCandidateName(pageText) {
  // 很多简历页第一行可能就是姓名；抓不到时由后端/前端使用“未知候选人”。
  const firstLine = pageText.split("\n").map((line) => line.trim()).find(Boolean);
  return firstLine && firstLine.length <= 20 ? firstLine : "未知候选人";
}

function guessCandidateTitle(pageText) {
  // 简单尝试从文本中找职位关键词，MVP 不追求准确。
  const titles = ["前端", "后端", "Python", "Java", "产品经理", "运营", "设计", "HR", "招聘"];
  return titles.find((title) => pageText.includes(title)) || "";
}

function extractCandidateFromPage() {
  const rawText = document.body ? document.body.innerText.trim() : "";

  return {
    name: guessCandidateName(rawText),
    title: guessCandidateTitle(rawText),
    raw_text: rawText,
    source_url: window.location.href,
    page_title: document.title,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "EXTRACT_CANDIDATE") {
    sendResponse({ ok: true, candidate: extractCandidateFromPage() });
    return true;
  }

  return false;
});
