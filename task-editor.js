/* ═══════════════════════════════════════════════════════════════════════════════
   task-editor.js — ONE full task editor shared by the iPhone app (m/), the grid
   dashboard (grid.html / dashboard.html) and the Focus page (index.html / radial.html).

   Every meaningful Airtable field, saved the moment it changes, each change undoable:
   Task · Project · Lead · Sub · Category (Section / MeetingSlot / Calls) · Status ·
   Priority · Do date · Reminder · Next step · Notes · Call contact · Phone ·
   ⭐ Flag · Next Up · Don't text lead   + actions: Done · Snooze · Next Up.

   Choices come live from the Airtable schema (meta API, cached 24h) PLUS every value
   already used on tasks; typing a new value saves with typecast → Airtable adds it.

   Each page sets window.TE (adapter) before calling TaskEditor.open(task):
     key() base() table() all() today() esc(s)
     get(t,field) set(t,field,value) patch(id,fields) refresh() undo(msg,fn)
     cat(t) catRaw(t) setCat(t,value) restoreCat(t,raw) extraCats() catLabel(k)
     nextOrder() done(t) snooze(t,days)
   ═══════════════════════════════════════════════════════════════════════════════ */
(function(){
const SKEY='tb.schema.items';
let schema=(()=>{ try{ const x=JSON.parse(localStorage.getItem(SKEY)||'null'); return x&&Date.now()-x.at<864e5?x:null; }catch(e){ return null; } })();
async function loadSchema(){ const E=window.TE; if(schema||!E||!E.key()) return; try{
    const r=await fetch('https://api.airtable.com/v0/meta/bases/'+E.base()+'/tables',{headers:{Authorization:'Bearer '+E.key()}});
    if(!r.ok){ schema={at:Date.now(),choices:{},denied:r.status}; return; }
    const d=await r.json(); const tb=(d.tables||[]).find(x=>x.id===E.table()||x.name==='Items'); const ch={};
    ((tb&&tb.fields)||[]).forEach(f=>{ const c=f.options&&f.options.choices; if(c) ch[f.name]=c.map(x=>x.name); });
    schema={at:Date.now(),choices:ch}; localStorage.setItem(SKEY,JSON.stringify(schema)); }catch(e){ schema={at:Date.now(),choices:{}}; } }
function values(field,key){ const E=window.TE; const set=new Set(((schema&&schema.choices[field])||[]).filter(Boolean));
  E.all().forEach(t=>{ const v=t[key]; if(v) String(v).split(', ').forEach(x=>x&&set.add(x)); }); return [...set].sort((a,b)=>a.localeCompare(b)); }
const CATS=[['','None'],['morning','Morning call'],['afternoon','Afternoon call'],['calls','Calls'],['incoming','Incoming'],['focus','Focus'],['@Computer – Claude','@Computer – Claude'],['Open Items','Open Items'],['parked','Parked']];
function catOptions(){ const E=window.TE; const seen=new Set(CATS.map(c=>c[0].toLowerCase())); const out=CATS.slice();
  [...((schema&&schema.choices.Section)||[]),...(E.extraCats?E.extraCats():[]),...E.all().map(t=>t.sectionRemote)].forEach(v=>{ const k=String(v||'').trim();
    if(k&&!seen.has(k.toLowerCase())&&k!=='backlog'){ seen.add(k.toLowerCase()); out.push([k,(E.catLabel&&E.catLabel(k))||k]); } });
  return out; }
const localDT=iso=>{ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return ''; const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes()); };

const CSS=`
.te-scrim{position:fixed;inset:0;z-index:9000;background:rgba(2,8,11,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}
.te-scrim.on{opacity:1}
.te{position:fixed;z-index:9001;left:0;right:0;bottom:0;max-height:92vh;display:flex;flex-direction:column;background:#0b161b;color:#eaf6fb;
  border:1px solid rgba(57,199,223,.28);border-bottom:0;border-radius:20px 20px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.6),0 0 0 1px rgba(57,199,223,.06) inset;
  transform:translateY(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);font:15px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  padding-bottom:env(safe-area-inset-bottom,0px)}
.te.on{transform:none}
@media(min-width:760px){ .te{left:50%;right:auto;bottom:auto;top:50%;width:620px;max-height:88vh;border-radius:18px;border-bottom:1px solid rgba(57,199,223,.28);transform:translate(-50%,-46%) scale(.98);opacity:0;transition:transform .2s,opacity .2s}
  .te.on{transform:translate(-50%,-50%);opacity:1} }
.te-h{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid rgba(57,199,223,.14)}
.te-h b{flex:1;font:700 12px ui-monospace,Menlo,monospace;letter-spacing:2px;text-transform:uppercase;color:#39c7df}
.te-x{width:36px;height:36px;border-radius:10px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#8aa6af;font-size:16px;cursor:pointer}
.te-b{overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 16px 4px}
.te-r{display:block;margin:0 0 10px}
.te-l{display:block;font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:1.4px;text-transform:uppercase;color:#64838d;margin:0 2px 4px}
.te-i{width:100%;box-sizing:border-box;background:rgba(20,36,42,.85);border:1px solid rgba(57,199,223,.2);border-radius:10px;color:#eaf6fb;font:inherit;font-size:16px;padding:10px 11px;-webkit-user-select:text;user-select:text;outline:none}
.te-i:focus{border-color:#39c7df;box-shadow:0 0 0 3px rgba(57,199,223,.18)}
select.te-i{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,#39c7df 50%),linear-gradient(135deg,#39c7df 50%,transparent 50%);background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
textarea.te-i{resize:vertical;min-height:44px}
.te-name{font-size:18px;font-weight:700}
.te-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.te-3{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:8px}
@media(max-width:420px){ .te-3{grid-template-columns:minmax(0,1fr) minmax(0,1fr)} }
/* iPhone: never wider than the sheet — every cell / input can shrink; date & time inputs included (iOS gives them an intrinsic min width) */
.te,.te *{box-sizing:border-box}
.te{width:100%;max-width:100vw;overflow:hidden;touch-action:pan-y}
.te-b{width:100%;overflow-x:hidden!important;overflow-y:auto;touch-action:pan-y;overscroll-behavior:contain}
.te-r,.te-2>*,.te-3>*{min-width:0}
.te-i{min-width:0;max-width:100%;display:block}
input.te-i[type=date],input.te-i[type=datetime-local]{-webkit-appearance:none;appearance:none;min-width:0;width:100%;min-height:44px;text-align:left}
input.te-i::-webkit-date-and-time-value{text-align:left}
input.te-i{text-overflow:ellipsis}
@media(max-width:759px){ .te{max-height:calc(100vh - env(safe-area-inset-top,0px) - 8px)} .te-h{padding-top:max(14px,env(safe-area-inset-top,0px))} }
.te-tg{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px}
.te-t{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border-radius:19px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#bfe3ec;font-size:14px;font-weight:600;cursor:pointer;-webkit-user-select:none;user-select:none}
.te-t i{width:9px;height:9px;border-radius:50%;border:1.5px solid #39c7df}
.te-t.on{background:rgba(57,199,223,.16);border-color:#39c7df;color:#eaf6fb}.te-t.on i{background:#39c7df}
.te-a{display:flex;gap:8px;padding:10px 16px 14px;border-top:1px solid rgba(57,199,223,.14);flex-wrap:wrap}
.te-btn{flex:1;min-width:90px;height:46px;border-radius:12px;border:1px solid rgba(57,199,223,.28);background:rgba(20,36,42,.85);color:#eaf6fb;font-weight:700;font-size:14.5px;cursor:pointer}
.te-btn.pri{background:#39c7df;border-color:#39c7df;color:#04161c}
.te-btn.ok{border-color:rgba(48,209,88,.5);color:#62e08a}
.te-btn.sm{flex:1 1 30%;height:38px;font-size:13px;font-weight:600;color:#bfe3ec}.te-btn.on{background:rgba(57,199,223,.16);border-color:#39c7df}
.te-pick{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden}.te-pick input{position:absolute;inset:0;opacity:0}
.te-snz{display:none;gap:6px;width:100%}.te-snz.on{display:flex}.te-snz .te-btn{height:40px;min-width:0}
.te-note{color:#64838d;font-size:12px;margin:0 2px 10px}
`;
function ensureCss(){ if(document.getElementById('te-css')) return; const s=document.createElement('style'); s.id='te-css'; s.textContent=CSS; document.head.appendChild(s); }

function formHTML(t){ const E=window.TE; const e=s=>E.esc(s==null?'':String(s)); const g=k=>E.get(t,k);
  const dl=(id,vals)=>`<datalist id="${id}">${vals.map(v=>`<option value="${e(v)}">`).join('')}</datalist>`;
  const cat=E.cat(t); const stat=values('Status','status'); ['Open','Done','Disposed'].forEach(x=>{ if(!stat.includes(x)) stat.push(x); });
  const row=(l,inner)=>`<label class="te-r"><span class="te-l">${l}</span>${inner}</label>`;
  const tog=(f,l)=>`<button type="button" class="te-t${g(f)?' on':''}" data-tog="${f}"><i></i>${l}</button>`;
  return `${row('Task',`<textarea class="te-i te-name" data-f="Task" rows="2">${e(g('Task'))}</textarea>`)}
    <div class="te-3">${row('Project',`<input class="te-i" data-f="Project" list="te-p" value="${e(g('Project'))}" placeholder="pick or type new" autocomplete="off">`)}
      ${row('Lead',`<input class="te-i" data-f="SBLead" list="te-l" value="${e(g('SBLead'))}" placeholder="pick or type new" autocomplete="off">`)}
      ${row('Sub',`<input class="te-i" data-f="Sub" list="te-s" value="${e(g('Sub'))}" placeholder="pick or type new" autocomplete="off">`)}</div>
    ${dl('te-p',values('Project','project'))}${dl('te-l',values('SBLead','lead'))}${dl('te-s',values('Sub','sub'))}
    <div class="te-3">${row('Category',`<select class="te-i" data-cat>${catOptions().map(([v,l])=>`<option value="${e(v)}"${v.toLowerCase()===String(cat).toLowerCase()?' selected':''}>${e(l)}</option>`).join('')}<option value="__new">+ New category…</option></select>`)}
      ${row('Status',`<select class="te-i" data-f="Status">${stat.map(v=>`<option${v===(g('Status')||'Open')?' selected':''}>${e(v)}</option>`).join('')}</select>`)}
      ${row('Priority',`<input class="te-i" data-f="Priority" list="te-pr" value="${e(g('Priority'))}" autocomplete="off">`)}</div>${dl('te-pr',values('Priority','priorityRaw'))}
    <div class="te-2">${row('Do date',`<input class="te-i" type="date" data-f="DoDate" value="${e(g('DoDate'))}">`)}${row('Reminder',`<input class="te-i" type="datetime-local" data-f="ReminderAt" value="${e(localDT(g('ReminderAt')))}">`)}</div>
    ${row('Next step',`<input class="te-i" data-f="NextStep" value="${e(g('NextStep'))}">`)}
    ${row('Notes',`<textarea class="te-i" data-f="Notes" rows="4">${e(g('Notes'))}</textarea>`)}
    <div class="te-2">${row('Call contact',`<input class="te-i" data-f="CallContact" value="${e(g('CallContact')==='-'?'':g('CallContact'))}" autocomplete="off">`)}${row('Phone',`<input class="te-i" type="tel" data-f="Phone" value="${e(g('Phone'))}" autocomplete="off">`)}</div>
    <div class="te-tg">${tog('RoniFlag','Flag')}${tog('NextUp','Next Up')}${tog('TextExclude','Don’t text lead')}</div>
    ${schema&&schema.denied?`<div class="te-note">Showing values already in use. Give the Airtable token schema read access for every option.</div>`:''}`; }

function wire(root,t){ const E=window.TE;
  const conv=(f,el)=>{ let v=el.value.trim(); if(f==='ReminderAt') return v?new Date(v).toISOString():null; if(f==='DoDate') return v||null; return v; };
  root.querySelectorAll('[data-f]').forEach(el=>{ const f=el.dataset.f; let last=JSON.stringify(E.get(t,f)??'');
    const commit=()=>{ const v=conv(f,el); const cur=JSON.stringify(v??''); if(cur===last) return; const prev=E.get(t,f);
      if(f==='Task'&&!v){ el.value=prev; return; }
      last=cur; E.set(t,f,v); E.patch(t.id,{[f]:v===''?null:v}); E.refresh();
      E.undo(f+' saved',()=>{ E.set(t,f,prev); E.patch(t.id,{[f]:(prev===''||prev==null)?null:prev}); last=JSON.stringify(prev??''); el.value=f==='ReminderAt'?localDT(prev):(prev||''); E.refresh(); }); };
    el.addEventListener('change',commit); if(el.tagName!=='SELECT'&&el.type!=='date'&&el.type!=='datetime-local') el.addEventListener('blur',commit); });
  root.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{ const f=b.dataset.tog; const prev=E.get(t,f); const on=!prev;
    const v=f==='NextUp'?(on?E.today():null):on; const extra=(f==='NextUp'&&on)?{NextUpOrder:E.nextOrder()}:{};
    E.set(t,f,v); if(extra.NextUpOrder!=null) E.set(t,'NextUpOrder',extra.NextUpOrder); E.patch(t.id,Object.assign({[f]:v},extra)); b.classList.toggle('on',on); E.refresh();
    E.undo(f+' saved',()=>{ E.set(t,f,prev); E.patch(t.id,{[f]:prev||(f==='NextUp'?null:false)}); b.classList.toggle('on',!!prev); E.refresh(); }); });
  const cs=root.querySelector('[data-cat]'); let lastCat=E.cat(t);
  cs.addEventListener('change',()=>{ let v=cs.value; if(v==='__new'){ v=(prompt('New category name')||'').trim(); if(!v){ cs.value=lastCat; return; }
      const o=document.createElement('option'); o.value=v; o.textContent=v; o.selected=true; cs.insertBefore(o,cs.lastElementChild); }
    const prevRaw=E.catRaw(t); lastCat=v; E.setCat(t,v); E.refresh();
    E.undo('Category saved',()=>{ E.restoreCat(t,prevRaw); cs.value=E.cat(t); lastCat=cs.value; E.refresh(); }); });
}

