const API = "http://127.0.0.1:8787";
const state = {
  serviceOnline:false,
  settings:null,
  pageContext:null,
  job:null,
  candidate:null,
  chat:null,
  contextId:"",
  priorityResult:null,
  messageVariants:[],
  selectedMessage:null,
  chatResult:null,
  todayStats:null,
  followups:[],
};

const $ = (id) => document.getElementById(id);
async function api(path, opts={}){ const r=await fetch(`${API}${path}`,opts); if(!r.ok){ let msg=`${path} ${r.status}`; try{ const j=await r.json(); msg=j.detail||msg; }catch{} throw new Error(msg); } return r.json(); }
function notify(msg, type='info'){
  const text=String(msg||'');
  const el=$('action-feedback');
  if(el) el.textContent=text;
  if(type==='warn') console.warn(text);
  else console.log(text);
}
function feedback(msg, type='info'){ notify(msg, type); }
function textOrDash(v){ return v ? String(v) : '-'; }
function hasJobDetail(){ return Boolean(state.job?.jd_complete || state.job?.description || (state.job?.requirements||[]).length || (state.job?.responsibilities||[]).length); }
function isReliableContext(){ return Boolean(state.job?.title) && hasJobDetail() && state.candidate?.profile_complete !== false; }
function renderReliability(){
  const jobSource=state.job?.source||'-';
  const candidateSource=state.candidate?.source||'-';
  const complete=state.candidate?.profile_complete===true?'完整':(state.candidate?.profile_complete===false?'不完整':'-');
  const warning=!isReliableContext()?'当前分析可信度较低：请确认岗位卡和在线简历已打开':'';
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('job-source',jobSource);
  set('candidate-source',candidateSource);
  set('candidate-complete',complete);
  set('analysis-reliability-warning',warning);
  set('score-reliability',warning||'可信');
}

function isBlockedPage(url=''){
  return /^(edge|chrome|extensions):\/\//.test(url) || /^about:/.test(url) || url.startsWith('chrome-extension://') || url.startsWith('edge-extension://');
}

function sleep(ms){ return new Promise((resolve)=>setTimeout(resolve,ms)); }

function queryActiveTab(){
  return new Promise((resolve)=>{
    try{
      chrome.tabs.query({active:true,currentWindow:true},(tabs)=>{
        const err=chrome.runtime.lastError;
        if(err) resolve({ok:false,error:err.message||String(err)});
        else resolve({ok:true,tab:tabs?.[0]});
      });
    }catch(e){
      resolve({ok:false,error:e?.message||String(e)});
    }
  });
}

async function sendMessageToTab(tabId,message){
  return new Promise((resolve)=>{
    try{
      chrome.tabs.sendMessage(tabId,message,(res)=>{
        const err=chrome.runtime.lastError;
        if(err) resolve({ok:false,__message_error:true,error:err.message||String(err)});
        else resolve(res);
      });
    }catch(e){
      resolve({ok:false,__message_error:true,error:e?.message||String(e)});
    }
  });
}

function shouldInjectForMessageError(error=''){
  return error.includes('Receiving end does not exist') || error.includes('Could not establish connection');
}

async function injectContentScript(tabId){
  return new Promise((resolve)=>{
    try{
      chrome.scripting.executeScript({target:{tabId},files:['content.js']},async()=>{
        const err=chrome.runtime.lastError;
        if(err) resolve({ok:false,error:`content.js 注入失败：${err.message||String(err)}`});
        else{
          await sleep(300);
          resolve({ok:true});
        }
      });
    }catch(e){
      resolve({ok:false,error:`content.js 注入失败：${e?.message||e}`});
    }
  });
}

async function waitForContentReady(tabId, attempts=5){
  let lastError='';
  for(let i=0;i<attempts;i+=1){
    const res=await sendMessageToTab(tabId,{type:'PING'});
    if(res && !res.__message_error && res.ok) return {ok:true};
    lastError=res?.error||lastError;
    await sleep(200);
  }
  return {ok:false,error:lastError||'content.js 注入后未响应 PING'};
}

