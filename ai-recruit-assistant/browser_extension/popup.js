// popup.js 负责插件弹窗里的按钮交互，以及调用本地 FastAPI 服务。

const API_BASE = "http://127.0.0.1:8787";
let currentCandidate = null;

const $ = (id) => document.getElementById(id);

async function callApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    throw new Error(`接口请求失败：${response.status}`);
  }
  return response.json();
}

async function checkService() {
  try {
    const data = await callApi("/health");
    $("serviceStatus").textContent = `服务已连接：${data.status}`;
  } catch (error) {
    $("serviceStatus").textContent = "服务未连接，请先启动 FastAPI 后端。";
  }
}

async function sendMessageToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("未找到当前标签页");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

async function extractCandidate() {
  try {
    const result = await sendMessageToActiveTab({ type: "EXTRACT_CANDIDATE" });
    currentCandidate = result.candidate;
    $("candidateName").textContent = currentCandidate.name || "未知候选人";
    $("candidateTitle").textContent = currentCandidate.title || "-";
    $("candidateText").value = currentCandidate.raw_text || "";
  } catch (error) {
    $("resultBox").textContent = `抓取失败：${error.message}\n请刷新页面后重试。`;
  }
}

function candidateFromForm() {
  return {
    name: $("candidateName").textContent || "未知候选人",
    title: $("candidateTitle").textContent === "-" ? "" : $("candidateTitle").textContent,
    raw_text: $("candidateText").value,
    source_url: currentCandidate ? currentCandidate.source_url : "",
  };
}

async function saveCandidate() {
  try {
    const candidate = candidateFromForm();
    const data = await callApi("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    $("resultBox").textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    $("resultBox").textContent = `保存失败：${error.message}`;
  }
}

async function analyzeCandidate() {
  try {
    const payload = {
      candidate: candidateFromForm(),
      job_requirement: $("jobRequirement").value,
    };
    const data = await callApi("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    $("resultBox").textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    $("resultBox").textContent = `分析失败：${error.message}`;
  }
}

$("checkServiceBtn").addEventListener("click", checkService);
$("extractBtn").addEventListener("click", extractCandidate);
$("saveBtn").addEventListener("click", saveCandidate);
$("analyzeBtn").addEventListener("click", analyzeCandidate);

// 打开 popup 时自动检查一次服务状态，减少新手操作步骤。
checkService();