let cur=null;
function close(){ if(!cur) return; const {sc,sh}=cur; const a=document.activeElement; if(a&&sh.contains(a)) a.blur(); sc.classList.remove('on'); sh.classList.remove('on'); setTimeout(()=>{ sc.remove(); sh.remove(); },280); cur=null; }
function open(t){ const E=window.TE; if(!E||!t) return; ensureCss(); if(cur) close();
  const sc=document.createElement('div'); sc.className='te-scrim'; const sh=document.createElement('div'); sh.className='te'; sh.setAttribute('role','dialog');
  const render=()=>{ sh.innerHTML=`<div class="te-h"><b>Edit task</b><button class="te-x" data-close aria-label="Close">✕</button></div><div class="te-b">${formHTML(t)}</div>
    <div class="te-a"><button class="te-btn ok" data-done>✓ Done</button><button class="te-btn" data-snz>Snooze…</button><button class="te-btn${E.get(t,'NextUp')?' on':''}" data-nu>⏫ Next up</button>
      <div class="te-snz"><button class="te-btn" data-d="1">Tomorrow</button><button class="te-btn" data-d="3">3 days</button><button class="te-btn" data-d="10">10 days</button><button class="te-btn" data-d="30">Month</button><label class="te-btn te-pick">Pick date<input type="date" data-pick></label></div>
      <button class="te-btn sm" data-mv="morning">→ AM</button><button class="te-btn sm" data-mv="afternoon">→ PM</button><button class="te-btn sm" data-mv="">Remove from category</button><button class="te-btn pri" data-close>Close</button></div>`;
    wire(sh,t);
    sh.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    sh.querySelector('[data-done]').onclick=()=>{ close(); E.done(t); };
    sh.querySelector('[data-snz]').onclick=()=>sh.querySelector('.te-snz').classList.toggle('on');
    sh.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ close(); E.snooze(t,+b.dataset.d); });
    sh.querySelector('[data-pick]').onchange=ev=>{ const v=ev.target.value; if(!v) return; const days=Math.max(1,Math.round((new Date(v+'T12:00:00')-new Date())/864e5)); close(); E.snooze(t,days,v); };
    sh.querySelector('[data-nu]').onclick=()=>{ const tg=sh.querySelector('[data-tog="NextUp"]'); if(tg) tg.click(); sh.querySelector('[data-nu]').classList.toggle('on',!!E.get(t,'NextUp')); };
    sh.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{ const v=b.dataset.mv; const cs=sh.querySelector('[data-cat]'); cs.value=v; cs.dispatchEvent(new Event('change')); }); };
  render(); sc.onclick=close; document.body.append(sc,sh); cur={sc,sh,t};
  const show=()=>{ sc.classList.add('on'); sh.classList.add('on'); }; requestAnimationFrame(()=>requestAnimationFrame(show)); setTimeout(show,60);
  if(!schema) loadSchema().then(()=>{ if(cur&&cur.t===t&&!sh.contains(document.activeElement)) render(); });
  document.addEventListener('keydown',function k(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',k); } }); }

/* ── Plain labels: strip decorative emoji from category / section / pane headers → small theme-colored dot.
   Functional icons (call, text, join) live in buttons and are not touched. ── */
const EMO=/^\s*(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[☀-➿⬀-⯿←-⇿■-◿])(?:️|︎|‍(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}))*\s*/u;
const DOTS=['#39c7df','#6fd0e0','#45b8d0','#8fd3ee','#5b8fb0','#7fc8b4','#b9a8f0','#e0a458','#9fdbe7'];
const dotColor=s=>{ let h=0; for(const c of String(s).toLowerCase()) h=(h*31+c.charCodeAt(0))>>>0; return DOTS[h%DOTS.length]; };
function plainOne(el,iconOnly){ if(el.dataset.plain) return; el.dataset.plain='1';
  if(iconOnly){ if(EMO.test(el.textContent)&&!el.textContent.replace(EMO,'').trim()){ el.textContent=''; el.classList.add('te-ic'); } return; }
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())){ if(n.nodeValue.trim()) break; } if(!n) return;
  if(n.parentElement&&n.parentElement.closest('a,button[data-join]')&&n.parentElement.closest('a,button[data-join]')!==el&&el.contains(n.parentElement.closest('a,button[data-join]'))) return;
  if(!EMO.test(n.nodeValue)) return; const rest=n.nodeValue.replace(EMO,''); n.nodeValue=rest;
  const d=document.createElement('i'); d.className='te-dot'; d.style.background=dotColor(el.textContent.trim()); n.parentNode.insertBefore(d,n); }
function plain(selector,iconSel){ if(!document.body){ document.addEventListener('DOMContentLoaded',()=>plain(selector,iconSel)); return; } const css=document.createElement('style'); css.textContent='.te-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 7px 1px 0;vertical-align:middle;flex:none;box-shadow:0 0 6px currentColor}.te-ic{position:relative}.te-ic::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#39c7df;box-shadow:0 0 10px rgba(57,199,223,.6)}'; document.head.appendChild(css);
  const run=root=>{ if(!root.querySelectorAll) return; if(root.matches&&root.matches(selector)) plainOne(root); root.querySelectorAll(selector).forEach(e=>plainOne(e)); if(iconSel){ if(root.matches&&root.matches(iconSel)) plainOne(root,true); root.querySelectorAll(iconSel).forEach(e=>plainOne(e,true)); } };
  run(document.body); new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&run(n)))).observe(document.body,{childList:true,subtree:true}); }
window.TaskEditor={open,close,loadSchema,plain,dotColor};
})();
