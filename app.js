import { CreateMLCEngine } from 'https://esm.run/@mlc-ai/web-llm';

const GH = 'https://api.github.com';
const DEFAULT_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
const state = {
  token: sessionStorage.getItem('joel-ai-gh-token') || '',
  repo: localStorage.getItem('joel-ai-repo') || 'JoelEngelman/ai',
  branch: localStorage.getItem('joel-ai-branch') || 'main',
  tree: [], file: '', content: '', original: '', sha: '', engine: null,
  model: localStorage.getItem('joel-ai-model') || DEFAULT_MODEL,
  loadingModel: false, busy: false
};

const app = document.querySelector('#app');
const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const basename = p => p.split('/').pop();
const dirname = p => p.split('/').slice(0,-1).join('/');

app.innerHTML = `
<div class="shell">
  <header class="topbar">
    <div class="brand">Joel <span>AI</span></div>
    <div class="status"><i id="statusDot" class="dot"></i><span id="statusText">Local AI not loaded</span></div>
    <div class="top-actions">
      <button class="btn" id="tokenBtn">GitHub</button>
      <button class="btn" id="reloadBtn">↻ Refresh</button>
      <button class="btn primary" id="saveBtn">Save file</button>
    </div>
  </header>
  <aside class="side">
    <div class="panel-title">Repository</div>
    <div class="repo-row"><input class="input" id="repoInput" value="${esc(state.repo)}" placeholder="owner/repository"/><button class="btn" id="openRepo">Open</button></div>
    <div class="repo-row"><input class="input" id="branchInput" value="${esc(state.branch)}" placeholder="branch"/><button class="btn" id="openBranch">Go</button></div>
    <div class="panel-title">Explorer</div>
    <div id="tree" class="tree"><div class="empty">Open a repository to explore its files.</div></div>
    <div class="panel-title">Agent powers</div>
    <div class="notice">Runs the AI locally in your browser with WebGPU. No AI API bill. GitHub access uses a token you provide and keep in this browser session.</div>
  </aside>
  <main class="editor">
    <div class="tabs"><div class="tab active" id="fileTab">No file selected</div></div>
    <div class="editor-wrap"><textarea class="editor-text" id="editor" spellcheck="false" placeholder="Select a file from the repository explorer..."></textarea></div>
    <footer class="editor-footer"><span id="fileMeta">No file</span><span>•</span><span id="changeMeta">Clean</span><span style="margin-left:auto">Ctrl/Cmd + S to save</span></footer>
  </main>
  <section class="agent">
    <div class="agent-head"><strong>AI Coding Agent</strong><p>Ask it to understand, debug, design, refactor, or modify your repository.</p></div>
    <div id="messages" class="messages"><div class="msg assistant">Hey! I'm your local coding agent. Open a GitHub repo, then ask me what you want built. I can inspect the repository, reason about files, write code, and save changes back to GitHub.</div></div>
    <div class="composer">
      <textarea id="prompt" placeholder="e.g. Inspect this repo and make the login flow work properly..."></textarea>
      <div class="compose-row"><select class="drop" id="model"><option value="${DEFAULT_MODEL}">Llama 3.2 3B • fast/local</option></select><span class="model" id="modelHint">WebGPU • unlimited local inference</span><button class="btn primary" id="send">Run AI ↗</button></div>
    </div>
  </section>
</div>
<div id="modalRoot"></div>`;

const $ = id => document.getElementById(id);
const setStatus = (text, ready=false) => { $('statusText').textContent=text; $('statusDot').className='dot'+(ready?' ready':''); };
const addMsg = (text, role='assistant') => { const d=document.createElement('div'); d.className=`msg ${role}`; d.textContent=text; $('messages').appendChild(d); $('messages').scrollTop=$('messages').scrollHeight; return d; };

