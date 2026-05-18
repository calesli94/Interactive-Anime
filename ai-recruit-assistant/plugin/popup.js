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
  jobProfileMatches:[],
  currentJobContext:null,
  scannedCandidates:[],
  scannedPageType:"",
  sourcingModule:"",
  sourcingDiagnostics:null,
  sourcingFrameId:null,
  bossFrameMap:null,
  recommendWorkflowState:{
    module_type:'recommend_module',
    best_frame_id:null,
    best_frame_url:'',
    current_job:null,
    scanned_candidates:[],
    opened_candidate:null,
    last_scan_debug:null,
    last_action:'',
  },
  greetingMode:'manual',
  jobStandard:null,
  recommendQueue:[],
  recommendQueueRunning:false,
  recommendQueuePaused:false,
  recommendStopAll:false,
  currentQueueIndex:0,
  autoSafety:{auto_enabled:false,match_threshold:80,daily_send_limit:20,min_delay_seconds:30,max_delay_seconds:90},
};

const $ = (id) => document.getElementById(id);

function currentRecommendWorkflowState(){
  if(!state.recommendWorkflowState){
    state.recommendWorkflowState={module_type:'recommend_module',best_frame_id:null,best_frame_url:'',current_job:null,scanned_candidates:[],opened_candidate:null,last_scan_debug:null,last_action:''};
  }
  return state.recommendWorkflowState;
}

function updateRecommendWorkflowState(patch={}, lastAction=''){
  const current=currentRecommendWorkflowState();
  state.recommendWorkflowState={
    ...current,
    module_type:'recommend_module',
    ...patch,
    last_action:lastAction || patch.last_action || current.last_action || '',
  };
  if(state.recommendWorkflowState.best_frame_id!==null && state.recommendWorkflowState.best_frame_id!==undefined) state.sourcingFrameId=state.recommendWorkflowState.best_frame_id;
  if(state.recommendWorkflowState.best_frame_url) state.sourcingModule='recommend_module';
  return state.recommendWorkflowState;
}

function recommendWorkflowStateDebug(){
  const rw=currentRecommendWorkflowState();
  const names=(rw.scanned_candidates||[]).map((c)=>c?.name).filter(Boolean);
  return {
    best_frame_id: rw.best_frame_id ?? null,
    best_frame_url: rw.best_frame_url || '',
    current_job: rw.current_job || null,
    scanned_candidate_count: (rw.scanned_candidates||[]).length,
    scanned_candidate_names: names,
    opened_candidate_name: rw.opened_candidate?.name || '',
    last_action: rw.last_action || '',
  };
}

function recommendStateIsActive(){
  return state.sourcingModule==='recommend_module' || state.pageContext?.module_type==='recommend_module' || state.pageContext?.page_type==='recommend_page';
}

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

function listFromInput(id){ return splitKeywords($(id)?.value||''); }
function setValue(id,value){ const el=$(id); if(el) el.value=value ?? ''; }
function todayKey(){ return new Date().toISOString().slice(0,10); }
function jobStandardKey(job=state.job||{}){ return `job_standard:${job.title||'unknown'}:${job.city||''}`; }
function greetedKey(){ return `recommend_greeted:${todayKey()}`; }
function autoCountKey(){ return `recommend_auto_sent:${todayKey()}`; }
function getGreetedSet(){ try{return new Set(JSON.parse(localStorage.getItem(greetedKey())||'[]'));}catch{return new Set();} }
function saveGreetedSet(set){ localStorage.setItem(greetedKey(), JSON.stringify([...set])); }
function autoSentToday(){ return Number(localStorage.getItem(autoCountKey())||0); }
function bumpAutoSentToday(){ const next=autoSentToday()+1; localStorage.setItem(autoCountKey(), String(next)); return next; }
const RECOMMEND_QUEUE_STORAGE_KEY='ai_recruit_recommend_queue_state';
function jobKeyFromJob(job=state.job||{}){ return `${job?.title||''}|${job?.city||''}|${job?.salary||''}`; }
function candidateQueueKey(candidate){ return `${candidate?.name||''}|${candidate?.age||''}|${candidate?.expected_position||candidate?.current_title||''}|${candidate?.salary_expectation||''}`; }
function queueCandidateFromItem(item){ return item?.candidate_card || item?.candidate_detail || item || {}; }
function getCurrentQueueItem(){
  if(!state.recommendQueue.length) return null;
  if(state.currentQueueIndex>=0 && state.currentQueueIndex<state.recommendQueue.length) return state.recommendQueue[state.currentQueueIndex];
  const next=state.recommendQueue.findIndex((item)=>item.status==='pending' || item.status==='opened');
  state.currentQueueIndex=next>=0?next:0;
  return state.recommendQueue[state.currentQueueIndex]||null;
}
function currentQueueItem(){ return getCurrentQueueItem(); }
function advanceToNextPending(){
  const start=Math.max(0,state.currentQueueIndex+1);
  let next=state.recommendQueue.findIndex((item,i)=>i>=start && item.status==='pending');
  if(next<0) next=state.recommendQueue.findIndex((item)=>item.status==='pending');
  if(next>=0) state.currentQueueIndex=next;
  return getCurrentQueueItem();
}
function markCurrentStatus(status, patch={}){ return updateCurrentQueueItem({status,...patch}); }
function queueStatusCounts(){ return state.recommendQueue.reduce((acc,item)=>{ acc[item.status]=(acc[item.status]||0)+1; return acc; },{}); }
function normalizeRecommendedAction(action=''){
  const raw=String(action||'').toLowerCase();
  if(/connect|推进|建立|优先|high|s|a/.test(raw)) return 'connect';
  if(/observe|观察|了解|assist|manual|b|c/.test(raw)) return 'observe';
  if(/reject|拒绝|不合适|d/.test(raw)) return 'reject';
  return raw || 'skip';
}
function randomDelayMs(){
  const min=Math.max(1, Number(state.autoSafety.min_delay_seconds||30));
  const max=Math.max(min, Number(state.autoSafety.max_delay_seconds||90));
  return Math.round((min + Math.random()*(max-min))*1000);
}
function setSemiStatus(text){ const el=$('semi-workflow-status'); if(el) el.textContent=text||'-'; renderSemiAutoWorkflow(); }

function serializeRecommendQueueItem(item){
  const c=queueCandidateFromItem(item);
  return {
    candidate_key:item.candidate_key || candidateQueueKey(c),
    name:c.name||item.name||'',
    age:c.age??item.age??null,
    expected_position:c.expected_position||item.expected_position||'',
    salary_expectation:c.salary_expectation||item.salary_expectation||'',
    raw_text:c.raw_text||item.raw_text||'',
    status:item.status||'pending',
    match_score:item.match_score??null,
    match_level:item.match_level||'',
    recommended_action:item.recommended_action||'',
    greeting_message:item.greeting_message||'',
    error:item.error||'',
    reason:item.reason||'',
    updated_at:item.updated_at||item.created_at||new Date().toISOString(),
  };
}
function hydrateRecommendQueueItem(item){
  const candidate={name:item.name||'',age:item.age??null,expected_position:item.expected_position||'',salary_expectation:item.salary_expectation||'',raw_text:item.raw_text||'',source:'recommend_frame_card',profile_complete:false};
  return {candidate_key:item.candidate_key||candidateQueueKey(candidate),candidate_card:candidate,status:item.status||'pending',match_score:item.match_score??null,match_level:item.match_level||'',recommended_action:item.recommended_action||'',greeting_message:item.greeting_message||'',error:item.error||'',reason:item.reason||'',updated_at:item.updated_at||'',created_at:item.updated_at||new Date().toISOString()};
}
function buildRecommendQueueSnapshot(){
  const job=currentRecommendWorkflowState().current_job||state.job||{};
  const current=getCurrentQueueItem();
  return {job_key:jobKeyFromJob(job),job_title:job.title||'',job_city:job.city||'',job_salary:job.salary||'',source_url:currentRecommendWorkflowState().best_frame_url||state.pageContext?.url||'',queue:(state.recommendQueue||[]).map(serializeRecommendQueueItem),current_index:state.currentQueueIndex,current_candidate_key:current?.candidate_key||candidateQueueKey(queueCandidateFromItem(current)),updated_at:new Date().toISOString()};
}
async function persistRecommendQueueState(){
  const snapshot=buildRecommendQueueSnapshot();
  try{ await chrome.storage.local.set({[RECOMMEND_QUEUE_STORAGE_KEY]:snapshot}); }catch(e){ try{ localStorage.setItem(RECOMMEND_QUEUE_STORAGE_KEY, JSON.stringify(snapshot)); }catch{} }
  return snapshot;
}
async function readRecommendQueueSnapshot(){
  try{ const data=await chrome.storage.local.get([RECOMMEND_QUEUE_STORAGE_KEY]); if(data?.[RECOMMEND_QUEUE_STORAGE_KEY]) return data[RECOMMEND_QUEUE_STORAGE_KEY]; }catch{}
  try{ return JSON.parse(localStorage.getItem(RECOMMEND_QUEUE_STORAGE_KEY)||'null'); }catch{return null;}
}
function applyRecommendQueueSnapshot(snapshot){
  state.recommendQueue=(snapshot.queue||[]).map(hydrateRecommendQueueItem);
  state.currentQueueIndex=Math.min(Math.max(0, Number(snapshot.current_index||0)), Math.max(0,state.recommendQueue.length-1));
  state.pendingRecommendQueueState=null;
  renderSemiAutoWorkflow();
  return snapshot;
}
async function restoreRecommendQueueState({force=false}={}){
  const snapshot=await readRecommendQueueSnapshot();
  if(!snapshot?.queue?.length){ renderSemiAutoWorkflow(); return null; }
  const currentKey=jobKeyFromJob(currentRecommendWorkflowState().current_job||state.job||{});
  if(force || !currentKey.replace(/\|/g,'') || snapshot.job_key===currentKey){
    applyRecommendQueueSnapshot(snapshot);
    setSemiStatus(`已恢复队列：${state.recommendQueue.length} 人，当前第 ${state.currentQueueIndex+1} 人`);
    return snapshot;
  }
  state.pendingRecommendQueueState=snapshot;
  setSemiStatus(`检测到岗位变化，是否加载上次队列？上次：${snapshot.job_title||'-'} / ${snapshot.job_city||'-'}`);
  renderSemiAutoWorkflow();
  return snapshot;
}
async function clearRecommendQueueState(){
  state.recommendQueue=[]; state.currentQueueIndex=0; state.pendingRecommendQueueState=null;
  try{ await chrome.storage.local.remove(RECOMMEND_QUEUE_STORAGE_KEY); }catch{}
  try{ localStorage.removeItem(RECOMMEND_QUEUE_STORAGE_KEY); }catch{}
  setSemiStatus('推荐队列已清空');
}
function findQueueIndexForCandidate(candidate){
  const key=candidateQueueKey(candidate||{});
  let idx=state.recommendQueue.findIndex((item)=>item.candidate_key===key || candidateQueueKey(queueCandidateFromItem(item))===key);
  if(idx<0 && candidate?.name) idx=state.recommendQueue.findIndex((item)=>queueCandidateFromItem(item).name===candidate.name);
  return idx;
}
async function jumpToOpenedCandidate(){
  const c=currentRecommendWorkflowState().opened_candidate||state.candidate||{};
  const idx=findQueueIndexForCandidate(c);
  if(idx<0){ setSemiStatus('当前打开候选人不在队列中'); return null; }
  state.currentQueueIndex=idx;
  markCurrentStatus('opened',{candidate_detail:c,reason:'已匹配当前打开简历'});
  await persistRecommendQueueState();
  setSemiStatus(`已跳到当前打开候选人：${c.name||'-'}（第 ${idx+1} 人）`);
  return getCurrentQueueItem();
}
async function jumpToNextPending(){
  const next=advanceToNextPending();
  await persistRecommendQueueState();
  setSemiStatus(next?`已跳到下一个待处理：${queueCandidateFromItem(next).name||'-'}`:'没有待处理候选人');
  return next;
}