async function sendToContent(message){
  const active=await queryActiveTab();
  if(!active.ok) return {ok:false,error:`无法获取当前标签页：${active.error}`};
  const tab=active.tab;
  if(!tab?.id) return {ok:false,error:'未找到当前活动标签页'};
  if(isBlockedPage(tab.url||'')){
    return {ok:false,error:'当前页面是浏览器内部页面，插件无法读取，请打开 BOSS 页面或普通网页'};
  }

  let res=await sendMessageToTab(tab.id,message);
  if(res && !res.__message_error) return res;

  const firstError=res?.error||'';
  if(firstError && !shouldInjectForMessageError(firstError)){
    return {ok:false,error:firstError};
  }

  const injected=await injectContentScript(tab.id);
  if(!injected.ok) return injected;

  const ready=await waitForContentReady(tab.id);
  if(!ready.ok) return {ok:false,error:`content.js 已注入但未响应，请刷新 BOSS 页面后重试：${ready.error}`};

  res=await sendMessageToTab(tab.id,message);
  if(res && !res.__message_error) return res;

  const secondError=res?.error||'';
  if(secondError && !shouldInjectForMessageError(secondError)) return {ok:false,error:secondError};
  return {ok:false,error:`content.js 已注入但当前页面仍无法建立连接，请刷新 BOSS 页面后重试：${secondError||firstError||'未知原因'}`};
}

async function checkService(){
  try{ await api('/health'); state.serviceOnline=true; $('service-status').textContent='本地服务已连接'; }
  catch{ state.serviceOnline=false; $('service-status').textContent='请先启动本地服务'; }
}

function renderContext(){
  const ctx=state.pageContext||{};
  $('page-type').textContent=textOrDash(ctx.page_type);
  $('context-id').textContent=textOrDash(state.contextId);
  $('current-url').textContent=textOrDash(ctx.url);
  renderJob();
  renderCandidate();
  renderChatContext();
  renderReliability();
}

async function saveJobIfAvailable(){
  if(state.job?.title) await chrome.storage.local.set({lastJob:state.job});
}

async function loadStoredJobIfMissing(){
  if(state.job?.title) return;
  const data=await chrome.storage.local.get('lastJob');
  if(data.lastJob?.title && data.lastJob.source==='manual') state.job=data.lastJob;
}

function renderJob(){
  const job=state.job||{};
  $('job-title').textContent=textOrDash(job.title);
  $('job-city').textContent=textOrDash(job.city);
  $('job-salary').textContent=textOrDash(job.salary);
  $('job-description-preview').textContent=textOrDash((job.description||job.raw_text||'').slice(0,120));
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('job-source-detail', textOrDash(job.source));
  set('job-jd-complete', job.jd_complete?'完整':'不完整');
  set('job-warning', job.warning || (job.title&&!hasJobDetail()?'已识别岗位名称，但缺少岗位职责和任职要求，请补充岗位要求后再分析。':''));
  const desc=$('job-description-manual'); if(desc && !desc.value && job.description) desc.value=job.description;
  const req=$('job-requirements-manual'); if(req && !req.value && (job.requirements||[]).length) req.value=(job.requirements||[]).join('\n');
  renderReliability();
}

function renderCandidate(){
  const c=state.candidate||{};
  $('candidate-name').textContent=textOrDash(c.name);
  $('candidate-title').textContent=textOrDash(c.current_title||c.title||c.expected_position);
  $('candidate-city').textContent=textOrDash(c.expected_city||c.city);
  $('candidate-exp').textContent=c.experience_years?`${c.experience_years}年`:'-';
  $('candidate-skills').textContent=(c.skills||[]).join('、')||'-';
  $('candidate-warning').textContent=c.warning || (c.name?'':'未识别候选人姓名，请确认当前页面为候选人详情或聊天页');
  renderReliability();
}

function renderChatContext(){
  const chat=state.chat||{};
  $('chat-candidate-name').textContent=textOrDash(chat.candidate_name);
  const cName=state.candidate?.name||'';
  const chName=chat.candidate_name||'';
  $('chat-context-warning').textContent=(cName&&chName&&cName!==chName)?'当前聊天对象与已分析候选人不一致，请刷新上下文':'';
}