function headers(){ return state.token ? {Authorization:`Bearer ${state.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'} : {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}; }
async function gh(path, opts={}){
  const r=await fetch(GH+path,{...opts,headers:{...headers(),...(opts.headers||{})}});
  if(!r.ok){let msg='GitHub request failed';try{const j=await r.json();msg=j.message||msg}catch{}throw new Error(`${r.status}: ${msg}`)}
  return r.status===204?null:r.json();
}

function showTokenModal(){
  $('modalRoot').innerHTML=`<div class="modal"><div class="card"><h2>Connect GitHub</h2><p>Paste a GitHub fine-grained personal access token with access to the repositories you want this app to edit. It is stored only in this browser session and is never sent to the AI model.</p><input class="input" id="tokenField" type="password" placeholder="github_pat_..." value="${esc(state.token)}"><div class="notice">For safety, use the smallest permissions possible: repository contents read/write is enough for this app. Never put a token in source code.</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" id="cancelToken">Cancel</button><button class="btn primary" id="connectToken">Connect</button></div></div></div>`;
  $('cancelToken').onclick=()=>{$('modalRoot').innerHTML=''};
  $('connectToken').onclick=async()=>{const t=$('tokenField').value.trim();if(!t){return}state.token=t;sessionStorage.setItem('joel-ai-gh-token',t);$('modalRoot').innerHTML='';try{const u=await gh('/user');addMsg(`Connected to GitHub as ${u.login}.`);await loadTree()}catch(e){state.token='';sessionStorage.removeItem('joel-ai-gh-token');addMsg(`GitHub connection failed: ${e.message}`)}};
}

async function loadTree(){
  const repo=$('repoInput').value.trim(), branch=$('branchInput').value.trim()||'main';
  if(!/^[-\w.]+\/[\-\w.]+$/.test(repo)){addMsg('Use a repository like JoelEngelman/ai.','assistant');return}
  state.repo=repo;state.branch=branch;localStorage.setItem('joel-ai-repo',repo);localStorage.setItem('joel-ai-branch',branch);
  $('tree').innerHTML='<div class="empty">Loading repository tree…</div>';
  try{
    const data=await gh(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    state.tree=(data.tree||[]).filter(x=>x.type==='blob').sort((a,b)=>a.path.localeCompare(b.path));
    renderTree(); setStatus(state.engine?'AI ready':'Repository connected',!!state.engine);
  }catch(e){$('tree').innerHTML=`<div class="empty">Could not load repository.<br>${esc(e.message)}<br><br>Private repos require a GitHub token.</div>`;}
}
function renderTree(){
  const tree=$('tree');tree.innerHTML='';
  if(!state.tree.length){tree.innerHTML='<div class="empty">No files found.</div>';return}
  const shown=new Set();
  for(const item of state.tree){
    const parts=item.path.split('/'); let prefix='';
    parts.forEach((part,i)=>{
      prefix=prefix?prefix+'/'+part:part;
      const isFile=i===parts.length-1;
      if(!isFile && shown.has(prefix)) return;
      if(!isFile) shown.add(prefix);
      const row=document.createElement('div');row.className='tree-item '+(isFile?'':'folder');row.style.paddingLeft=(8+i*13)+'px';row.title=item.path;
      row.textContent=(isFile?'▱ ':'▾ ')+part;
      if(isFile){row.onclick=()=>openFile(item.path);if(item.path===state.file)row.classList.add('active')}
      tree.appendChild(row);
    });
  }
}
async function openFile(path){
  $('tree').querySelectorAll('.tree-item').forEach(x=>x.classList.remove('active'));
  try{
    const d=await gh(`/repos/${state.repo}/contents/${path}?ref=${encodeURIComponent(state.branch)}`);
    const bytes=Uint8Array.from(atob(d.content.replace(/\n/g,'')),c=>c.charCodeAt(0));
    state.file=path;state.sha=d.sha;state.content=new TextDecoder().decode(bytes);state.original=state.content;
    $('editor').value=state.content;$('fileTab').textContent=basename(path);$('fileMeta').textContent=path;$('changeMeta').textContent='Clean';renderTree();
  }catch(e){addMsg(`Couldn't read ${path}: ${e.message}`)}
}
async function saveFile(){
  if(!state.file){addMsg('Select a file first.');return}
  if(!state.token){showTokenModal();return}
  const content=$('editor').value;if(content===state.original){addMsg('No changes to save.');return}
  $('saveBtn').disabled=true;
  try{const d=await gh(`/repos/${state.repo}/contents/${state.file}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`Update ${state.file} with Joel AI`,content:btoa(unescape(encodeURIComponent(content))),sha:state.sha,branch:state.branch})});state.sha=d.content.sha;state.original=content;state.content=content;$('changeMeta').textContent='Saved';addMsg(`Saved ${state.file} to ${state.repo} on ${state.branch}.`)}catch(e){addMsg(`Save failed: ${e.message}`)}finally{$('saveBtn').disabled=false}
}
async function createFile(path,content){
  if(!state.token){showTokenModal();return false}
  try{await gh(`/repos/${state.repo}/contents/${path}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`Create ${path} with Joel AI`,content:btoa(unescape(encodeURIComponent(content))),branch:state.branch})});await loadTree();await openFile(path);return true}catch(e){addMsg(`Create failed: ${e.message}`);return false}
}

