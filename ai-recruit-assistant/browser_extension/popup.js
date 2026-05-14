// popup.js 负责插件弹窗里的按钮交互，以及调用本地 FastAPI 服务。

const API_BASE = "http://127.0.0.1:8787";
let currentCandidate = null;
let currentCandidates = [];
let currentCandidateIndex = 0;

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

function textOrDash(value) {
  return value ? String(value) : "-";
}

function renderCandidate(index) {
  currentCandidateIndex = Math.max(0, Math.min(index, currentCandidates.length - 1));
  currentCandidate = currentCandidates[currentCandidateIndex] || null;

  if (!currentCandidate) {
    $("candidateCount").textContent = "本页识别到 0 个候选人，请确认当前页面是 BOSS 推荐牛人列表页。";
    $("candidateName").textContent = "-";
    $("candidateAge").textContent = "-";
    $("candidateEducation").textContent = "-";
    $("candidateSalary").textContent = "-";
    $("candidateTitle").textContent = "-";
    $("candidateText").value = "";
    return;
  }

  $("candidateCount").textContent = `本页识别到 ${currentCandidates.length} 个候选人，当前第 ${currentCandidateIndex + 1} 个。`;
  $("candidateName").textContent = textOrDash(currentCandidate.name);
  $("candidateAge").textContent = textOrDash(currentCandidate.age);
  $("candidateEducation").textContent = textOrDash(currentCandidate.education);
  $("candidateSalary").textContent = textOrDash(currentCandidate.expected_salary);
  $("candidateTitle").textContent = textOrDash(currentCandidate.expected_position || currentCandidate.title);
  $("candidateText").value = currentCandidate.raw_text || "";
}


function renderDebugNodes(debugNodes) {
  $("debugSummary").textContent = `debug_nodes 数量：${debugNodes.length}`;
  $("debugNodes").innerHTML = "";

  debugNodes.forEach((node) => {
    const item = document.createElement("div");
    item.className = "debug-item";
    item.textContent = [
      `#${node.index} ${node.tag}`,
      `className: ${node.className || "-"}`,
      `id: ${node.id || "-"}`,
      `size: ${node.width} x ${node.height}`,
      `salary=${node.hasSalary} age=${node.hasAge} education=${node.hasEducation} greeting=${node.hasGreetingButton}`,
      `xpath: ${node.xpath}`,
      `textPreview: ${node.textPreview}`,
    ].join("\n");
    $("debugNodes").appendChild(item);
  });
}

async function outputDOMDebug() {
  try {
    const result = await sendMessageToActiveTab({ type: "DOM_DEBUG_FULL" });
    const debugNodes = result.debug_nodes || [];
    renderDebugNodes(debugNodes);
    $("resultBox").textContent = JSON.stringify({
      debug_nodes_count: result.debug_nodes_count,
      page_title: result.page_title,
      source_url: result.source_url,
    }, null, 2);
  } catch (error) {
    $("debugSummary").textContent = `DOM 调试失败：${error.message}`;
  }
}

async function extractCandidate() {
  try {
    const result = await sendMessageToActiveTab({ type: "EXTRACT_CANDIDATE" });
    currentCandidates = result.candidates || (result.candidate ? [result.candidate] : []);
    renderCandidate(0);

    $("resultBox").textContent = JSON.stringify({
      candidate_count: result.candidate_count || currentCandidates.length,
      debug_cards: result.debug_cards || [],
      validation: currentCandidate ? currentCandidate.validation : null,
    }, null, 2);
  } catch (error) {
    $("resultBox").textContent = `抓取失败：${error.message}\n请刷新页面后重试。`;
  }
}

function candidateFromForm() {
  return {
    name: $("candidateName").textContent === "-" ? "未知候选人" : $("candidateName").textContent,
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

function showPreviousCandidate() {
  if (!currentCandidates.length) return;
  renderCandidate(currentCandidateIndex - 1);
}

function showNextCandidate() {
  if (!currentCandidates.length) return;
  renderCandidate(currentCandidateIndex + 1);
}

$("checkServiceBtn").addEventListener("click", checkService);
$("extractBtn").addEventListener("click", extractCandidate);
$("domDebugBtn").addEventListener("click", outputDOMDebug);
$("prevCandidateBtn").addEventListener("click", showPreviousCandidate);
$("nextCandidateBtn").addEventListener("click", showNextCandidate);
$("saveBtn").addEventListener("click", saveCandidate);
$("analyzeBtn").addEventListener("click", analyzeCandidate);

// 打开 popup 时自动检查一次服务状态，减少新手操作步骤。
checkService();