async function refreshContext(){
  const ctx=await sendToContent({type:'EXTRACT_PAGE_CONTEXT'});
  if(!ctx?.ok){ feedback(ctx?.error || '无法读取当前页面上下文，请刷新页面或确认插件已注入'); return; }
  state.pageContext=ctx;
  state.job=ctx.job?.title ? ctx.job : state.job||{};
  await loadStoredJobIfMissing();
  state.candidate=ctx.candidate||{};
  state.chat=ctx.chat||{};
  state.contextId=ctx.context_id||'';
  await saveJobIfAvailable();
  renderContext();
  const warnings=[];
  if(!ctx.job?.title && ctx.warnings?.includes('未识别岗位信息')) warnings.push('未识别岗位信息，请进入岗位详情页或手动配置岗位');
  if(!ctx.candidate?.name && ctx.warnings?.includes('未识别候选人姓名')) warnings.push('未识别候选人姓名，请打开具体候选人聊天窗口或候选人详情页');
  if(ctx.warnings?.includes('未检测到聊天窗口')) warnings.push('未检测到聊天窗口，请先点击具体候选人对话');
  feedback(warnings.length ? warnings.join('；') : '页面上下文已刷新');
}

async function refreshJob(){
  const res=await sendToContent({type:'EXTRACT_JOB'});
  if(res?.ok){ state.job=res.job?.title ? res.job : state.job||{}; await saveJobIfAvailable(); renderJob(); feedback(state.job?.title?'岗位信息已刷新':'未识别岗位信息，请进入岗位详情页或手动配置岗位'); }
  else feedback(res?.error || '未能读取岗位信息');
}

function manualCandidateIfNeeded(){
  const manual=$('candidate-manual').value.trim();
  if(manual && (!state.candidate?.raw_text || !state.candidate?.name)) {
    state.candidate={...(state.candidate||{}), raw_text:manual, name:state.candidate?.name||''};
  }
}

function jobConfigForApi(){
  const job=state.job||{};
  return {
    title: job.title||'',
    job_title: job.title||'',
    city: job.city||'',
    salary: job.salary||'',
    description: job.description||'',
    responsibilities: job.responsibilities||[],
    requirements: job.requirements||[],
    required_skills: job.requirements||job.keywords||[],
    preferred_keywords: job.preferred_keywords||job.keywords||job.requirements||[],
    jd_complete: Boolean(job.jd_complete || job.description || (job.requirements||[]).length || (job.responsibilities||[]).length),
    source: job.source||'',
    raw_text: job.raw_text||'',
    urgency:'high',
  };
}

async function saveJobConfig(){
  const title=(state.job?.title||$('job-title')?.textContent||'').trim();
  const description=($('job-description-manual')?.value||'').trim();
  const reqText=($('job-requirements-manual')?.value||'').trim();
  if(!title){ feedback('请先刷新并识别岗位名称'); return; }
  if(!description && !reqText){ feedback('请粘贴岗位职责或任职要求后再保存'); return; }
  const requirements=reqText.split(/\n|；|;/).map((x)=>x.trim()).filter(Boolean);
  state.job={...(state.job||{}),title,description,requirements,responsibilities:description.split(/\n|；|;/).map((x)=>x.trim()).filter(Boolean),preferred_keywords:requirements,jd_complete:true,source:'manual',warning:''};
  await chrome.storage.local.set({lastJob:state.job});
  renderJob();
  feedback('岗位配置已保存，将用于候选人适配分析');
}