async function ensureEngine(){
  if(state.engine)return state.engine;
  if(state.loadingModel)return null;
  state.loadingModel=true;setStatus('Downloading local AI…');
  try{
    state.engine=await CreateMLCEngine(state.model,{initProgressCallback:p=>{const v=p?.progress?Math.round(p.progress*100):0;setStatus(`Loading AI ${v}%`)}});
    setStatus('AI ready — local',true);localStorage.setItem('joel-ai-model',state.model);return state.engine;
  }catch(e){setStatus('AI failed to load');addMsg(`Could not load the local model. Your browser needs WebGPU and enough memory. Error: ${e.message}`);throw e}finally{state.loadingModel=false}
}

function repoContext(){
  const files=state.tree.map(x=>x.path).slice(0,700).join('\n');
  const current=state.file?`\nCURRENT FILE: ${state.file}\n---\n${$('editor').value.slice(0,30000)}\n---`:'\nNo file is currently open.';
  return `REPOSITORY: ${state.repo}\nBRANCH: ${state.branch}\nFILES:\n${files}${current}`;
}
const system=`You are Joel AI, an expert autonomous software engineer. You are extremely careful, practical, and excellent at debugging. You work from repository context supplied by the user. Never invent files or APIs when the repository context gives evidence otherwise. Prefer simple, robust solutions. Think through edge cases, security, accessibility, performance, mobile behavior, and deployment. When asked to change code, provide a concise explanation followed by exact changes. If the user asks you to modify files, return a JSON object inside a fenced json block with this exact shape: {"summary":"...","files":[{"path":"path/to/file","content":"complete file contents"}]}. Only include files that actually need changing. Do not truncate code. Preserve existing behavior unless the requested change requires it. If you lack enough repository context, explicitly say which files you need inspected.`;

async function askAI(prompt){
  const engine=await ensureEngine();if(!engine)return;
  const context=repoContext();
  const user=`${context}\n\nUSER REQUEST:\n${prompt}`;
  const placeholder=addMsg('Thinking locally…','assistant');placeholder.classList.add('thinking');
  try{
    const r=await engine.chat.completions.create({messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.15,max_tokens:7000});
    placeholder.classList.remove('thinking');placeholder.textContent=r.choices?.[0]?.message?.content||'No response.';
  }catch(e){placeholder.classList.remove('thinking');placeholder.textContent=`AI error: ${e.message}`}
}

async function createFromAI(){
  const prompt=$('prompt').value.trim();if(!prompt)return;
  addMsg(prompt,'user');$('prompt').value='';
  await askAI(prompt);
}

$('tokenBtn').onclick=showTokenModal;$('reloadBtn').onclick=loadTree;$('openRepo').onclick=loadTree;$('openBranch').onclick=loadTree;$('saveBtn').onclick=saveFile;$('send').onclick=createFromAI;
$('editor').addEventListener('input',()=>{$('changeMeta').textContent=$('editor').value===state.original?'Clean':'Unsaved changes'});
$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();createFromAI()}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveFile()}});

setStatus(state.token?'GitHub connected • AI not loaded':'Local AI not loaded');
if(state.token) loadTree();

// A tiny command vocabulary makes the agent useful even before model loading.
window.joelAI={loadTree,openFile,saveFile,createFile,askAI};
