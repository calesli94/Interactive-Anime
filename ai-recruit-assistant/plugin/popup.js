const API = "http://127.0.0.1:8787";
const state = { serviceOnline:false, settings:null, candidate:null, priorityResult:null, messageVariants:[], selectedMessage:null, chatResult:null, todayStats:null };

async function api(path, opts={}){ const r=await fetch(`${API}${path}`,opts); if(!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); }
function notify(msg){ console.warn(msg); }

async function checkService(){
  try { await api('/health'); state.serviceOnline=true; document.getElementById('service-status').textContent='本地服务已连接'; }
  catch { state.serviceOnline=false; document.getElementById('service-status').textContent='请先启动本地服务'; }
}

async function extractCandidateInfo(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id) return null;
  return new Promise((resolve)=>chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_CANDIDATE'},resolve));
}

async function onAnalyzeCandidate(){
  if(!state.serviceOnline) return notify('本地服务未启动');
  let extracted=await extractCandidateInfo();
  if(!extracted?.ok){ extracted={candidate:{name:'手动候选人',raw_text:document.getElementById('candidate-manual').value,skills:['UE'],experience_years:3,project_keywords:['次世代'],last_active:'today',contact_status:'未联系'}}; notify('页面提取失败，已使用手动输入'); }
  state.candidate=extracted.candidate;
  try{
    const data=await api('/api/priority/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,job_config:{job_title:'游戏美术',required_skills:['UE','Maya'],preferred_keywords:['3A','次世代','角色','场景'],urgency:'high'}})});
    state.priorityResult=data;
    document.getElementById('match-rate').textContent=`${data.score}%`;
    document.getElementById('candidate-level').textContent=data.level;
    document.getElementById('candidate-priority').textContent=data.priority;
    document.getElementById('recommended-action').textContent=data.recommended_action;
    document.getElementById('recommended-mode').textContent=data.recommended_mode;
    document.getElementById('recommended-reason').textContent=(data.reasons||[]).join('；');
    await refreshTodayStats();
  }catch(e){ notify(`分析失败: ${e.message}`); }
}

async function onGenerateScript(){
  if(!state.candidate||!state.priorityResult) return notify('请先分析候选人');
  try{ const data=await api('/api/message/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,priority_result:state.priorityResult,job_config:{job_title:'游戏美术'}})}); state.messageVariants=data.variants||[]; renderMessages(); await refreshTodayStats(); }catch(e){ notify(e.message); }
}

function renderMessages(){ const box=document.getElementById('message-list'); box.innerHTML=''; state.messageVariants.forEach((v,i)=>{ const d=document.createElement('div'); d.className='reply-box'; d.innerHTML=`<p><b>${v.strategy}</b>：${v.message}<br/>原因：${v.reason}</p><button data-copy="${i}">复制</button><button data-fill="${i}">填入输入框</button>`; box.appendChild(d);}); }

async function fillMessage(message,strategy=''){ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(!tab?.id) return false; return new Promise((resolve)=>chrome.tabs.sendMessage(tab.id,{type:'FILL_GREETING',text:message},async(res)=>{ if(res?.ok){ await track('fill_message',{message_strategy:strategy,mode:state.settings?.mode||'assist'}); } resolve(!!res?.ok);})); }

async function track(event_type,payload={}){ try{ await api('/api/events/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type,candidate_hash:(state.candidate?.name||'').slice(0,8),payload})}); }catch{ console.warn('埋点失败'); } }

async function loadSettings(){ try{ state.settings=await api('/api/settings'); document.getElementById('current-mode').textContent=state.settings.mode; const r=document.querySelector(`input[name='greet_mode'][value='${state.settings.mode}']`); if(r) r.checked=true; }catch(e){ notify(e.message);} }
async function saveMode(){ const mode=document.querySelector("input[name='greet_mode']:checked").value; if(mode==='auto'&&!confirm('自动模式会自动执行打招呼动作，请确认你了解风险并主动开启。')) return; state.settings=await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,min_score:60})}); document.getElementById('current-mode').textContent=state.settings.mode; }

async function queueAdd(){ if(!state.priorityResult) return notify('请先分析候选人'); if(state.priorityResult.score < (state.settings?.min_score||60)) return notify('分数低于队列阈值'); const r=await api('/api/queue/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,score:state.priorityResult.score})}); document.getElementById('queue-count').textContent=r.queue_count; }
async function queueAction(path){ await api(path,{method:'POST'}); const st=await api('/api/queue/status'); document.getElementById('queue-count').textContent=st.queue_count; if(path==='/api/queue/start'&&state.settings?.mode==='assist'&&state.messageVariants[0]){ await fillMessage(state.messageVariants[0].message,state.messageVariants[0].strategy); notify('已自动填入，请HR手动发送'); await track('queue_assist_executed',{});} }

async function analyzeChat(){ let chat=''; const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(tab?.id){ const ext=await new Promise((resolve)=>chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_CHAT'},resolve)); chat=ext?.text||''; } if(!chat){ chat=document.getElementById('chat-manual').value; notify('页面提取失败，已使用手动粘贴'); }
  const r=await api('/api/chat/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_text:chat})}); state.chatResult=r; document.getElementById('chat-status').textContent=r.status; document.getElementById('chat-stage').textContent=r.stage; document.getElementById('chat-advice').textContent=r.next_action; document.getElementById('reply-1').textContent=r.reply_variants?.[0]||''; document.getElementById('reply-2').textContent=r.reply_variants?.[1]||''; }

async function refreshTodayStats(){ try{ const d=await api('/api/stats/today'); state.todayStats=d; document.getElementById('today-analyzed').textContent=d.today_analyzed; document.getElementById('today-generated').textContent=d.today_generated; document.getElementById('today-filled').textContent=d.today_filled; document.getElementById('today-sent').textContent=d.today_sent_marked; document.getElementById('today-auto').textContent=d.today_auto_executed; const s=d.status_counts||{}; document.getElementById('today-status-split').textContent=`${s['有兴趣']||0}/${s['观望']||0}/${s['未回复']||0}/${s['拒绝']||0}`; }catch{} }

function bind(){ document.getElementById('analyze-btn').onclick=onAnalyzeCandidate; document.getElementById('save-mode-btn').onclick=saveMode; document.getElementById('queue-add-btn').onclick=queueAdd; document.getElementById('queue-start-btn').onclick=()=>queueAction('/api/queue/start'); document.getElementById('queue-pause-btn').onclick=()=>queueAction('/api/queue/pause'); document.getElementById('queue-clear-btn').onclick=()=>queueAction('/api/queue/clear'); document.getElementById('queue-stop-all-btn').onclick=()=>queueAction('/api/queue/stop'); document.getElementById('analyze-chat-btn').onclick=analyzeChat; document.getElementById('mark-greeted-btn').onclick=()=>track('manual_sent_marked',{}); document.getElementById('mark-quality-btn').onclick=()=>track('candidate_starred',{}); document.getElementById('generate-followup-btn').onclick=onGenerateScript;
  document.querySelectorAll('.status-btn').forEach(b=>b.onclick=()=>track('status_updated',{status:b.dataset.status}));
  document.getElementById('top10-list').onclick=(e)=>{ const b=e.target.closest('button'); if(!b) return; if(b.dataset.action==='gen') onGenerateScript(); if(b.dataset.action==='queue') queueAdd(); };
  document.getElementById('message-list').onclick=async(e)=>{ const b=e.target.closest('button'); if(!b)return; const i=Number(b.dataset.copy||b.dataset.fill); const v=state.messageVariants[i]; if(!v)return; if(b.dataset.copy!==undefined) navigator.clipboard.writeText(v.message); if(b.dataset.fill!==undefined){ const ok=await fillMessage(v.message,v.strategy); if(!ok) notify('未找到输入框，请确认当前页面是否为聊天页面'); }};
  document.getElementById('fill-reply-1-btn').onclick=()=>fillMessage(document.getElementById('reply-1').textContent,'chat_reply_1'); document.getElementById('fill-reply-2-btn').onclick=()=>fillMessage(document.getElementById('reply-2').textContent,'chat_reply_2'); }

function renderTop10(){ const list=document.getElementById('top10-list'); const rows=[{name:'张晨',score:91,level:'S',action:'优先沟通'},{name:'李宁',score:85,level:'A',action:'建议沟通'}]; list.innerHTML=''; rows.forEach(r=>{ const li=document.createElement('li'); li.className='list-item'; li.innerHTML=`<p>${r.name} | ${r.score} | ${r.level} | ${r.action}</p><button data-action='gen'>生成话术</button><button data-action='queue'>加入队列</button>`; list.appendChild(li);}); }

window.addEventListener('DOMContentLoaded',async()=>{bind();renderTop10();await checkService();if(state.serviceOnline){await loadSettings();await refreshTodayStats();}});