async function track(event_type,payload={}){
  await api('/api/events/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type,candidate_hash:state.candidate?.name||state.contextId,payload:{...payload,context_id:state.contextId}})});
  await refreshTodayStats();
}

async function analyzeCandidate(){
  if(!state.serviceOnline) return feedback('本地服务未启动');
  if(!state.pageContext) await refreshContext();
  if(!state.candidate?.raw_text){
    const extracted=await sendToContent({type:'EXTRACT_CANDIDATE'});
    if(extracted?.ok) state.candidate=extracted.candidate||state.candidate;
    else if(extracted?.error) feedback(extracted.error);
  }
  manualCandidateIfNeeded();
  renderCandidate();
  if(!state.candidate?.name){ feedback('未识别候选人姓名，请确认当前页面为候选人详情或聊天页'); return; }
  if(!state.job?.title){ feedback('未识别当前沟通岗位，请先刷新上下文'); return; }
  if(!hasJobDetail()) feedback('当前仅有岗位名称，缺少岗位职责/JD，本次分析可信度低，建议补充岗位要求后重新分析');
  try{
    const data=await api('/api/priority/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,job_config:jobConfigForApi(),context_id:state.contextId})});
    state.priorityResult={...data,context_id:state.contextId};
    $('match-rate').textContent=`${data.score}%`;
    $('candidate-level').textContent=textOrDash(data.level);
    $('candidate-priority').textContent=textOrDash(data.priority);
    $('recommended-action').textContent=textOrDash(data.recommended_action);
    $('recommended-mode').textContent=textOrDash(data.recommended_mode);
    $('recommended-reason').textContent=(data.reasons||[]).join('；');
    $('fit-result').textContent=textOrDash(data.fit_result);
    $('message-intent').textContent=textOrDash(data.message_intent);
    $('matched-points').textContent=(data.matched_points||[]).join('；')||'-';
    $('missing-points').textContent=(data.missing_points||[]).join('；')||'-';
    $('risk-points').textContent=(data.risk_points||[]).join('；')||'-';
    $('score-reliability').textContent=textOrDash(data.reliability);
    const genBtn=$('generate-message-btn');
    if(genBtn) genBtn.textContent=data.message_intent==='reject'?'生成拒绝话术':(data.message_intent==='connect'?'生成建立链接话术':'生成话术');
    if(state.candidate?.profile_complete===false){
      $('candidate-priority').textContent='信息不完整，建议打开在线简历后重新分析';
    }
    renderReliability();
    await track('priority_analyzed',{candidate_name:state.candidate.name,job_title:state.job?.title||'',score:data.score});
    feedback(`已分析候选人：${state.candidate.name} / 岗位 ${state.job?.title||'未识别岗位'}`);
  }catch(e){ feedback(`分析失败：${e.message}`); }
}

async function generateMessages(){
  if(!state.candidate?.name || !state.job?.title || !state.priorityResult){ feedback('缺少候选人或岗位信息，请先刷新上下文/分析候选人'); return; }
  try{
    const jobCfg=jobConfigForApi();
    const safeCandidate={name:state.candidate.name,skills:state.candidate.skills||[],project_keywords:state.candidate.project_keywords||[],current_title:state.candidate.current_title||state.candidate.title||'',expected_position:state.candidate.expected_position||''};
    const safeJob={title:jobCfg.title,job_title:jobCfg.job_title,requirements:jobCfg.requirements||[],preferred_keywords:jobCfg.preferred_keywords||[],jd_complete:jobCfg.jd_complete,source:jobCfg.source};
    const data=await api('/api/message/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:safeCandidate,job_config:safeJob,priority_result:state.priorityResult,context_id:state.contextId,chat_text:state.chat?.messages_text||state.chat?.text||''})});
    state.messageVariants=data.variants||[];
    renderMessages();
    await track('message_generated',{candidate_name:state.candidate.name,job_title:state.job.title,count:state.messageVariants.length});
    feedback('话术已生成');
  }catch(e){ feedback(`生成话术失败：${e.message}`); }
}

function renderMessages(){
  const box=$('message-list');
  box.innerHTML='';
  state.messageVariants.forEach((v,i)=>{
    const item=document.createElement('div');
    item.className='reply-box';
    item.innerHTML=`<p><b>${state.candidate.name}</b> / <b>${state.job.title}</b> / ${v.strategy}</p><p>${v.message}</p><p>原因：${v.reason||''}</p><button data-copy="${i}">复制</button><button data-fill="${i}">填入输入框</button>`;
    box.appendChild(item);
  });
}

async function fillMessage(message,strategy){
  if(state.pageContext?.page_type !== 'chat_page'){ feedback('请先打开具体候选人聊天窗口'); return false; }
  const res=await sendToContent({type:'FILL_GREETING',text:message});
  if(res?.ok){
    await track('fill_message',{candidate_name:state.candidate?.name||'',job_title:state.job?.title||'',strategy,method:res.method});
    feedback(`已填入当前聊天输入框：候选人 ${state.candidate?.name||'-'} / 岗位 ${state.job?.title||'-'}`);
    return true;
  }
  const d=res?.debug;
  feedback(d?`填入失败：${res.error} textarea=${d.textarea_count}, input=${d.input_count}, editable=${d.contenteditable_count}, textbox=${d.textbox_count}`:'填入失败：未找到可输入的聊天框');
  return false;
}

async function markCandidate(event_type,successText){
  if(event_type==='candidate_starred' && (!state.priorityResult?.candidate_starred || state.candidate?.profile_complete===false)){ feedback('信息不完整或存在风险，暂不建议标记优质候选人'); return; }
  try{
    await track(event_type,{candidate_name:state.candidate?.name||'',job_title:state.job?.title||''});
    feedback(successText);
  }catch(e){ feedback(`操作失败：${e.message}`); }
}

async function analyzeChat(){
  const res=await sendToContent({type:'EXTRACT_CHAT'});
  const manual=$('chat-manual').value.trim();
  if(res?.candidate_name) state.chat={candidate_name:res.candidate_name,messages_text:res.messages_text||res.text||manual,latest_messages:res.latest_messages||[]};
  const chatText=res?.messages_text||res?.text||manual;
  if(!res?.ok){
    feedback(res?.error || '未检测到聊天窗口，请先点击具体候选人对话');
    return;
  }
  renderChatContext();
  if(state.chat?.candidate_name && state.candidate?.name && state.chat.candidate_name!==state.candidate.name) feedback('当前聊天对象与已分析候选人不一致，请刷新上下文');
  try{
    const data=await api('/api/chat/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_text:chatText,candidate:state.candidate,job_config:jobConfigForApi(),context_id:state.contextId})});
    state.chatResult=data;
    $('chat-status').textContent=textOrDash(data.status);
    $('chat-stage').textContent=textOrDash(data.stage);
    $('chat-advice').textContent=textOrDash(data.next_action);
    $('reply-1').textContent=data.reply_variants?.[0]||'';
    $('reply-2').textContent=data.reply_variants?.[1]||'';
    await track('chat_analyzed',{candidate_name:state.candidate?.name||'',chat_candidate_name:state.chat?.candidate_name||'',status:data.status});
    feedback('聊天分析完成');
  }catch(e){ feedback(`聊天分析失败：${e.message}`); }
}

async function addFollowup(){
  if(!state.chatResult){ feedback('请先分析聊天'); return; }
  try{
    const suggested=state.chatResult.reply_variants?.[0]||state.chatResult.next_action||'';
    await api('/api/followup/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_name:state.candidate?.name||state.chat?.candidate_name||'',candidate_text:state.candidate?.raw_text||'',job_title:state.job?.title||'',context_id:state.contextId,status:state.chatResult.status,priority:state.chatResult.priority,next_action:state.chatResult.next_action,suggested_message:suggested,last_contact_at:new Date().toISOString()})});
    await track('followup_added',{candidate_name:state.candidate?.name||'',job_title:state.job?.title||'',status:state.chatResult.status});
    await refreshFollowups();
    feedback('已加入今日跟进');
  }catch(e){ feedback(`加入跟进失败：${e.message}`); }
}

async function refreshFollowups(){
  try{
    const data=await api('/api/followup/today');
    state.followups=data.items||[];
    const box=$('followup-list');
    box.innerHTML='';
    if(!state.followups.length){ box.textContent='暂无今日待跟进'; return; }
    state.followups.forEach((item,i)=>{
      const div=document.createElement('div');
      div.className='reply-box followup-item';
      div.innerHTML=`<p><b>${item.candidate_name}</b> / ${item.job_title||'-'} / ${item.status} / ${item.priority}</p><p>${item.next_action}</p><p>${item.suggested_message}</p><button data-follow-copy="${i}">复制</button><button data-follow-fill="${i}">填入输入框</button><button data-follow-handled="${i}">标记已处理</button>`;
      box.appendChild(div);
    });
  }catch(e){ feedback(`刷新跟进失败：${e.message}`); }
}

async function refreshTodayStats(){
  try{
    const d=await api('/api/stats/today');
    state.todayStats=d;
    $('today-analyzed').textContent=d.today_analyzed||0;
    $('today-generated').textContent=d.today_generated||0;
    $('today-filled').textContent=d.today_filled||0;
    $('today-sent').textContent=d.today_sent_marked||0;
    $('today-auto').textContent=d.today_auto_executed||0;
    const s=d.status_counts||{};
    $('today-status-split').textContent=`${s['有兴趣']||0}/${s['观望']||0}/${s['未回复']||0}/${s['拒绝']||0}`;
    $('today-followup-added').textContent=d.today_followup_added||0;
    $('today-followup-handled').textContent=d.today_followup_handled||0;
  }catch{}
}

async function loadSettings(){
  try{ state.settings=await api('/api/settings'); $('current-mode').textContent=state.settings.mode; const r=document.querySelector(`input[name='greet_mode'][value='${state.settings.mode}']`); if(r) r.checked=true; }catch(e){ feedback(e.message); }
}
async function saveMode(){ const mode=document.querySelector("input[name='greet_mode']:checked").value; state.settings=await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,min_score:60})}); $('current-mode').textContent=state.settings.mode; feedback('模式已保存'); }
async function queueAction(path){ await api(path,{method:'POST'}); const st=await api('/api/queue/status'); $('queue-count').textContent=st.queue_count; feedback('队列状态已更新'); }
async function queueAdd(){ if(!state.priorityResult){ feedback('请先分析候选人'); return; } const r=await api('/api/queue/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,context_id:state.contextId})}); $('queue-count').textContent=r.queue_count; feedback('已加入队列'); }

async function debugDom(){
  const res=await sendToContent({type:'DEBUG_DOM'});
  $('debug-dom-output').textContent=JSON.stringify(res,null,2).slice(0,3000);
  feedback(res?.ok?'DOM 调试信息已输出':(res?.error||'DOM 调试失败'));
}

function bind(){
  $('refresh-context-btn').onclick=refreshContext;
  $('debug-dom-btn').onclick=debugDom;
  $('refresh-job-btn').onclick=refreshJob;
  $('analyze-btn').onclick=analyzeCandidate;
  $('generate-message-btn').onclick=generateMessages;
  $('save-job-config-btn').onclick=saveJobConfig;
  $('save-mode-btn').onclick=saveMode;
  $('mark-quality-btn').onclick=()=>markCandidate('candidate_starred','已标记为优质候选人');
  $('mark-greeted-btn').onclick=()=>markCandidate('manual_sent_marked','已标记已打招呼');
  $('analyze-chat-btn').onclick=analyzeChat;
  $('add-followup-btn').onclick=addFollowup;
  $('queue-add-btn').onclick=queueAdd;
  $('queue-start-btn').onclick=()=>queueAction('/api/queue/start');
  $('queue-pause-btn').onclick=()=>queueAction('/api/queue/pause');
  $('queue-clear-btn').onclick=()=>queueAction('/api/queue/clear');
  $('queue-stop-all-btn').onclick=()=>queueAction('/api/queue/stop');
  $('message-list').onclick=async(e)=>{ const b=e.target.closest('button'); if(!b)return; const i=Number(b.dataset.copy||b.dataset.fill); const v=state.messageVariants[i]; if(!v)return; if(b.dataset.copy!==undefined){ await navigator.clipboard.writeText(v.message); feedback('已复制'); } if(b.dataset.fill!==undefined) await fillMessage(v.message,v.strategy); };
  $('followup-list').onclick=async(e)=>{ const b=e.target.closest('button'); if(!b)return; const i=Number(b.dataset.followCopy||b.dataset.followFill||b.dataset.followHandled); const item=state.followups[i]; if(!item)return; if(b.dataset.followCopy!==undefined){ await navigator.clipboard.writeText(item.suggested_message); feedback('已复制'); } if(b.dataset.followFill!==undefined) await fillMessage(item.suggested_message,'followup'); if(b.dataset.followHandled!==undefined){ await track('followup_handled',{candidate_name:item.candidate_name,job_title:item.job_title||''}); b.textContent='已处理'; b.disabled=true; feedback('跟进已处理'); }};
  $('fill-reply-1-btn').onclick=()=>fillMessage($('reply-1').textContent,'chat_reply_1');
  $('fill-reply-2-btn').onclick=()=>fillMessage($('reply-2').textContent,'chat_reply_2');
}

window.addEventListener('DOMContentLoaded',async()=>{bind();await loadStoredJobIfMissing();renderJob();await checkService();await refreshContext();if(state.serviceOnline){await loadSettings();await refreshTodayStats();await refreshFollowups();}});
