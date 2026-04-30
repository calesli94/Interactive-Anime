function tryFillMessage(text) {
  const selectors = ["textarea", "[contenteditable='true']", "input[type='text']", ".chat-input textarea", ".boss-chat__input textarea"];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus();
      return true;
    }
    if (el.isContentEditable) {
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
      return true;
    }
  }
  return false;
}

function extractCandidateInfo() {
  const text = document.body?.innerText?.slice(0, 1500) || "";
  if (!text) return { ok: false };
  return { ok: true, candidate: { name: "页面候选人", raw_text: text, skills: ["UE"], experience_years: 3, project_keywords: ["次世代"], last_active: "today", contact_status: "未联系" } };
}

function extractChatMessages() {
  const nodes = [...document.querySelectorAll('.message, .chat-item, .im-message')].map((n) => n.textContent?.trim()).filter(Boolean);
  if (!nodes.length) return { ok: false };
  return { ok: true, text: nodes.join("\n") };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FILL_GREETING") sendResponse({ ok: tryFillMessage(message.text || "") });
  if (message?.type === "EXTRACT_CANDIDATE") sendResponse(extractCandidateInfo());
  if (message?.type === "EXTRACT_CHAT") sendResponse(extractChatMessages());
});