async function continuePreviousQueue(){
  const snapshot=state.pendingRecommendQueueState || await readRecommendQueueSnapshot();
  if(!snapshot?.queue?.length){ setSemiStatus('没有可恢复的队列'); return; }
  applyRecommendQueueSnapshot(snapshot);
  await persistRecommendQueueState();
  setSemiStatus(`已加载上次队列：${state.recommendQueue.length} 人，当前第 ${state.currentQueueIndex+1} 人`);
}
async function clearQueueUseCurrentJob(){
  await clearRecommendQueueState();
  setSemiStatus('已清空上次队列，请扫描并加入当前岗位候选人');
}
function htmlEscape(v){ return String(v??'').replace(/[&<>"']/g,(s)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function hasJobDetail(){ return Boolean(state.job?.jd_complete || state.job?.description || (state.job?.requirements||[]).length || (state.job?.responsibilities||[]).length); }
function splitLines(value){
  if(Array.isArray(value)) return value.map((x)=>String(x).trim()).filter(Boolean);
  return String(value||'').split(/\n|；|;/).map((x)=>x.trim()).filter(Boolean);
}
function splitKeywords(value){
  if(Array.isArray(value)) return value.map((x)=>String(x).trim()).filter(Boolean);
  return String(value||'').split(/,|，|；|;|\n/).map((x)=>x.trim()).filter(Boolean);
}
function linesText(value){ return Array.isArray(value) ? value.join('\n') : String(value||''); }
function setJobProfileStatus(text){ const el=$('job-profile-status'); if(el) el.textContent=text||'-'; }
function setCurrentJobContextStatus(text){ const el=$('current-job-context-status'); if(el) el.textContent=text||'-'; }
function normalizeTitleForClient(title=''){
  const text=String(title||'').replace(/\s+/g,'').toLowerCase().replace(/高级|资深|经理|主管/g,'');
  if(/高招|高端招聘|招聘hr|招聘|猎头|hrbp|人力资源/.test(text)) return 'recruitment_high_end';
  if(/技术美术|ta|shader|unity|ue|unreal|虚幻/.test(text)) return 'technical_art';
  if(/ai视频|aigc|comfyui|stable|分镜|剪辑|镜头/.test(text)) return 'ai_video';
  if(/原画|角色|美宣|场景|3d|游戏美术/.test(text)) return 'art';
  return text.replace(/[^0-9a-z\u4e00-\u9fa5]+/g,'');
}
function titlesSimilar(a='',b=''){
  const na=normalizeTitleForClient(a), nb=normalizeTitleForClient(b);
  return Boolean(na && nb && (na===nb || String(a).includes(b) || String(b).includes(a)));
}
function fullJobFromProfile(profile, source='profile_store', status='已从岗位库加载岗位要求'){
  return {
    ...(state.job||{}),
    id: profile.id,
    title: profile.title || state.job?.title || '',
    city: profile.city || state.job?.city || '',
    salary: profile.salary || state.job?.salary || '',
    experience_required: profile.experience_required || state.job?.experience_required || '',
    education_required: profile.education_required || state.job?.education_required || '',
    description: profile.description || '',
    responsibilities: splitLines(profile.responsibilities),
    requirements: splitLines(profile.requirements),
    preferred_keywords: splitKeywords(profile.preferred_keywords),
    raw_text: profile.raw_text || '',
    jd_complete: Boolean(profile.jd_complete || profile.description || profile.responsibilities || profile.requirements),
    source,
    profile_status: status,
    warning: '',
  };
}
function isReliableContext(){ return Boolean(state.job?.title) && hasJobDetail() && state.candidate?.profile_complete === true; }
function normalizedReliability(value){
  const raw=String(value||'').toLowerCase();
  if(state.candidate?.profile_complete===true && state.job?.jd_complete===true && (!raw || raw==='low' || raw==='低')) return 'medium';
  return value || (isReliableContext()?'medium':'low');
}
function reliabilityWarning(){
  const candidateComplete=state.candidate?.profile_complete===true;
  const hasCandidateName=Boolean(state.candidate?.name);
  if(candidateComplete && state.job?.jd_complete!==true) return '岗位JD不完整，请补充岗位职责/任职要求';
  if(!hasCandidateName) return '未识别候选人姓名，请打开具体候选人聊天窗口或在线简历';
  if(!candidateComplete) return '候选人信息不完整，请打开在线简历后重新分析';
  if(!state.job?.title) return '未识别岗位信息：请确认当前聊天窗口内有岗位卡，或手动配置岗位';
  return '';
}
function renderReliability(){
  const jobSource=state.job?.source||'-';
  const candidateSource=state.candidate?.source||'-';
  const complete=state.candidate?.profile_complete===true?'完整':(state.candidate?.profile_complete===false?'不完整':'-');
  const warning=reliabilityWarning();
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('job-source',jobSource);
  set('candidate-source',candidateSource);
  set('candidate-complete',complete);
  set('analysis-reliability-warning',warning);
  set('score-reliability',warning||normalizedReliability(state.priorityResult?.reliability));
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

async function sendMessageToTab(tabId,message,options={}){
  return new Promise((resolve)=>{
    try{
      chrome.tabs.sendMessage(tabId,message,options,(res)=>{
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

async function injectContentScript(tabId,{allFrames=false}={}){
  return new Promise((resolve)=>{
    try{
      chrome.scripting.executeScript({target:{tabId,allFrames},files:['content.js']},async()=>{
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



function analyzeBossFrameMapStandalone(){
  const clean=(v)=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const one=(v)=>clean(v).replace(/\s+/g,' ').trim();
  const rectInfo=(node)=>{ const r=node.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}; };
  const raw=clean(document.body?.innerText || document.body?.textContent || '');
  const flat=one(raw);
  const href=location.href.toLowerCase();
  let detected_module_hint='unknown_module';
  if(/\/web\/(chat|geek)\/recommend(?:[/?#]|$)/.test(href) || /\/web\/frame\/recommend(?:[/?#]|$)/.test(href) || /推荐牛人/.test(flat) || /打招呼/.test(flat) && /期望/.test(flat)) detected_module_hint='recommend_module';
  else if(/深度搜索/.test(flat)) detected_module_hint='deep_search_module';
  else if(/\/web\/chat\/index(?:[/?#]|$)/.test(href)) detected_module_hint='chat_module';
  else if(/牛人管理/.test(flat)) detected_module_hint='talent_manage_module';
  else if(/意向沟通/.test(flat)) detected_module_hint='intention_module';
  else if(/面试/.test(flat)) detected_module_hint='interview_module';
  else if(/职位管理/.test(flat)) detected_module_hint='job_manage_module';
  else if(/\/web\/(chat|geek|boss)\/search(?:[/?#]|$)/.test(href) || /搜索/.test(flat)) detected_module_hint='search_module';
  const nodes=Array.from(document.querySelectorAll('body *')).slice(0,3000).filter((node)=>node instanceof Element);
  const textNodes=nodes.map((node)=>({node,text:one(node.innerText||node.textContent||'')})).filter((item)=>item.text);
  const salaryRe=/(?:\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]|面议)/;
  const cityRe=/重庆|上海|北京|广州|深圳|杭州|成都|武汉|苏州|南京/;
  const navWords=['推荐牛人','深度搜索','搜索','沟通','牛人管理'];
  const candidatePattern=/[\u4e00-\u9fa5]{2,6}\s+(?:刚刚活跃|今日活跃|本周活跃|3日内活跃)[\s\S]{0,160}?\d{2}\s*岁[\s\S]{0,160}?(?:本科|大专|硕士|博士)/g;
  const candidateLikeCount=(flat.match(candidatePattern)||[]).length;
  const greetingButtonNodes=textNodes.filter((item)=>/打招呼|立即沟通/.test(item.text) && /button|a/i.test(item.node.tagName||item.node.getAttribute('role')||''));
  const dropdownLikeNodes=textNodes.filter((item)=>/select|dropdown|job|position|职位|岗位/i.test(`${item.node.className||''} ${item.node.id||''} ${item.node.getAttribute('role')||''} ${item.text}`) && salaryRe.test(item.text) && cityRe.test(item.text));
  const candidateContainers=textNodes.filter((item)=>/\d{2}\s*岁/.test(item.text) && /本科|大专|硕士|博士/.test(item.text) && (salaryRe.test(item.text)||/期望/.test(item.text)) && (/刚刚活跃|今日活跃|本周活跃|3日内活跃/.test(item.text)||/打招呼|立即沟通/.test(item.text)));
  const modalContainers=textNodes.filter((item)=>/工作经历/.test(item.text) && /教育经历|项目经历|期望职位|最近关注/.test(item.text));
  const chatContainers=textNodes.filter((item)=>/输入消息|发送|聊天记录/.test(item.text));
  const has_left_navigation=navWords.some((word)=>flat.includes(word));
  const has_job_selector=dropdownLikeNodes.length>0 || (salaryRe.test(flat) && cityRe.test(flat) && /职位|岗位|推荐|搜索/.test(flat));
  const has_candidate_cards=candidateLikeCount>=1 || candidateContainers.length>=2 || (candidateContainers.length>=1 && greetingButtonNodes.length>0);
  const has_resume_modal=modalContainers.length>0 || (/工作经历/.test(flat) && /教育经历|项目经历|期望职位|最近关注/.test(flat));
  const has_chat_area=chatContainers.length>0;
  const has_greeting_buttons=greetingButtonNodes.length>0 || /打招呼|立即沟通/.test(flat);
  const frame_roles=[];
  if(has_left_navigation) frame_roles.push('navigation_frame');
  if(has_job_selector) frame_roles.push('job_selector_frame');
  if(has_candidate_cards) frame_roles.push('candidate_list_frame');
  if(has_resume_modal) frame_roles.push('resume_modal_frame');
  if(has_chat_area) frame_roles.push('chat_frame');
  const frame_role=has_resume_modal?'resume_modal_frame':(has_candidate_cards?'candidate_list_frame':(has_job_selector?'job_selector_frame':(has_left_navigation?'navigation_frame':(has_chat_area?'chat_frame':'unknown_frame'))));
  const preview=(item)=>({tag:(item.node.tagName||'').toLowerCase(),className:String(item.node.className||'').slice(0,100),id:item.node.id||'',rect:rectInfo(item.node),text_preview:item.text.slice(0,180)});
  return {frame_url:location.href,is_top:window.top===window,frame_role,frame_roles,body_text_length:raw.length,body_preview:raw.slice(0,1000),has_left_navigation,has_job_selector,has_candidate_cards,has_resume_modal,has_chat_area,has_greeting_buttons,detected_module_hint,container_debug:{candidate_like_count:candidateLikeCount,greeting_button_count:greetingButtonNodes.length,job_selector_candidates:dropdownLikeNodes.slice(0,6).map(preview),candidate_card_candidates:candidateContainers.slice(0,6).map(preview),resume_modal_candidates:modalContainers.slice(0,6).map(preview),chat_area_candidates:chatContainers.slice(0,6).map(preview)}};
}

function scoreFrameRole(frame,role){
  if(!frame) return -1;
  if((frame.frame_roles||[]).includes(role)) return 1000 + (frame.body_text_length||0)/100;
  return frame.frame_role===role ? 900 : -1;
}

function renderBossFrameMap(){
  const map=state.bossFrameMap||{frames:[]};
  const frames=map.frames||[];
  const selection=selectBestBossFrame(frames);
  const bestCandidate=selection.frame || [...frames].sort((a,b)=>scoreFrameRole(b,'candidate_list_frame')-scoreFrameRole(a,'candidate_list_frame'))[0];
  const bestResume=[...frames].sort((a,b)=>scoreFrameRole(b,'resume_modal_frame')-scoreFrameRole(a,'resume_modal_frame'))[0];
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('best-candidate-frame', bestCandidate ? `Frame ${bestCandidate.frame_id} / ${selection.reason||''}` : '-');
  set('best-resume-frame', scoreFrameRole(bestResume,'resume_modal_frame')>=0 ? `Frame ${bestResume.frame_id}` : '-');
  const box=$('boss-frame-map-list');
  if(!box) return;
  if(!frames.length){ box.textContent='暂无 Frame Map'; return; }
  box.innerHTML=frames.map((frame,i)=>{
    const roles=(frame.frame_roles&&frame.frame_roles.length?frame.frame_roles:[frame.frame_role||'unknown_frame']).join(' / ');
    const cls=/candidate_list_frame|resume_modal_frame|navigation_frame/.test(roles)?'reply-box frame-map-highlight':'reply-box';
    return `<div class="${cls}"><p><b>Frame ${i+1}</b> (id=${htmlEscape(frame.frame_id??'-')}) / <b>${htmlEscape(roles)}</b> / ${htmlEscape(frame.detected_module_hint||'-')}</p><p>URL：${htmlEscape(frame.frame_url||'-')}</p><p>body_text_length：${htmlEscape(frame.body_text_length||0)}</p><p>${htmlEscape((frame.body_preview||'').slice(0,240))}</p></div>`;
  }).join('');
}

async function analyzeBossFrameMap(){
  feedback('正在分析 BOSS 页面 Frame 结构...');
  const active=await queryActiveTab();
  if(!active.ok){ feedback(`无法获取当前标签页：${active.error}`,'warn'); return; }
  const tab=active.tab;
  if(!tab?.id){ feedback('未找到当前活动标签页','warn'); return; }
  await injectContentScript(tab.id,{allFrames:true});
  const exec=await executeAllFrames(tab.id, analyzeBossFrameMapStandalone);
  if(!exec.ok){ feedback(exec.error||'Frame Map 分析失败','warn'); return; }
  const frames=(exec.results||[]).map((item)=>({...(item.result||{}),frame_id:item.frameId})).filter((frame)=>frame.frame_url);
  const selection=selectBestBossFrame(frames);
  state.bossFrameMap={top_url:tab.url||'',frames,frame_selection_debug:selection};
  state.sourcingDiagnostics=state.bossFrameMap;
  state.sourcingFrameId=selection.best_frame_id;
  state.sourcingModule=overallModuleTypeFromFrames(frames);
  renderBossFrameMap();
  const nav=frames.some((f)=>(f.frame_roles||[]).includes('navigation_frame'));
  const list=frames.some((f)=>(f.frame_roles||[]).includes('candidate_list_frame'));
  const resume=frames.some((f)=>(f.frame_roles||[]).includes('resume_modal_frame'));
  feedback(`Frame Map 完成：${frames.length} 个 frame；导航=${nav?'有':'无'}，候选列表=${list?'有':'无'}，简历弹窗=${resume?'有':'无'}`, list?'info':'warn');
}

function diagnoseBossFrameStandalone(){
  const clean=(v)=>String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const one=(v)=>clean(v).replace(/\s+/g,' ').trim();
  const raw=clean(document.body?.innerText || document.body?.textContent || '');
  const body=raw.slice(0,12000);
  const href=location.href.toLowerCase();
  let module_type='unknown_module';
  if(/\/web\/(chat|geek)\/recommend(?:[/?#]|$)/.test(href) || /\/web\/frame\/recommend(?:[/?#]|$)/.test(href) || /推荐牛人/.test(body) || /打招呼/.test(body) && /期望/.test(body)) module_type='recommend_module';
  else if(/深度搜索/.test(body)) module_type='deep_search_module';
  else if(/\/web\/chat\/index(?:[/?#]|$)/.test(href)) module_type='chat_module';
  else if(/牛人管理/.test(body)) module_type='talent_manage_module';
  else if(/意向沟通/.test(body)) module_type='intention_module';
  else if(/面试/.test(body)) module_type='interview_module';
  else if(/职位管理/.test(body)) module_type='job_manage_module';
  else if(/\/web\/(chat|geek|boss)\/search(?:[/?#]|$)/.test(href) || /搜索/.test(body)) module_type='search_module';
  const flat=one(raw);
  const candidateMatches=flat.match(/[\u4e00-\u9fa5]{2,6}\s+(?:刚刚活跃|今日活跃|本周活跃|3日内活跃)[\s\S]{0,120}?\d{2}\s*岁[\s\S]{0,120}?(?:本科|大专|硕士|博士)/g)||[];
  const hasJobLike=/[^\n\r_｜|]{2,30}\s*[_｜|\s]+(?:北京|上海|广州|深圳|重庆|杭州|成都|武汉|苏州|南京)\s*[_｜|\s]+(?:\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]|面议)/.test(raw);
  return {
    frame_url: location.href,
    is_top: window.top===window,
    module_type,
    body_text_length: raw.length,
    body_text_preview: raw.slice(0,1000),
    has_candidate_like_text: candidateMatches.length>0,
    has_job_like_text: hasJobLike,
    candidate_like_count: candidateMatches.length,
    greeting_button_count: Array.from(document.querySelectorAll('button, [role="button"], a')).filter((node)=>/打招呼|立即沟通|沟通/.test(one(node.innerText||node.textContent||''))).length,
  };
}

async function executeAllFrames(tabId, func){
  return new Promise((resolve)=>{
    try{
      chrome.scripting.executeScript({target:{tabId,allFrames:true},func},(results)=>{
        const err=chrome.runtime.lastError;
        if(err) resolve({ok:false,error:err.message||String(err),results:[]});
        else resolve({ok:true,results:results||[]});
      });
    }catch(e){ resolve({ok:false,error:e?.message||String(e),results:[]}); }
  });
}

function isRecommendBusinessFrameResult(frame){
  return Boolean(frame
    && /\/web\/frame\/recommend(?:[/?#]|$)/.test(frame.frame_url||'')
    && (frame.body_text_length||0)>1000
    && (frame.has_candidate_like_text===true || (frame.candidate_like_count||0)>0));
}

function selectBestBossFrame(frameResults=[]){
  const scored=(frameResults||[]).map((frame)=>{
    const roles=frame.frame_roles||[frame.frame_role].filter(Boolean);
    const text=`${frame.body_preview||''} ${frame.body_text_preview||''}`;
    const reasons=[];
    let score=0;
    const recommendUrl=/\/web\/frame\/recommend(?:[/?#]|$)/.test(frame.frame_url||'');
    const hasCandidateLike=frame.has_candidate_like_text===true || (frame.candidate_like_count||0)>0 || (/\d{2}岁/.test(text) && /本科|大专|硕士|博士/.test(text) && /10年以上|\d+年/.test(text));
    if(recommendUrl){ score+=10000; reasons.push('URL=/web/frame/recommend'); }
    if(recommendUrl && (frame.body_text_length||0)>1000 && hasCandidateLike){ score+=20000; reasons.push('recommend business source of truth'); }
    if(roles.includes('candidate_list_frame')){ score+=5000; reasons.push('role=candidate_list_frame'); }
    if((frame.body_text_length||0)>1000){ score+=1000; reasons.push('body_text_length>1000'); }
    if(hasCandidateLike && /打招呼/.test(text)){ score+=800; reasons.push('candidate-like text'); }
    if(/\d{1,2}\s*[-~—至]\s*\d{1,2}\s*[kK]/.test(text)){ score+=300; reasons.push('selected job salary'); }
    if(roles.includes('resume_modal_frame')){ score+=150; reasons.push('role=resume_modal_frame'); }
    if(frame.is_top){ score-=5000; reasons.push('not top frame preferred'); }
    if(roles.includes('chat_frame') && !recommendUrl){ score-=4000; reasons.push('avoid chat frame'); }
    return {...frame,__score:score,__reason:reasons.join('；')||'no strong business-frame signal'};
  }).sort((a,b)=>b.__score-a.__score);
  const recommendBest=scored.find(isRecommendBusinessFrameResult);
  const best=recommendBest || scored[0] || null;
  return {
    best_frame_id: best?.frame_id ?? null,
    best_frame_url: best?.frame_url || '',
    frame_roles: best?.frame_roles || [best?.frame_role].filter(Boolean),
    reason: best?.__reason || '',
    frame: best,
  };
}

function overallModuleTypeFromFrames(frames=[]){
  const best=selectBestBossFrame(frames);
  if(/\/web\/frame\/recommend(?:[/?#]|$)/.test(best.best_frame_url||'') || (best.frame_roles||[]).includes('candidate_list_frame')) return 'recommend_module';
  return best.frame?.detected_module_hint || best.frame?.module_type || state.sourcingModule || 'unknown_module';
}

function chooseSourcingFrame(frames=[]){
  return selectBestBossFrame(frames).frame || null;
}

async function diagnoseBossPage(){
  const active=await queryActiveTab();
  if(!active.ok) return {ok:false,error:`无法获取当前标签页：${active.error}`};
  const tab=active.tab;
  if(!tab?.id) return {ok:false,error:'未找到当前活动标签页'};
  const injected=await injectContentScript(tab.id,{allFrames:true});
  if(!injected.ok) console.warn(injected.error);
  const exec=await executeAllFrames(tab.id, analyzeBossFrameMapStandalone);
  if(!exec.ok) return exec;
  const frames=(exec.results||[]).map((item)=>({...(item.result||{}),frame_id:item.frameId})).filter((item)=>item.frame_url);
  const chosen=chooseSourcingFrame(frames);
  const selection=selectBestBossFrame(frames);
  state.sourcingDiagnostics={top_url:tab.url||'',frames,frame_selection_debug:selection};
  state.bossFrameMap={top_url:tab.url||'',frames,frame_selection_debug:selection};
  state.sourcingFrameId=selection.best_frame_id ?? chosen?.frame_id ?? null;
  state.sourcingModule=overallModuleTypeFromFrames(frames);
  if(state.sourcingModule==='recommend_module'){
    updateRecommendWorkflowState({best_frame_id:state.sourcingFrameId,best_frame_url:selection.best_frame_url,last_scan_debug:{diagnose:selection}}, 'diagnose');
  }
  renderSourcingStatus();
  return {ok:true,top_url:tab.url||'',frames,frame_selection_debug:selection};
}

async function sendToSourcingFrame(message){
  const active=await queryActiveTab();
  if(!active.ok) return {ok:false,error:`无法获取当前标签页：${active.error}`};
  const tab=active.tab;
  if(!tab?.id) return {ok:false,error:'未找到当前活动标签页'};
  const needDiagnose=state.sourcingFrameId===null || state.sourcingFrameId===undefined || state.sourcingModule==='recommend_module' || currentRecommendWorkflowState().best_frame_url;
  if(needDiagnose){
    const diag=await diagnoseBossPage();
    if(!diag.ok) return diag;
  }
  const rw=currentRecommendWorkflowState();
  const frameId=(state.sourcingModule==='recommend_module' && rw.best_frame_id!==null && rw.best_frame_id!==undefined) ? rw.best_frame_id : state.sourcingFrameId;
  let options=frameId!==null && frameId!==undefined ? {frameId} : {};
  let res=await sendMessageToTab(tab.id,message,options);
  if(res && !res.__message_error) return res;
  await injectContentScript(tab.id,{allFrames:true});
  await sleep(200);
  res=await sendMessageToTab(tab.id,message,options);
  if(res && !res.__message_error) return res;
  if(state.sourcingModule==='recommend_module') return {ok:false,error:'推荐工作流未能连接到最佳 /web/frame/recommend 业务 frame，请刷新页面后重试'};
  return sendToContent(message);
}

async function checkService(){
  try{ await api('/health'); state.serviceOnline=true; $('service-status').textContent='本地服务已连接'; }
  catch{ state.serviceOnline=false; $('service-status').textContent='请先启动本地服务'; }
}


function renderSourcingStatus(){
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  const rw=currentRecommendWorkflowState();
  const useRecommend=recommendStateIsActive();
  const moduleText=useRecommend ? 'recommend_module' : (state.sourcingModule || state.pageContext?.module_type || state.pageContext?.page_type || '-');
  const job=useRecommend ? (rw.current_job || null) : state.job;
  const scanned=useRecommend ? (rw.scanned_candidates||[]) : (state.scannedCandidates||[]);
  const opened=useRecommend ? (rw.opened_candidate||null) : state.candidate;
  set('sourcing-module', moduleText);
  set('sourcing-job-title', job?.title ? `${job.title}${job.city?` / ${job.city}`:''}${job.salary?` / ${job.salary}`:''}` : '-');
  set('sourcing-job-profile-status', job?.title ? (hasJobDetail() ? 'matched' : 'unmatched') : '-');
  set('sourcing-scan-count', scanned.length);
  set('sourcing-scan-names', scanned.length ? scanned.slice(0,5).map((c)=>c.name).filter(Boolean).join('、') + (scanned.length>5?'...':'') : '-');
  set('sourcing-resume-candidate', opened?.name || '未打开');
  const best=useRecommend ? {best_frame_id:rw.best_frame_id,best_frame_url:rw.best_frame_url,frame_roles:['recommend_business_frame']} : (state.sourcingDiagnostics?.frame_selection_debug || state.bossFrameMap?.frame_selection_debug);
  set('sourcing-best-frame', best?.best_frame_id!==null && best?.best_frame_id!==undefined ? `Frame ${best.best_frame_id}${best.best_frame_url?` / ${best.best_frame_url}`:''}` : '-');
  const match=state.priorityResult ? `${state.priorityResult.score??'-'} / ${state.priorityResult.level||'-'} / ${state.priorityResult.recommended_action||state.priorityResult.recommendation||'-'}` : '-';
  set('sourcing-match-result', match);
  const debug=$('recommend-workflow-debug');
  if(debug) debug.textContent=JSON.stringify({recommend_workflow_state_debug:recommendWorkflowStateDebug()},null,2);
  if($('semi-queue-count')) renderSemiAutoWorkflow();
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
  renderSourcingStatus();
}

async function saveCurrentJobContext(job=state.job){
  if(!job?.title) return;
  const currentJobContext={
    title:job.title||'', city:job.city||'', salary:job.salary||'',
    experience_required:job.experience_required||'', education_required:job.education_required||'',
    description:job.description||'', responsibilities:job.responsibilities||[], requirements:job.requirements||[],
    preferred_keywords:job.preferred_keywords||job.keywords||[], raw_text:job.raw_text||'',
    source:job.source||'', jd_complete:Boolean(job.jd_complete), updated_at:new Date().toISOString(),
  };
  state.currentJobContext=currentJobContext;
  try { localStorage.setItem('current_job', JSON.stringify(currentJobContext)); sessionStorage.setItem('current_job', JSON.stringify(currentJobContext)); } catch {}
  await chrome.storage.local.set({currentJobContext,lastJob:currentJobContext});
  setCurrentJobContextStatus(`已缓存：${currentJobContext.title} / ${currentJobContext.source||'-'}`);
}
async function saveJobIfAvailable(){ if(state.job?.title) await saveCurrentJobContext(state.job); }

async function restoreCurrentJobContext({force=false}={}){
  const data=await chrome.storage.local.get(['currentJobContext','lastJob']);
  let browserCached=null;
  try { browserCached=JSON.parse(sessionStorage.getItem('current_job') || localStorage.getItem('current_job') || 'null'); } catch {}
  const cached=data.currentJobContext||data.lastJob||browserCached;
  if(!cached?.title) return false;
  state.currentJobContext=cached;
  setCurrentJobContextStatus(`已缓存：${cached.title} / ${cached.source||'-'}`);
  if(force || !state.job?.title){ state.job={...(state.job||{}),...cached,profile_status:'已恢复当前岗位上下文'}; return true; }
  return false;
}

async function loadStoredJobIfMissing(){
  if(state.job?.title) return;
  await restoreCurrentJobContext({force:true});
}

function ensureJobRequirementRows(){
  const salary=$('job-salary');
  const parent=salary?.parentElement?.parentElement;
  const salaryRow=salary?.parentElement;
  if(!parent || !salaryRow) return;
  const ensure=(id,label,after)=>{
    let el=$(id);
    if(el) return el;
    const row=document.createElement('p');
    row.textContent=`${label}：`;
    el=document.createElement('span');
    el.id=id;
    el.textContent='-';
    row.appendChild(el);
    parent.insertBefore(row, after?.nextSibling || salaryRow.nextSibling);
    return el;
  };
  const exp=ensure('job-experience-required','经验要求',salaryRow);
  ensure('job-education-required','学历要求',exp?.parentElement || salaryRow);
}

function renderJob(){
  const job=state.job||{};
  ensureJobRequirementRows();
  $('job-title').textContent=textOrDash(job.title);
  $('job-city').textContent=textOrDash(job.city);
  $('job-salary').textContent=textOrDash(job.salary);
  $('job-experience-required').textContent=textOrDash(job.experience_required);
  $('job-education-required').textContent=textOrDash(job.education_required);
  $('job-description-preview').textContent=textOrDash((job.description||job.raw_text||'').slice(0,120));
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('job-source-detail', textOrDash(job.source));
  set('job-jd-complete', job.jd_complete?'完整':'不完整');
  set('job-warning', job.warning || (job.title&&!hasJobDetail()?'当前岗位缺少JD，请补充岗位要求后保存到岗位要求库。':''));
  setJobProfileStatus(job.profile_status || (job.title ? (hasJobDetail() ? '已加载岗位要求库' : '当前岗位缺少JD，请补充岗位要求') : '-'));
  setCurrentJobContextStatus(state.currentJobContext?.title ? `已缓存：${state.currentJobContext.title} / ${state.currentJobContext.source||'-'}` : '-');
  renderJobProfileMatches();
  const desc=$('job-description-manual'); if(desc && (!desc.value || ['profile_store','profile_store_match','job_detail_modal'].includes(job.source))) desc.value=job.description||'';
  const resp=$('job-responsibilities-manual'); if(resp && (!resp.value || ['profile_store','profile_store_match','job_detail_modal'].includes(job.source))) resp.value=linesText(job.responsibilities||[]);
  const req=$('job-requirements-manual'); if(req && (!req.value || ['profile_store','profile_store_match','job_detail_modal'].includes(job.source))) req.value=linesText(job.requirements||[]);
  const keywords=$('job-keywords-manual'); if(keywords && (!keywords.value || ['profile_store','profile_store_match','job_detail_modal'].includes(job.source))) keywords.value=(job.preferred_keywords||job.keywords||[]).join(',');
  renderReliability();
  renderSourcingStatus();
}

function renderJobProfileMatches(){
  const box=$('job-profile-matches');
  if(!box) return;
  box.innerHTML='';
  const matches=state.jobProfileMatches||[];
  if(!matches.length){ box.textContent='暂无相似岗位配置'; return; }
  matches.slice(0,3).forEach((item,i)=>{
    const div=document.createElement('div');
    div.className='reply-box job-profile-match';
    div.innerHTML=`<p><b>${item.title||item.profile?.title||'-'}</b> / ${item.city||item.profile?.city||'-'} / ${item.salary||item.profile?.salary||'-'} / 匹配分 ${item.score}</p><p>${item.reason||''}</p><button data-use-job-match="${i}">使用此岗位配置</button>`;
    box.appendChild(div);
  });
}

function renderCandidate(){
  const c=state.candidate||{};
  $('candidate-name').textContent=textOrDash(c.name);
  $('candidate-title').textContent=textOrDash(c.current_title||c.title||c.expected_position);
  $('candidate-city').textContent=textOrDash(c.expected_city||c.city);
  $('candidate-exp').textContent=c.experience_years?`${c.experience_years}年`:'-';
  $('candidate-skills').textContent=(c.skills||[]).join('、')||'-';
  const warnings=(c.warnings||[]).filter((warning)=>!(c.profile_complete===true && /信息不完整|打开在线简历/.test(warning)));
  $('candidate-warning').textContent=c.profile_complete===true?'简历信息已完整识别':(c.warning || warnings[0] || (c.name?'':'未识别候选人姓名，请确认当前页面为候选人详情或聊天页'));
  renderReliability();
  renderSourcingStatus();
}

function renderChatContext(){
  const chat=state.chat||{};
  $('chat-candidate-name').textContent=textOrDash(chat.candidate_name);
  const cName=state.candidate?.name||'';
  const chName=chat.candidate_name||'';
  $('chat-context-warning').textContent=recommendStateIsActive() ? '' : ((cName&&chName&&cName!==chName)?'当前聊天对象与已分析候选人不一致，请刷新上下文':'');
}

function applyJobProfile(profile, status='已加载岗位要求库', source='profile_store'){
  if(!profile) return false;
  state.job=fullJobFromProfile(profile, source, status);
  state.jobProfileMatches=[];
  renderJob();
  return true;
}

async function loadJobProfileByTitle(title, {silent=false, city=''}={}){
  const jobTitle=String(title||'').trim();
  const jobCity=String(city || state.job?.city || '').trim();
  if(!jobTitle){ if(!silent) feedback('请先识别岗位名称'); return false; }
  try{
    const data=await api(`/api/job-profile?title=${encodeURIComponent(jobTitle)}&city=${encodeURIComponent(jobCity)}`);
    if(data?.ok && data.profile){
      if(data.match_type==='normalized_title' && data.profile.title !== jobTitle){
        state.jobProfileMatches=[{id:data.profile.id,title:data.profile.title,city:data.profile.city,salary:data.profile.salary,score:60,reason:'归一标题相似',profile:data.profile}];
        state.job={...(state.job||{}),profile_status:'发现相似岗位配置',warning:'发现相似岗位配置，请选择使用'};
        renderJob();
        if(!silent) feedback('发现相似岗位配置，请选择使用');
        return false;
      }
      applyJobProfile(data.profile,'已从岗位库加载岗位要求','profile_store');
      await saveCurrentJobContext(state.job);
      if(!silent) feedback(`已从岗位库加载岗位要求：${data.profile.title}`);
      return true;
    }
    const matchData=await api(`/api/job-profile/match?title=${encodeURIComponent(jobTitle)}&city=${encodeURIComponent(jobCity)}`);
    state.jobProfileMatches=matchData?.matches||[];
    if(state.jobProfileMatches.length){
      state.job={...(state.job||{}),profile_status:'发现相似岗位配置',warning:'发现相似岗位配置，请选择使用或打开岗位详情页抓取'};
      renderJob();
      if(!silent) feedback('发现相似岗位配置，请选择使用');
      return false;
    }
    state.job={...(state.job||{}),jd_complete:false,profile_status:'岗位库暂无该岗位',warning:'岗位库暂无该岗位，请打开岗位详情页抓取或手动补充'};
    renderJob();
    if(!silent) feedback(data?.message || '岗位库暂无该岗位，请打开岗位详情页抓取或手动补充');
    return false;
  }catch(e){
    if(!silent) feedback(`加载岗位要求库失败：${e.message}`,'warn');
    return false;
  }
}

async function loadCurrentJobProfile(){
  await loadJobProfileByTitle(state.job?.title || $('job-title')?.textContent || '');
}

async function saveJobProfile(){
  const title=(state.job?.title||$('job-title')?.textContent||'').trim();
  if(!title){ feedback('请先刷新并识别岗位名称'); return; }
  const description=($('job-description-manual')?.value||'').trim() || state.job?.description || state.job?.raw_text || '';
  const responsibilities=($('job-responsibilities-manual')?.value||'').trim() || linesText(state.job?.responsibilities||[]);
  const requirements=($('job-requirements-manual')?.value||'').trim() || linesText(state.job?.requirements||[]);
  const preferred_keywords=splitKeywords(($('job-keywords-manual')?.value||'') || (state.job?.preferred_keywords||state.job?.keywords||[]));
  if(!description && !responsibilities && !requirements){ feedback('请至少粘贴岗位描述、岗位职责或任职要求后再保存'); return; }
  try{
    const data=await api('/api/job-profile/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,city:state.job?.city||'',salary:state.job?.salary||'',experience_required:state.job?.experience_required||'',education_required:state.job?.education_required||'',description,responsibilities,requirements,preferred_keywords,raw_text:state.job?.raw_text||'',source:state.job?.source||'manual'})});
    if(data?.ok && data.profile){
      applyJobProfile(data.profile,'岗位已保存到岗位库','profile_store');
      await saveCurrentJobContext(state.job);
      feedback(`岗位已保存到岗位库：${title}`);
    }else feedback('保存岗位配置失败');
  }catch(e){ feedback(`保存岗位配置失败：${e.message}`,'warn'); }
}

async function refreshContext(){
  feedback('正在刷新页面上下文...');
  try{
    const diag=await diagnoseBossPage();
    if(diag?.ok && overallModuleTypeFromFrames(diag.frames||[])==='recommend_module'){
      state.sourcingModule='recommend_module';
      const jobRes=await sendToSourcingFrame({type:'EXTRACT_SOURCING_JOB'});
      const listRes=await sendToSourcingFrame({type:'SCAN_SOURCING_LIST'});
      const modalRes=await sendToSourcingFrame({type:'EXTRACT_SOURCING_RESUME_MODAL'});
      state.pageContext={ok:true,page_type:'recommend_page',module_type:'recommend_module',url:diag.top_url||'',title:'',job:jobRes?.job||{},candidate:modalRes?.modal_found?modalRes.candidate:{},chat:{candidate_name:'',messages_text:'',latest_messages:[],source:'recommend_module'},context_id:`recommend_${Date.now()}`,warnings:[]};
      state.job=jobRes?.job||{};
      state.scannedPageType='recommend_page';
      state.scannedCandidates=listRes?.candidates||[];
      if(modalRes?.modal_found && modalRes?.candidate?.name) state.candidate=modalRes.candidate;
      else state.candidate={};
      updateRecommendWorkflowState({current_job:state.job,scanned_candidates:state.scannedCandidates,opened_candidate:state.candidate?.name?state.candidate:null,last_scan_debug:{job:jobRes?.debug||null,list:listRes?.debug||null,resume:modalRes?.debug||null}}, 'refresh_context');
      state.chat=state.pageContext.chat;
      state.contextId=state.pageContext.context_id;
      if(state.job?.title) await loadJobProfileByTitle(state.job.title,{silent:true,city:state.job.city});
      if(state.job?.title) await loadJobStandard();
      if(state.job?.title) updateRecommendWorkflowState({current_job:state.job}, 'refresh_context');
      renderContext();
      renderScannedCandidates();
      setRecommendWorkflowStatus(`推荐页上下文已刷新：${state.job?.title||'-'} / 候选 ${state.scannedCandidates.length}`);
      feedback('推荐页上下文已刷新（使用最佳业务 Frame，未调用聊天抓取）');
      return;
    }
    const ctx=await sendToContent({type:'EXTRACT_PAGE_CONTEXT'});
    if(!ctx?.ok){ feedback(ctx?.error || '无法读取当前页面上下文，请刷新页面或确认插件已注入','warn'); return; }
    state.pageContext=ctx;
    const detectedJob=ctx.job?.title ? ctx.job : null;
    if(ctx.page_type==='recommend_page'){
      state.job=detectedJob||{};
      state.jobProfileMatches=[];
      setRecommendWorkflowStatus(detectedJob ? `推荐页岗位：${detectedJob.title||'-'} / ${detectedJob.city||'-'}` : '推荐页未识别岗位');
    }else{
      await restoreCurrentJobContext({force:false});
      if(detectedJob){
        if(state.currentJobContext?.title && titlesSimilar(detectedJob.title,state.currentJobContext.title) && !detectedJob.jd_complete){
          state.job={...detectedJob,...state.currentJobContext,source:state.currentJobContext.source||'current_job_context',profile_status:'已使用当前岗位上下文缓存'};
        }else if(state.job?.title && !titlesSimilar(detectedJob.title,state.job.title)){
          state.job={...detectedJob,warning:`识别到新岗位：${detectedJob.title}，如需切换请加载/保存岗位库`};
          feedback(`识别到新岗位：${detectedJob.title}，请确认是否切换`,'warn');
        }else{
          state.job=detectedJob;
        }
      }
      await loadStoredJobIfMissing();
      if(state.job?.title && !hasJobDetail()) await loadJobProfileByTitle(state.job.title,{silent:true,city:state.job.city});
    }
    state.candidate=ctx.candidate||{};
    state.chat=ctx.chat||{};
    state.contextId=ctx.context_id||'';
    if(ctx.page_type!=='recommend_page') await saveJobIfAvailable();
    if(ctx.page_type!=='recommend_page' && state.job?.title && state.job?.jd_complete && state.job?.source==='job_detail_modal') await saveJobProfile();
    renderContext();
    const warnings=[];
    const warningText=(ctx.warnings||[]).join('；');
    if(!ctx.job?.title && /岗位/.test(warningText)) warnings.push('未识别岗位信息：请确认当前聊天窗口内有岗位卡，或在下方手动配置岗位');
    if(!ctx.candidate?.name && /候选人姓名/.test(warningText)) warnings.push('未识别候选人姓名，请打开具体候选人聊天窗口或在线简历');
    if(/聊天窗口|聊天主窗口/.test(warningText)) warnings.push('未检测到当前聊天主窗口，请先点击具体候选人对话');
    feedback(warnings.length ? warnings.join('；') : '页面上下文已刷新');
  }catch(e){
    feedback(`刷新上下文失败：${e?.message||e}`,'warn');
  }
}

async function refreshJob(){
  feedback('正在刷新岗位信息...');
  try{
    const res=await sendToContent({type:'EXTRACT_JOB'});
    if(res?.ok){
      state.job=res.job?.title ? res.job : state.job||{};
      if(state.job?.title && state.job.jd_complete){
        state.job.profile_status='已识别完整岗位JD，可保存到岗位库';
        state.job.warning='已识别完整岗位JD，可保存到岗位库';
        state.jobProfileMatches=[];
      }else if(state.job?.title){
        await loadJobProfileByTitle(state.job.title,{silent:true,city:state.job.city});
      }
      await saveJobIfAvailable();
      renderJob();
      feedback(state.job?.title?(state.job.jd_complete?'已识别完整岗位JD，可保存到岗位库':(hasJobDetail()?'岗位信息已刷新，并已加载岗位要求库':'岗位名称已刷新，但当前岗位缺少JD，请补充岗位要求')):'未识别岗位信息：请确认当前聊天窗口内有岗位卡，或手动配置岗位');
    } else {
      feedback(res?.error || '未能读取岗位信息：请确认当前聊天窗口内有岗位卡，或手动配置岗位','warn');
    }
  }catch(e){
    feedback(`刷新岗位失败：${e?.message||e}`,'warn');
  }
}

function manualCandidateIfNeeded(){
  const manual=$('candidate-manual').value.trim();
  if(manual && (!state.candidate?.raw_text || !state.candidate?.name)) {
    state.candidate={...(state.candidate||{}), raw_text:manual, name:state.candidate?.name||''};
  }
}

function jobConfigForApi(){
  const job=state.job||{};
  const manualDescription=($('job-description-manual')?.value||'').trim();
  const manualResponsibilities=($('job-responsibilities-manual')?.value||'').trim();
  const manualRequirements=($('job-requirements-manual')?.value||'').trim();
  const manualKeywords=($('job-keywords-manual')?.value||'').trim();
  const description=job.description||manualDescription||'';
  const responsibilities=splitLines(job.responsibilities?.length ? job.responsibilities : manualResponsibilities);
  const requirements=splitLines(job.requirements?.length ? job.requirements : manualRequirements);
  const preferred_keywords=splitKeywords((job.preferred_keywords||[]).length ? job.preferred_keywords : manualKeywords);
  const standard=state.jobStandard||{};
  const standardMust=standard.must_have_keywords||[];
  const standardNice=standard.nice_to_have_keywords||[];
  const standardReject=standard.reject_keywords||[];
  return {
    title: job.title||'',
    job_title: job.title||'',
    city: job.city||'',
    salary: job.salary||'',
    experience_required: job.experience_required||'',
    education_required: job.education_required||'',
    description,
    responsibilities,
    requirements,
    required_skills: requirements.length ? [...requirements, ...standardMust] : (standardMust.length ? standardMust : (job.keywords||[])),
    preferred_keywords: [...(preferred_keywords.length ? preferred_keywords : (job.keywords||requirements||[])), ...standardNice, ...standardMust],
    reject_keywords: standardReject,
    jd_complete: Boolean(job.jd_complete || description || requirements.length || responsibilities.length),
    source: job.source||'',
    raw_text: job.raw_text||'',
    urgency:'high',
    job_standard: standard,
  };
}

async function saveJobConfig(){
  await saveJobProfile();
}

function candidateAssetPayload(){
  const c=state.candidate||{};
  return {
    name:c.name||'',
    age:c.age||null,
    city:c.expected_city||c.city||'',
    education:c.education||'',
    experience_years:c.experience_years??null,
    current_title:c.current_title||c.title||'',
    expected_position:c.expected_position||'',
    skills:c.skills||[],
    phone:c.phone||'',
    wechat:c.wechat||'',
    email:c.email||'',
    contact:c.contact||{},
    companies:c.companies||c.structured_resume?.companies||[],
    projects:c.projects||c.structured_resume?.projects||[],
    styles:c.styles||c.structured_resume?.styles||[],
    project_keywords:c.project_keywords||c.structured_resume?.project_keywords||[],
    style_keywords:c.style_keywords||c.structured_resume?.style_keywords||[],
    company_keywords:c.company_keywords||c.structured_resume?.company_keywords||[],
    resume_text:c.raw_text||($('candidate-manual')?.value||''),
    resume_hash:c.resume_hash||'',
    source_url:c.source_url||state.pageContext?.url||'',
  };
}

function jobAssetPayload(){
  const job=jobConfigForApi();
  return {
    job_title:job.title||job.job_title||'',
    city:job.city||'',
    salary:job.salary||'',
    experience_required:job.experience_required||'',
    education_required:job.education_required||'',
    responsibilities:job.responsibilities||[],
    requirements:job.requirements||[],
    preferred_keywords:job.preferred_keywords||[],
    jd_hash:job.jd_hash||'',
    description:job.description||'',
    raw_text:job.raw_text||job.description||'',
  };
}

async function saveCandidateAsset({silent=false}={}){
  manualCandidateIfNeeded();
  const payload=candidateAssetPayload();
  if(!payload.name || !(payload.resume_text || payload.current_title || payload.expected_position)){ if(!silent) feedback('数据不完整','warn'); return null; }
  try{
    const data=await api('/api/candidates/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    state.candidate={...(state.candidate||{}),asset_id:data.candidate_id};
    if(!silent) feedback('候选人已保存，联系方式/项目/公司/风格信息已同步');
    return data;
  }catch(e){ if(!silent) feedback(`保存失败：${e.message}`,'warn'); return null; }
}

async function saveJobAsset({silent=false}={}){
  const payload=jobAssetPayload();
  if(!payload.job_title){ if(!silent) feedback('数据不完整','warn'); return null; }
  try{
    const data=await api('/api/jobs/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    state.job={...(state.job||{}),asset_id:data.job_id};
    if(!silent) feedback('岗位已保存');
    return data;
  }catch(e){ if(!silent) feedback(`保存失败：${e.message}`,'warn'); return null; }
}

async function saveMatchAsset({silent=false}={}){
  if(!state.priorityResult){ if(!silent) feedback('数据不完整','warn'); return null; }
  const candidateSaved=state.candidate?.asset_id?{candidate_id:state.candidate.asset_id}:await saveCandidateAsset({silent:true});
  const jobSaved=state.job?.asset_id?{job_id:state.job.asset_id}:await saveJobAsset({silent:true});
  const candidate_id=candidateSaved?.candidate_id;
  const job_id=jobSaved?.job_id;
  if(!candidate_id || !job_id){ if(!silent) feedback('数据不完整','warn'); return null; }
  try{
    const data=await api('/api/matches/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_id,job_id,score:state.priorityResult.score,level:state.priorityResult.level,match_reason:(state.priorityResult.reasons||[]).join('；'),risk_notes:(state.priorityResult.risk_points||[]).join('；'),recommended_action:state.priorityResult.recommended_action||'',recommendation:state.priorityResult.recommended_action||'',matched:state.priorityResult.matched_points||[],missing:state.priorityResult.missing_points||[],risks:state.priorityResult.risk_points||[],reasoning:(state.priorityResult.reasons||[]).join('；'),ai_analysis:state.priorityResult.fit_result||''})});
    if(!silent) feedback('匹配记录已保存');
    renderSourcingStatus();
    return data;
  }catch(e){ if(!silent) feedback(`保存失败：${e.message}`,'warn'); return null; }
}

async function analyzeRuleMatch(){
  feedback('正在执行规则匹配分析...');
  if(!state.serviceOnline) return feedback('本地服务未启动');
  if(!state.pageContext) await refreshContext();
  manualCandidateIfNeeded();
  if(!state.candidate?.name){ feedback('未识别候选人姓名，请先刷新上下文或粘贴候选人信息','warn'); return; }
  if(!state.job?.title){ feedback('未识别岗位信息，请先刷新岗位或保存岗位要求库','warn'); return; }
  const candidateSaved=state.candidate?.asset_id?{candidate_id:state.candidate.asset_id}:await saveCandidateAsset({silent:true});
  const jobSaved=state.job?.asset_id?{job_id:state.job.asset_id}:await saveJobAsset({silent:true});
  const candidate_id=candidateSaved?.candidate_id;
  const job_id=jobSaved?.job_id;
  if(!candidate_id || !job_id){ feedback('候选人或岗位保存失败，无法分析匹配','warn'); return; }
  try{
    const data=await api('/api/match/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_id,job_id})});
    state.ruleMatchResult=data;
    state.priorityResult={
      ...(state.priorityResult||{}),
      score:data.score,
      level:data.level,
      recommended_action:data.recommendation,
      reasons:[data.reasoning].filter(Boolean),
      matched_points:data.matched||[],
      missing_points:data.missing||[],
      risk_points:data.risks||[],
      reliability:'rules_v1',
    };
    $('match-rate').textContent=`${data.score}%`;
    $('candidate-level').textContent=textOrDash(data.level);
    $('candidate-priority').textContent='规则匹配';
    $('recommended-action').textContent=textOrDash(data.recommendation);
    $('recommended-mode').textContent='manual';
    $('recommended-reason').textContent=textOrDash(data.reasoning);
    $('fit-result').textContent='规则匹配V1';
    $('message-intent').textContent='-';
    $('matched-points').textContent=(data.matched||[]).join('；')||'-';
    $('missing-points').textContent=(data.missing||[]).join('；')||'-';
    $('risk-points').textContent=(data.risks||[]).join('；')||'-';
    $('score-reliability').textContent='rules_v1';
    feedback(`规则匹配完成：${data.score} / ${data.level} / ${data.recommendation}`);
  }catch(e){
    feedback(`规则匹配失败：${e.message}`,'warn');
  }
}


function candidateScanPayload(candidate){
  return {
    name:candidate.name||'',
    age:candidate.age||null,
    city:candidate.city||'',
    education:candidate.education||'',
    experience_years:candidate.experience_years??null,
    current_title:candidate.current_title||'',
    expected_position:candidate.expected_position||'',
    skills:candidate.skills||[],
    companies:candidate.companies||[],
    projects:candidate.projects||[],
    styles:candidate.styles||[],
    project_keywords:candidate.project_keywords||[],
    style_keywords:candidate.style_keywords||[],
    company_keywords:candidate.company_keywords||[],
    resume_text:candidate.raw_text||'',
    raw_text:candidate.raw_text||'',
    source_url:candidate.source_url||state.pageContext?.url||'',
  };
}

function renderScannedCandidates(){
  const items=state.scannedCandidates||[];
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('scan-page-type',state.scannedPageType||'-');
  set('scan-candidate-count',items.length);
  const box=$('scan-candidate-list');
  if(!box) return;
  if(!items.length){ box.textContent='暂无扫描结果'; return; }
  renderSourcingStatus();
  box.innerHTML=items.map((c,i)=>{
    const score=c.quick_match?`${c.quick_match.score} / ${c.quick_match.level} / ${c.quick_match.recommendation}`:'-';
    const skills=(c.skills||[]).slice(0,8).map(htmlEscape).join('、')||'-';
    const companies=(c.companies||[]).slice(0,4).map(htmlEscape).join('、')||'-';
    return `<div class="reply-box scan-candidate-card"><p><b>${i+1}. ${htmlEscape(c.name||'-')}</b> ${htmlEscape(c.age||'-')}岁 / ${htmlEscape(c.experience_years_text||((c.experience_years??'-')+'年'))} / ${htmlEscape(c.education||'-')} / ${htmlEscape(c.city||'-')}</p><p>期望/当前：${htmlEscape(c.expected_position||'-')} / ${htmlEscape(c.current_title||'-')}</p><p>技能：${skills}</p><p>公司/学校：${companies} / ${(c.schools||[]).slice(0,3).map(htmlEscape).join('、')||'-'}</p><p>快速匹配：${htmlEscape(score)}</p></div>`;
  }).join('');
}

async function quickScoreScannedCandidates(candidates){
  const job=jobConfigForApi();
  const hasJob=Boolean(job.title || job.description || (job.requirements||[]).length || (job.preferred_keywords||[]).length);
  const status=$('scan-job-status');
  if(!hasJob){ if(status) status.textContent='未加载当前岗位，仅保存候选人资产'; return candidates; }
  if(status) status.textContent='正在快速匹配...';
  const scored=[];
  for(const candidate of candidates){
    try{
      const quick=await api('/api/match/quick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate,job})});
      scored.push({...candidate,quick_match:quick});
    }catch(e){
      scored.push({...candidate,quick_match_error:e.message});
    }
  }
  if(status) status.textContent=`已按当前岗位快速匹配：${job.title||job.job_title||'-'}`;
  return scored;
}


function setRecommendWorkflowStatus(text){ const el=$('recommend-workflow-status'); if(el) el.textContent=text||'-'; renderSourcingStatus(); }

async function diagnoseBossWorkflow(){
  feedback('正在诊断 BOSS 页面所有 frame...');
  const res=await diagnoseBossPage();
  if(!res?.ok){ setRecommendWorkflowStatus(res?.error||'诊断失败'); feedback(res?.error||'诊断失败','warn'); return; }
  const frames=res.frames||[];
  const selection=res.frame_selection_debug||selectBestBossFrame(frames);
  const best=selection.frame || frames.find((f)=>f.frame_id===selection.best_frame_id);
  updateRecommendWorkflowState({
    best_frame_id: selection.best_frame_id ?? best?.frame_id ?? null,
    best_frame_url: selection.best_frame_url || best?.frame_url || '',
    last_scan_debug: {diagnose:{frames_count:frames.length,selection}},
  }, 'diagnose');
  const ok=isRecommendBusinessFrameResult(best);
  setRecommendWorkflowStatus(`诊断完成：${frames.length} 个 frame，最佳推荐 frame=${best?best.frame_id:'未发现'}`);
  const debug=$('debug-dom-output'); if(debug) debug.textContent=JSON.stringify({...res,recommend_workflow_state_debug:recommendWorkflowStateDebug()},null,2).slice(0,5000);
  feedback(ok?'诊断完成：已定位 /web/frame/recommend 业务 frame':'诊断完成：未发现符合条件的推荐业务 frame，请查看 DOM 调试输出', ok?'info':'warn');
}

async function extractRecommendJobWorkflow(){
  feedback('正在识别当前推荐/搜索岗位...');
  const res=await sendToSourcingFrame({type:'EXTRACT_SOURCING_JOB'});
  if(!res?.ok){ setRecommendWorkflowStatus(res?.error||'当前岗位识别失败'); feedback(res?.error||'当前岗位识别失败','warn'); return; }
  state.sourcingModule=res.module_type||state.sourcingModule;
  const parsedJob=res.job||{title:res.title||'',city:res.city||'',salary:res.salary||'',source:'recommend_frame_job_selector',jd_complete:false};
  state.job={...parsedJob,source:parsedJob.source||'recommend_frame_job_selector',jd_complete:false};
  updateRecommendWorkflowState({current_job:state.job,last_scan_debug:{job_debug:res.debug||null}}, 'extract_job');
  state.pageContext={...(state.pageContext||{}),module_type:state.sourcingModule,page_type:'recommend_page',url:currentRecommendWorkflowState().best_frame_url||state.pageContext?.url||res.url||'',job:state.job};
  state.jobProfileMatches=[];
  if(state.job?.title) await loadJobProfileByTitle(state.job.title,{silent:true,city:state.job.city});
  if(state.job?.title) await loadJobStandard();
  if(state.job?.title) updateRecommendWorkflowState({current_job:{...(currentRecommendWorkflowState().current_job||{}),...(state.job||{})}}, 'extract_job');
  renderJob();
  setRecommendWorkflowStatus(`已识别当前岗位：${state.job.title||'-'} / ${state.job.city||'-'} / ${state.job.salary||'-'}`);
  feedback(hasJobDetail()?'当前岗位已识别并加载岗位库':'当前岗位缺少完整JD，请先保存岗位要求或从岗位库选择。', hasJobDetail()?'info':'warn');
}

async function scanRecommendListWorkflow(){
  feedback('正在扫描当前推荐/搜索列表...');
  const res=await sendToSourcingFrame({type:'SCAN_SOURCING_LIST'});
  if(!res?.ok){ setRecommendWorkflowStatus(res?.error||'列表扫描失败'); feedback(res?.error||'列表扫描失败','warn'); return; }
  state.sourcingModule=res.module_type||state.sourcingModule;
  state.scannedPageType=res.page_type||res.module_type||'recommend_page';
  state.scannedCandidates=await quickScoreScannedCandidates(res.candidates||[]);
  updateRecommendWorkflowState({scanned_candidates:state.scannedCandidates,last_scan_debug:res.debug||null}, 'scan_list');
  renderScannedCandidates();
  setRecommendWorkflowStatus(`列表扫描完成：${state.scannedCandidates.length} 位候选人：${state.scannedCandidates.slice(0,5).map((c)=>c.name).filter(Boolean).join('、')||'-'}`);
  feedback(`列表扫描完成：${state.scannedCandidates.length} 位候选人`);
}

async function extractRecommendResumeWorkflow(){
  feedback('正在识别当前打开的简历...');
  const res=await sendToSourcingFrame({type:'EXTRACT_SOURCING_RESUME_MODAL'});
  if(!res?.ok){
    updateRecommendWorkflowState({opened_candidate:null,last_scan_debug:{resume_debug:res?.debug||null,message:res?.error||''}}, 'extract_resume');
    renderSourcingStatus();
    setRecommendWorkflowStatus(res?.error||'未检测到已打开的推荐候选人详情，请先点击候选人姓名打开详情');
    feedback(res?.error||'未检测到已打开的推荐候选人详情，请先点击候选人姓名打开详情','warn');
    return;
  }
  state.sourcingModule=res.module_type||state.sourcingModule;
  state.candidate=res.candidate||{};
  updateRecommendWorkflowState({opened_candidate:state.candidate,last_scan_debug:{resume_debug:res.debug||null}}, 'extract_resume');
  if(state.recommendQueue.length){
    const idx=findQueueIndexForCandidate(state.candidate);
    if(idx>=0){
      state.currentQueueIndex=idx;
      markCurrentStatus('opened',{candidate_detail:state.candidate,reason:'已识别并匹配当前打开简历'});
      await persistRecommendQueueState();
    }
  }
  state.pageContext={...(state.pageContext||{}),module_type:state.sourcingModule,page_type:'recommend_page',candidate:state.candidate};
  renderCandidate();
  setRecommendWorkflowStatus(`已识别当前简历：${state.candidate.name||'-'} / ${state.candidate.expected_position||state.candidate.current_title||'-'}`);
  feedback('当前打开简历已识别');
}

async function analyzeRecommendResumeWorkflow(){
  if(!state.candidate?.profile_complete) await extractRecommendResumeWorkflow();
  if(!state.job?.title) await extractRecommendJobWorkflow();
  await analyzeCandidate();
  renderSourcingStatus();
}

async function generateRecommendGreetingWorkflow(){
  await generateMessages();
  setRecommendWorkflowStatus('打招呼话术已生成，请手动复制；不会自动点击打招呼或自动发送');
}

async function saveRecommendCandidateWorkflow(){
  if(!state.candidate?.name) await extractRecommendResumeWorkflow();
  await saveCandidateAsset();
  await persistRecommendQueueState();
  renderSourcingStatus();
}

async function saveSourcingMatchWorkflow(){
  const saved=await saveMatchAsset();
  await persistRecommendQueueState();
  setRecommendWorkflowStatus(saved?'匹配记录已保存':'匹配记录保存失败');
  renderSourcingStatus();
}


function readJobStandardFromForm(){
  let scoring_weights={};
  const rawWeights=($('standard-scoring-weights')?.value||'').trim();
  if(rawWeights){ try{ scoring_weights=JSON.parse(rawWeights); }catch{ scoring_weights={parse_error:rawWeights}; } }
  return {
    must_have_keywords:listFromInput('standard-must-have'),
    nice_to_have_keywords:listFromInput('standard-nice-have'),
    reject_keywords:listFromInput('standard-reject'),
    target_city:($('standard-target-city')?.value||'').trim(),
    min_experience:Number($('standard-min-experience')?.value||0)||0,
    max_salary:($('standard-max-salary')?.value||'').trim(),
    required_education:($('standard-required-education')?.value||'').trim(),
    required_companies:listFromInput('standard-required-companies'),
    preferred_companies:listFromInput('standard-preferred-companies'),
    preferred_project_types:listFromInput('standard-project-types'),
    preferred_styles:listFromInput('standard-styles'),
    scoring_weights,
  };
}

function populateJobStandardForm(standard=state.jobStandard||{}){
  setValue('standard-must-have',(standard.must_have_keywords||[]).join('，'));
  setValue('standard-nice-have',(standard.nice_to_have_keywords||[]).join('，'));
  setValue('standard-reject',(standard.reject_keywords||[]).join('，'));
  setValue('standard-target-city',standard.target_city||'');
  setValue('standard-min-experience',standard.min_experience||'');
  setValue('standard-max-salary',standard.max_salary||'');
  setValue('standard-required-education',standard.required_education||'');
  setValue('standard-required-companies',(standard.required_companies||[]).join('，'));
  setValue('standard-preferred-companies',(standard.preferred_companies||[]).join('，'));
  setValue('standard-project-types',(standard.preferred_project_types||[]).join('，'));
  setValue('standard-styles',(standard.preferred_styles||[]).join('，'));
  setValue('standard-scoring-weights',standard.scoring_weights && Object.keys(standard.scoring_weights).length ? JSON.stringify(standard.scoring_weights) : '');
}

async function loadJobStandard(){
  const key=jobStandardKey();
  let stored=null;
  try{ stored=JSON.parse(localStorage.getItem(key)||'null'); }catch{}
  if(!stored){
    try{ const data=await chrome.storage.local.get([key]); stored=data[key]||null; }catch{}
  }
  state.jobStandard=stored;
  populateJobStandardForm(stored||{});
  renderSemiAutoWorkflow();
  return stored;
}

async function saveJobStandard(){
  if(!state.job?.title){ feedback('请先识别当前岗位再配置岗位标准','warn'); return; }
  const standard=readJobStandardFromForm();
  state.jobStandard=standard;
  const key=jobStandardKey();
  try{ localStorage.setItem(key, JSON.stringify(standard)); await chrome.storage.local.set({[key]:standard}); }catch(e){ console.warn('save job standard failed', e); }
  await saveJobProfile().catch(()=>{});
  await track('job_standard_saved',{job_title:state.job.title,source_module:'recommend_module',job_standard:standard}).catch(()=>{});
  setSemiStatus('岗位标准已保存到本地岗位库');
}

function readAutoSafetyFromForm(){
  return {
    auto_enabled:Boolean($('semi-auto-enabled')?.checked),
    match_threshold:Number($('semi-match-threshold')?.value||80)||80,
    daily_send_limit:Number($('semi-daily-limit')?.value||20)||20,
    min_delay_seconds:Number($('semi-min-delay')?.value||30)||30,
    max_delay_seconds:Number($('semi-max-delay')?.value||90)||90,
  };
}

function populateAutoSafetyForm(){
  const c=state.autoSafety;
  if($('semi-auto-enabled')) $('semi-auto-enabled').checked=Boolean(c.auto_enabled);
  setValue('semi-match-threshold',c.match_threshold);
  setValue('semi-daily-limit',c.daily_send_limit);
  setValue('semi-min-delay',c.min_delay_seconds);
  setValue('semi-max-delay',c.max_delay_seconds);
}

function saveAutoSafety(){
  const next=readAutoSafetyFromForm();
  if(next.auto_enabled && state.greetingMode==='auto'){
    const ok=confirm('Auto 模式会在满足阈值/限额/去重后自动填入并点击发送。确认启用高风险自动发送？');
    if(!ok){ next.auto_enabled=false; if($('semi-auto-enabled')) $('semi-auto-enabled').checked=false; }
  }
  state.autoSafety=next;
  localStorage.setItem('recommend_auto_safety', JSON.stringify(next));
  setSemiStatus(next.auto_enabled?'Auto 已显式启用（仍受阈值/限额/STOP 约束）':'Auto 未启用');
}

function loadAutoSafety(){
  try{ state.autoSafety={...state.autoSafety,...(JSON.parse(localStorage.getItem('recommend_auto_safety')||'{}')||{})}; }catch{}
  populateAutoSafetyForm();
}

function renderSemiAutoWorkflow(){
  const rw=currentRecommendWorkflowState();
  const job=rw.current_job||state.job||{};
  const item=currentQueueItem();
  const counts=queueStatusCounts();
  const standard=state.jobStandard;
  const set=(id,value)=>{ const el=$(id); if(el) el.textContent=value; };
  set('semi-job-title', job?.title ? `${job.title}${job.city?` / ${job.city}`:''}${job.salary?` / ${job.salary}`:''}` : '-');
  set('semi-standard-status', standard ? '已配置' : '未配置');
  set('semi-scanned-count', (rw.scanned_candidates||[]).length);
  set('semi-queue-count', `${state.recommendQueue.length}（pending ${counts.pending||0} / analyzed ${counts.analyzed||0} / sent ${counts.sent||0}）`);
  set('semi-current-candidate', item ? `${state.currentQueueIndex+1}. ${queueCandidateFromItem(item).name||'-'}` : (state.candidate?.name || '-'));
  set('semi-match-score', item?.match_score ?? state.priorityResult?.score ?? '-');
  set('semi-recommended-action', item?.recommended_action || state.priorityResult?.recommended_action || '-');
  set('semi-current-mode', state.greetingMode || 'manual');
  set('semi-auto-status', state.autoSafety.auto_enabled ? `已启用；今日自动发送 ${autoSentToday()}/${state.autoSafety.daily_send_limit}` : '未启用');
  const box=$('semi-queue-list');
  if(box){
    box.innerHTML=state.recommendQueue.length ? state.recommendQueue.slice(0,20).map((q,i)=>{ const c=queueCandidateFromItem(q); const active=i===state.currentQueueIndex?' ▶':''; return `<div class="reply-box"><b>${i+1}. ${htmlEscape(c.name||'-')}${active}</b> / ${htmlEscape(q.status)} / 分数 ${htmlEscape(q.match_score??'-')} / ${htmlEscape(q.recommended_action||'-')}<br>${htmlEscape(q.reason||q.error||'')}</div>`; }).join('') : '暂无队列';
  }
}

function addRecommendQueue(){
  const candidates=currentRecommendWorkflowState().scanned_candidates||state.scannedCandidates||[];
  if(!candidates.length){ feedback('请先扫描推荐列表','warn'); return; }
  const existing=new Set(state.recommendQueue.map((item)=>candidateQueueKey(item.candidate_card)));
  let added=0;
  for(const c of candidates){
    const key=candidateQueueKey(c);
    if(!c?.name || existing.has(key)) continue;
    state.recommendQueue.push({candidate_key:key,candidate_card:c,status:'pending',match_score:null,match_level:'',greeting_message:'',recommended_action:'',reason:'等待手动打开详情后分析',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    existing.add(key); added+=1;
  }
  state.currentQueueIndex=state.recommendQueue.findIndex((item)=>item.status==='pending');
  if(state.currentQueueIndex<0) state.currentQueueIndex=0;
  persistRecommendQueueState().catch(()=>{});
  setSemiStatus(`已加入推荐队列：新增 ${added}，总数 ${state.recommendQueue.length}`);
}

function updateCurrentQueueItem(patch){
  const item=getCurrentQueueItem();
  if(!item) return null;
  Object.assign(item, patch, {updated_at:new Date().toISOString()});
  if(!item.candidate_key) item.candidate_key=candidateQueueKey(queueCandidateFromItem(item));
  persistRecommendQueueState().catch(()=>{});
  renderSemiAutoWorkflow();
  return item;
}

async function analyzeSemiAutoCurrent(){
  const item=currentQueueItem();
  if(!item){ feedback('队列为空，请先加入推荐队列','warn'); return null; }
  await extractRecommendResumeWorkflow();
  if(!state.candidate?.name || state.candidate.profile_complete!==true){
    updateCurrentQueueItem({status:'opened',reason:'请先在 BOSS 页面手动点击该候选人姓名打开详情'});
    setSemiStatus('未检测到完整详情：请手动打开当前候选人详情后再点分析');
    return null;
  }
  if(!state.job?.title) await extractRecommendJobWorkflow();
  await analyzeCandidate();
  if(!state.priorityResult?.score && state.priorityResult?.score!==0) return null;
  const action=normalizeRecommendedAction(state.priorityResult.recommended_action || state.priorityResult.message_intent);
  updateCurrentQueueItem({status:'analyzed',candidate_detail:state.candidate,match_score:state.priorityResult.score,match_level:state.priorityResult.level||'',recommended_action:action,reason:(state.priorityResult.matched_points||state.priorityResult.reasons||[]).join('；')});
  await logSemiAutoAction('analyzed',{match_result:state.priorityResult});
  setSemiStatus(`分析完成：${state.candidate.name} / ${state.priorityResult.score} / ${action}`);
  return state.priorityResult;
}

function buildLocalGreetingMessage(){
  const action=normalizeRecommendedAction(state.priorityResult?.recommended_action || state.priorityResult?.message_intent);
  if(action==='reject' || action==='skip') return '';
  const name=state.candidate?.name || '';
  const jobTitle=state.job?.title || '当前岗位';
  const point=(state.priorityResult?.matched_points||state.candidate?.skills||state.jobStandard?.nice_to_have_keywords||[]).find(Boolean) || state.candidate?.expected_position || '相关项目经验';
  const prefix=name ? `${name}您好` : '您好';
  const tone=action==='observe' ? '想低压力了解一下近期机会是否合适' : '想和您简单聊一下近期机会是否合适';
  return `${prefix}，看了您的经历，您在${point}方向的经验和我们${jobTitle}比较相关，${tone}。`;
}

function sanitizeGreetingMessage(message){
  return String(message||'').replace(/候选人/g,'您').replace(/匹配分|评分|打分|算法|模型/g,'').replace(/\s+/g,' ').trim().slice(0,180);
}

async function generateSemiAutoGreeting(){
  if(!state.priorityResult?.score && state.priorityResult?.score!==0){ await analyzeSemiAutoCurrent(); }
  const action=normalizeRecommendedAction(state.priorityResult?.recommended_action || state.priorityResult?.message_intent);
  if(action==='reject' || action==='skip'){
    updateCurrentQueueItem({status:'skipped',recommended_action:action,greeting_message:'',reason:'推荐动作不适合主动打招呼'});
    advanceToNextPending();
    await persistRecommendQueueState();
    setSemiStatus('推荐动作不适合主动联系，已跳到下一个待处理');
    return '';
  }
  await generateMessages();
  let msg=sanitizeGreetingMessage(state.messageVariants?.[0]?.message || buildLocalGreetingMessage());
  if(!msg) msg=sanitizeGreetingMessage(buildLocalGreetingMessage());
  if(state.messageVariants?.[0]) state.messageVariants[0].message=msg;
  updateCurrentQueueItem({status:'message_generated',greeting_message:msg,recommended_action:action,reason:'话术已生成，等待人工确认'});
  renderMessages();
  await logSemiAutoAction('message_generated',{generated_message:msg});
  setSemiStatus(`话术已生成：${msg}`);
  return msg;
}

async function fillSemiAutoGreeting(){
  const item=currentQueueItem();
  const msg=item?.greeting_message || state.messageVariants?.[0]?.message;
  if(!msg){ feedback('请先生成话术','warn'); return false; }
  if(state.greetingMode==='manual'){
    feedback('manual 模式不会自动填入，请复制后手动处理','warn');
    return false;
  }
  if(state.greetingMode==='assist' && !confirm('assist 模式将只把话术填入输入框，不会发送。确认填入？')) return false;
  const res=await sendToSourcingFrame({type:'FILL_GREETING',text:msg});
  if(res?.ok){
    updateCurrentQueueItem({status:'filled',greeting_message:msg,reason:'已填入，等待用户手动发送'});
    await logSemiAutoAction('filled',{generated_message:msg,operator_mode:state.greetingMode});
    setSemiStatus('已填入输入框；请在 BOSS 页面人工确认发送');
    return true;
  }
  updateCurrentQueueItem({status:'failed',reason:res?.error||'填入失败'});
  setSemiStatus(res?.error||'填入失败');
  return false;
}

function autoSafetyCheck(item=currentQueueItem()){
  const name=item?.candidate_detail?.name || item?.candidate_card?.name || state.candidate?.name || '';
  const greeted=getGreetedSet();
  if(state.greetingMode!=='auto') return '当前不是 auto 模式';
  if(!state.autoSafety.auto_enabled) return 'auto 未显式启用';
  if(!item?.greeting_message) return '尚未生成话术';
  if((item.match_score??state.priorityResult?.score??0) < state.autoSafety.match_threshold) return '匹配分低于阈值';
  if(autoSentToday() >= state.autoSafety.daily_send_limit) return '今日自动发送已达上限';
  if(greeted.has(name)) return '该候选人今日已打招呼，禁止重复发送';
  if(state.candidate?.profile_complete!==true) return '简历未完整识别';
  if(state.recommendStopAll) return 'STOP ALL 已触发';
  return '';
}

async function sendSemiAutoGreeting({auto=false}={}){
  const item=currentQueueItem();
  if(!item){ feedback('队列为空','warn'); return false; }
  if(state.greetingMode==='manual'){
    const confirmed=confirm('manual 模式不会自动填入或发送。请确认您已在 BOSS 页面手动发送，是否记录为已发送？');
    if(confirmed){
      const greeted=getGreetedSet();
      const name=item?.candidate_detail?.name || item?.candidate_card?.name || state.candidate?.name || '';
      greeted.add(name); saveGreetedSet(greeted);
      updateCurrentQueueItem({status:'sent',reason:'manual 人工确认已发送',greeted_at:new Date().toISOString()});
      await logSemiAutoAction('sent',{generated_message:item.greeting_message||'',operator_mode:'manual',greeted_at:new Date().toISOString()});
      advanceToNextPending();
      await persistRecommendQueueState();
      setSemiStatus('manual 模式：已记录人工发送，已跳到下一个待处理');
    }else{
      updateCurrentQueueItem({status:'message_generated',reason:'manual 模式仅生成话术，未记录发送'});
      setSemiStatus('manual 模式：未自动填入或发送');
    }
    return false;
  }
  if(state.greetingMode==='assist'){
    if(item.status!=='filled'){
      await fillSemiAutoGreeting();
      setSemiStatus('assist 模式：已填入但不会自动发送，请人工点击发送后再确认发送');
      return false;
    }
    if(confirm('assist 模式不会自动点击发送。请确认您已在 BOSS 页面手动发送，是否记录为已发送？')){
      const greeted=getGreetedSet();
      const name=item?.candidate_detail?.name || item?.candidate_card?.name || state.candidate?.name || '';
      greeted.add(name); saveGreetedSet(greeted);
      updateCurrentQueueItem({status:'sent',reason:'assist 人工确认已发送',greeted_at:new Date().toISOString()});
      await logSemiAutoAction('sent',{generated_message:item.greeting_message||'',operator_mode:'assist',greeted_at:new Date().toISOString()});
      advanceToNextPending();
      await persistRecommendQueueState();
      setSemiStatus('assist 模式：已记录人工发送，已跳到下一个待处理');
    }
    return false;
  }
  const risk=autoSafetyCheck(item);
  if(risk){ setSemiStatus(`auto 安全拦截：${risk}`); return false; }
  if(!auto && !confirm('二次确认：将自动填入并点击发送。确认继续？')) return false;
  updateCurrentQueueItem({status:'message_generated',reason:'V1 禁止自动点击打招呼/发送，请改用 manual 或 assist 人工确认'});
  await persistRecommendQueueState();
  setSemiStatus('安全限制：V1 不执行自动发送，也不会自动点击打招呼；请人工确认发送');
  return false;
}

async function logSemiAutoAction(action_status, extra={}){
  const item=currentQueueItem()||{};
  const payload={
    candidate:state.candidate||item.candidate_detail||item.candidate_card||{},
    job:state.job||currentRecommendWorkflowState().current_job||{},
    job_standard:state.jobStandard||{},
    match_result:state.priorityResult||{},
    generated_message:item.greeting_message||state.messageVariants?.[0]?.message||'',
    action_status,
    greeted_at:extra.greeted_at||'',
    source_module:'recommend_module',
    source_url:currentRecommendWorkflowState().best_frame_url||state.pageContext?.url||'',
    operator_mode:state.greetingMode||'manual',
    ...extra,
  };
  try{ await track('recommend_greeting_workflow', payload); }catch(e){ console.warn('log semi auto failed', e); }
  try{ if(state.candidate?.name) await saveCandidateAsset({silent:true}); if(state.priorityResult) await saveMatchAsset({silent:true}); }catch(e){ console.warn('save semi auto assets failed', e); }
}

async function startSemiAutoProcessing(){
  if(!state.recommendQueue.length) addRecommendQueue();
  if(!state.recommendQueue.length) return;
  state.recommendQueueRunning=true; state.recommendQueuePaused=false; state.recommendStopAll=false;
  await persistRecommendQueueState();
  setSemiStatus('半自动处理已开始：V1 请手动打开当前候选人详情后点击“分析当前候选人”');
  if(state.greetingMode==='auto'){
    const ok=confirm('二次确认：auto 会在满足安全规则后自动发送。确认以 auto 模式开始？');
    if(!ok){ state.greetingMode='manual'; const r=document.querySelector("input[name='greet_mode'][value='manual']"); if(r) r.checked=true; }
  }
  renderSemiAutoWorkflow();
}
function pauseSemiAuto(){ state.recommendQueuePaused=true; state.recommendQueueRunning=false; persistRecommendQueueState().catch(()=>{}); setSemiStatus('已暂停'); }
function resumeSemiAuto(){ state.recommendQueuePaused=false; state.recommendQueueRunning=true; persistRecommendQueueState().catch(()=>{}); setSemiStatus('已继续，请手动打开候选人详情后处理'); }
function stopSemiAuto(){ state.recommendStopAll=true; state.recommendQueueRunning=false; state.recommendQueuePaused=false; logSemiAutoAction('stop_all').catch(()=>{}); persistRecommendQueueState().catch(()=>{}); setSemiStatus('STOP ALL 已触发：禁止后续自动发送'); }
async function skipSemiAutoCurrent(){ markCurrentStatus('skipped',{reason:'用户跳过'}); await logSemiAutoAction('skipped').catch(()=>{}); advanceToNextPending(); await persistRecommendQueueState(); setSemiStatus('已跳过当前候选人'); }

async function scanCandidateList(){
  feedback('正在扫描当前页候选人...');
  const res=await sendToContent({type:'EXTRACT_CANDIDATE_LIST'});
  if(!res?.ok){ feedback(res?.error||'扫描失败','warn'); return; }
  state.scannedPageType=res.page_type||'-';
  state.scannedCandidates=await quickScoreScannedCandidates(res.candidates||[]);
  renderScannedCandidates();
  feedback(`扫描完成：${state.scannedCandidates.length} 位候选人`);
}

async function saveScannedCandidates(){
  const items=state.scannedCandidates||[];
  if(!items.length){ feedback('暂无扫描结果，请先扫描当前页候选人','warn'); return; }
  let saved=0, updated=0, failed=0;
  for(const candidate of items){
    try{
      const data=await api('/api/candidates/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidateScanPayload(candidate))});
      if(data.action==='updated') updated+=1;
      else saved+=1;
    }catch(e){
      failed+=1;
      console.warn('保存扫描候选人失败', candidate?.name, e);
    }
  }
  const summary=`保存完成：新增 ${saved}，更新 ${updated}，失败 ${failed}`;
  const el=$('scan-save-summary'); if(el) el.textContent=summary;
  feedback(summary, failed?'warn':'info');
}

function clearScannedCandidates(){
  state.scannedCandidates=[];
  state.scannedPageType='';
  const summary=$('scan-save-summary'); if(summary) summary.textContent='';
  const status=$('scan-job-status'); if(status) status.textContent='已清空';
  renderScannedCandidates();
  feedback('扫描结果已清空');
}

async function viewMatchHistory(){
  try{
    if(state.priorityResult) await saveMatchAsset({silent:true});
    const data=await api('/api/matches');
    const box=$('match-history-list');
    if(box){
      const items=(Array.isArray(data)?data:(data.items||[])).slice(0,5);
      box.innerHTML=items.length?items.map((item)=>`<div class="reply-box"><b>${item.candidate_name||'-'}</b> × <b>${item.job_title||'-'}</b><br>分数：${item.score??item.match_score??'-'} / ${item.level||item.match_level||'-'}<br>推荐：${item.recommendation||item.recommended_action||''}<br>匹配：${(item.matched||[]).join('；')||'-'}<br>缺失：${(item.missing||[]).join('；')||'-'}<br>风险：${(item.risks||[]).join('；')||'-'}</div>`).join(''):'暂无历史匹配';
    }
    feedback(state.priorityResult?'匹配记录已保存':'历史匹配已加载');
  }catch(e){ feedback(`保存失败：${e.message}`,'warn'); }
}

async function track(event_type,payload={}){
  await api('/api/events/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type,candidate_hash:state.candidate?.name||state.contextId,payload:{...payload,context_id:state.contextId}})});
  await refreshTodayStats();
}

async function analyzeCandidate(){
  feedback('正在刷新/分析候选人...');
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
  if(!hasJobDetail()) feedback('当前岗位只有名称，没有岗位职责/任职要求，分析可信度较低。建议先保存岗位要求库。');
  try{
    const data=await api('/api/priority/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,job_config:jobConfigForApi(),context_id:state.contextId})});
    data.reliability=normalizedReliability(data.reliability);
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
    if(state.candidate?.profile_complete===true){
      renderCandidate();
      if(state.job?.jd_complete!==true) $('candidate-priority').textContent='岗位JD不完整，请补充岗位职责/任职要求';
    }else if(state.candidate?.profile_complete===false){
      $('candidate-priority').textContent='信息不完整，建议打开在线简历后重新分析';
    }
    renderReliability();
    renderSourcingStatus();
    await track('priority_analyzed',{candidate_name:state.candidate.name,job_title:state.job?.title||'',score:data.score});
    feedback(`已分析候选人：${state.candidate.name} / 岗位 ${state.job?.title||'未识别岗位'}`);
  }catch(e){ feedback(`分析失败：${e.message}`); }
}

async function generateMessages(){
  feedback('正在生成话术...');
  if(!state.candidate?.name || !state.job?.title || !state.priorityResult){ feedback('缺少候选人或岗位信息，请先刷新上下文/分析候选人'); return; }
  try{
    const jobCfg=jobConfigForApi();
    const safeCandidate={name:state.candidate.name,skills:state.candidate.skills||[],project_keywords:state.candidate.project_keywords||[],current_title:state.candidate.current_title||state.candidate.title||'',expected_position:state.candidate.expected_position||'',structured_resume:state.candidate.structured_resume||null};
    const safeJob={title:jobCfg.title,job_title:jobCfg.job_title,description:jobCfg.description||'',responsibilities:jobCfg.responsibilities||[],requirements:jobCfg.requirements||[],preferred_keywords:jobCfg.preferred_keywords||[],jd_complete:jobCfg.jd_complete,source:jobCfg.source};
    const data=await api('/api/message/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:safeCandidate,job_config:safeJob,priority_result:state.priorityResult,context_id:state.contextId,chat_context_summary:{stage:state.chatResult?.stage||'',last_candidate_intent:state.chatResult?.last_candidate_intent||'',known_objections:state.chatResult?.known_objections||[]}})});
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
  try{
    state.settings=await api('/api/settings');
    state.greetingMode=state.settings.greeting_mode || state.settings.mode || 'manual';
  }catch(e){
    state.greetingMode='manual';
    feedback(e.message);
  }
  $('current-mode').textContent=state.greetingMode;
  const r=document.querySelector(`input[name='greet_mode'][value='${state.greetingMode}']`); if(r) r.checked=true;
  loadAutoSafety();
  await loadJobStandard();
  await restoreRecommendQueueState();
  renderSemiAutoWorkflow();
}
async function saveMode(){
  const mode=document.querySelector("input[name='greet_mode']:checked")?.value || 'manual';
  if(mode==='auto' && !confirm('Auto 是高风险模式：仅在显式启用、达到阈值、未超限、未重复、STOP 可用时自动发送。确认切换？')) return;
  state.settings=await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,greeting_mode:mode,min_score:60,auto_safety:state.autoSafety})});
  state.greetingMode=mode;
  $('current-mode').textContent=mode;
  renderSemiAutoWorkflow();
  feedback('模式已保存');
}
async function queueAction(path){ await api(path,{method:'POST'}); const st=await api('/api/queue/status'); $('queue-count').textContent=st.queue_count; feedback('队列状态已更新'); }
async function queueAdd(){ if(!state.priorityResult){ feedback('请先分析候选人'); return; } const r=await api('/api/queue/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate:state.candidate,context_id:state.contextId})}); $('queue-count').textContent=r.queue_count; feedback('已加入队列'); }

async function debugDom(){
  let res=await sendToContent({type:'DEBUG_DOM'});
  try{
    const diag=await diagnoseBossPage();
    if(diag?.ok && overallModuleTypeFromFrames(diag.frames||[])==='recommend_module'){
      const bestDebug=await sendToSourcingFrame({type:'DEBUG_DOM'});
      const selection=diag.frame_selection_debug || selectBestBossFrame(diag.frames||[]);
      res={...(bestDebug?.ok?bestDebug:res),top_frame_debug:res,frame_selection_debug:{overall_module_type:'recommend_module',best_frame_id:selection.best_frame_id,best_frame_url:selection.best_frame_url,best_frame_roles:selection.frame_roles,reason:selection.reason}};
    }
  }catch(e){ console.warn('recommend DEBUG_DOM frame merge failed', e); }
  $('debug-dom-output').textContent=JSON.stringify({...res,recommend_workflow_state_debug:recommendWorkflowStateDebug()},null,2).slice(0,5000);
  feedback(res?.ok?'DOM 调试信息已输出':(res?.error||'DOM 调试失败'));
}

function bind(){
  $('refresh-context-btn').onclick=refreshContext;
  $('debug-dom-btn').onclick=debugDom;
  $('refresh-job-btn').onclick=refreshJob;
  $('analyze-btn').onclick=analyzeCandidate;
  const ruleMatchBtn=$('rule-match-btn'); if(ruleMatchBtn) ruleMatchBtn.onclick=analyzeRuleMatch;
  $('generate-message-btn').onclick=generateMessages;
  $('save-job-config-btn').onclick=saveJobProfile;
  const saveCandidateAssetBtn=$('save-candidate-asset-btn'); if(saveCandidateAssetBtn) saveCandidateAssetBtn.onclick=()=>saveCandidateAsset();
  const saveJobAssetBtn=$('save-job-asset-btn'); if(saveJobAssetBtn) saveJobAssetBtn.onclick=()=>saveJobAsset();
  const viewMatchHistoryBtn=$('view-match-history-btn'); if(viewMatchHistoryBtn) viewMatchHistoryBtn.onclick=viewMatchHistory;
  const scanCandidatesBtn=$('scan-candidates-btn'); if(scanCandidatesBtn) scanCandidatesBtn.onclick=scanCandidateList;
  const analyzeFrameMapBtn=$('analyze-frame-map-btn'); if(analyzeFrameMapBtn) analyzeFrameMapBtn.onclick=analyzeBossFrameMap;
  const sourcingDiagnoseBtn=$('sourcing-diagnose-btn'); if(sourcingDiagnoseBtn) sourcingDiagnoseBtn.onclick=diagnoseBossWorkflow;
  const sourcingExtractJobBtn=$('sourcing-extract-job-btn'); if(sourcingExtractJobBtn) sourcingExtractJobBtn.onclick=extractRecommendJobWorkflow;
  const sourcingScanListBtn=$('sourcing-scan-list-btn'); if(sourcingScanListBtn) sourcingScanListBtn.onclick=scanRecommendListWorkflow;
  const sourcingExtractResumeBtn=$('sourcing-extract-resume-btn'); if(sourcingExtractResumeBtn) sourcingExtractResumeBtn.onclick=extractRecommendResumeWorkflow;
  const sourcingAnalyzeCandidateBtn=$('sourcing-analyze-candidate-btn'); if(sourcingAnalyzeCandidateBtn) sourcingAnalyzeCandidateBtn.onclick=analyzeRecommendResumeWorkflow;
  const sourcingGenerateMessageBtn=$('sourcing-generate-message-btn'); if(sourcingGenerateMessageBtn) sourcingGenerateMessageBtn.onclick=generateRecommendGreetingWorkflow;
  const sourcingSaveCandidateBtn=$('sourcing-save-candidate-btn'); if(sourcingSaveCandidateBtn) sourcingSaveCandidateBtn.onclick=saveRecommendCandidateWorkflow;
  const sourcingSaveMatchBtn=$('sourcing-save-match-btn'); if(sourcingSaveMatchBtn) sourcingSaveMatchBtn.onclick=saveSourcingMatchWorkflow;
  const saveScannedBtn=$('save-scanned-candidates-btn'); if(saveScannedBtn) saveScannedBtn.onclick=saveScannedCandidates;
  const clearScannedBtn=$('clear-scanned-candidates-btn'); if(clearScannedBtn) clearScannedBtn.onclick=clearScannedCandidates;
  const saveProfileBtn=$('save-job-profile-btn'); if(saveProfileBtn) saveProfileBtn.onclick=saveJobProfile;
  const loadProfileBtn=$('load-job-profile-btn'); if(loadProfileBtn) loadProfileBtn.onclick=loadCurrentJobProfile;
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
  const semiRestoreQueueBtn=$('semi-restore-queue-btn'); if(semiRestoreQueueBtn) semiRestoreQueueBtn.onclick=()=>restoreRecommendQueueState({force:true});
  const semiClearQueueBtn=$('semi-clear-queue-btn'); if(semiClearQueueBtn) semiClearQueueBtn.onclick=clearRecommendQueueState;
  const semiUseCurrentJobBtn=$('semi-use-current-job-btn'); if(semiUseCurrentJobBtn) semiUseCurrentJobBtn.onclick=clearQueueUseCurrentJob;
  const semiJumpOpenedBtn=$('semi-jump-opened-btn'); if(semiJumpOpenedBtn) semiJumpOpenedBtn.onclick=jumpToOpenedCandidate;
  const semiNextPendingBtn=$('semi-next-pending-btn'); if(semiNextPendingBtn) semiNextPendingBtn.onclick=jumpToNextPending;
  const semiSaveStandardBtn=$('semi-save-standard-btn'); if(semiSaveStandardBtn) semiSaveStandardBtn.onclick=saveJobStandard;
  const semiSaveSafetyBtn=$('semi-save-safety-btn'); if(semiSaveSafetyBtn) semiSaveSafetyBtn.onclick=saveAutoSafety;
  const semiAddQueueBtn=$('semi-add-queue-btn'); if(semiAddQueueBtn) semiAddQueueBtn.onclick=addRecommendQueue;
  const semiStartBtn=$('semi-start-btn'); if(semiStartBtn) semiStartBtn.onclick=startSemiAutoProcessing;
  const semiPauseBtn=$('semi-pause-btn'); if(semiPauseBtn) semiPauseBtn.onclick=pauseSemiAuto;
  const semiResumeBtn=$('semi-resume-btn'); if(semiResumeBtn) semiResumeBtn.onclick=resumeSemiAuto;
  const semiSkipBtn=$('semi-skip-btn'); if(semiSkipBtn) semiSkipBtn.onclick=skipSemiAutoCurrent;
  const semiAnalyzeBtn=$('semi-analyze-btn'); if(semiAnalyzeBtn) semiAnalyzeBtn.onclick=analyzeSemiAutoCurrent;
  const semiGenerateBtn=$('semi-generate-btn'); if(semiGenerateBtn) semiGenerateBtn.onclick=generateSemiAutoGreeting;
  const semiFillBtn=$('semi-fill-btn'); if(semiFillBtn) semiFillBtn.onclick=fillSemiAutoGreeting;
  const semiConfirmSendBtn=$('semi-confirm-send-btn'); if(semiConfirmSendBtn) semiConfirmSendBtn.onclick=()=>sendSemiAutoGreeting({auto:false});
  const semiStopBtn=$('semi-stop-btn'); if(semiStopBtn) semiStopBtn.onclick=stopSemiAuto;
  const matchesBox=$('job-profile-matches'); if(matchesBox) matchesBox.onclick=async(e)=>{ const b=e.target.closest('button[data-use-job-match]'); if(!b)return; const item=state.jobProfileMatches[Number(b.dataset.useJobMatch)]; if(!item?.profile)return; applyJobProfile(item.profile,'已使用相似岗位配置','profile_store_match'); await saveCurrentJobContext(state.job); feedback(`已使用相似岗位配置：${state.job.title}`); };
  $('message-list').onclick=async(e)=>{ const b=e.target.closest('button'); if(!b)return; const i=Number(b.dataset.copy||b.dataset.fill); const v=state.messageVariants[i]; if(!v)return; if(b.dataset.copy!==undefined){ await navigator.clipboard.writeText(v.message); feedback('已复制'); } if(b.dataset.fill!==undefined) await fillMessage(v.message,v.strategy); };
  $('followup-list').onclick=async(e)=>{ const b=e.target.closest('button'); if(!b)return; const i=Number(b.dataset.followCopy||b.dataset.followFill||b.dataset.followHandled); const item=state.followups[i]; if(!item)return; if(b.dataset.followCopy!==undefined){ await navigator.clipboard.writeText(item.suggested_message); feedback('已复制'); } if(b.dataset.followFill!==undefined) await fillMessage(item.suggested_message,'followup'); if(b.dataset.followHandled!==undefined){ await track('followup_handled',{candidate_name:item.candidate_name,job_title:item.job_title||''}); b.textContent='已处理'; b.disabled=true; feedback('跟进已处理'); }};
  $('fill-reply-1-btn').onclick=()=>fillMessage($('reply-1').textContent,'chat_reply_1');
  $('fill-reply-2-btn').onclick=()=>fillMessage($('reply-2').textContent,'chat_reply_2');
}

window.addEventListener('DOMContentLoaded',async()=>{bind();await restoreCurrentJobContext({force:true});renderJob();await checkService();await refreshContext();if(state.serviceOnline){await loadSettings();await refreshTodayStats();await refreshFollowups();}});
