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
.te-cl{margin:6px 0 12px;padding:10px;border:1px solid rgba(57,199,223,.22);border-radius:12px;background:rgba(57,199,223,.04)}
.cqb{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.cqb .te-btn{height:40px;min-width:0}
.cq{border-top:1px solid rgba(57,199,223,.14);margin-top:10px;padding-top:8px}.cqh{display:flex;align-items:center;gap:8px}
.cqs{font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:.8px;text-transform:uppercase;border:1px solid;border-radius:999px;padding:2px 8px}
.cqt{color:#64838d;font-size:11.5px}.cqi{color:#bfe3ec;font-size:14px;margin-top:5px;white-space:pre-wrap;overflow-wrap:anywhere}
.cqr{color:#eaf6fb;font-size:14px;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(20,36,42,.85);border-radius:9px;padding:8px 10px}
.cqd{margin-top:8px}.cql{color:#e0a458;font-size:12.5px;font-weight:700;margin-bottom:5px;overflow-wrap:anywhere}
.te-hide{display:none!important}
.te-seg{display:flex;flex-wrap:wrap;gap:6px}
.te-ch{height:36px;padding:0 12px;border-radius:18px;border:1px solid rgba(57,199,223,.25);background:rgba(20,36,42,.7);color:#cfeaf1;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center}
.te-ch.on{background:#39c7df;border-color:#39c7df;color:#04161c}.te-ch.sug{border-color:#e0a458;color:#f0c27b}.te-ch.new{border-style:dashed;color:#62e08a}
.te-dpick{position:relative;overflow:hidden}.te-dpick input{position:absolute;inset:0;opacity:0;width:100%;height:100%}
.te-pk{margin-top:6px;padding:8px;border:1px solid rgba(57,199,223,.25);border-radius:12px;background:#0d1a20;max-height:240px;overflow:auto}
.te-pkh{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.3px;text-transform:uppercase;color:#64838d;margin:6px 2px 5px}.te-pkh:first-child{margin-top:0}
.te-gl{background:none;border:0;color:#e0a458;font:700 10px ui-monospace,Menlo,monospace;letter-spacing:.8px;text-transform:lowercase;margin-left:6px;cursor:pointer;padding:4px 2px}
.te-gs{display:flex;align-items:center;gap:6px;margin-top:5px}.te-gs:empty{display:none}
.te-gv{flex:1;min-width:0;color:#f0c27b;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.te-gn{color:#64838d;font-size:12px}
.te-gok,.te-gx{flex:none;width:40px;height:34px;border-radius:9px;border:1px solid rgba(224,164,88,.5);background:transparent;color:#62e08a;font-weight:800;cursor:pointer}.te-gx{color:#e5533a;border-color:rgba(229,83,58,.4)}
.te-guessbar{display:flex;gap:8px;margin:0 0 12px}.te-gbtn{color:#f0c27b!important;border-color:rgba(224,164,88,.5)!important}
.te-note{color:#64838d;font-size:12px;margin:0 2px 10px}
`;
function ensureCss(){ if(document.getElementById('te-css')) return; const s=document.createElement('style'); s.id='te-css'; s.textContent=CSS; document.head.appendChild(s); }

function formHTML(t){ const E=window.TE; const e=s=>E.esc(s==null?'':String(s)); const g=k=>E.get(t,k);
  const dl=(id,vals)=>`<datalist id="${id}">${vals.map(v=>`<option value="${e(v)}">`).join('')}</datalist>`;
  const cat=E.cat(t); const stat=values('Status','status'); ['Open','Done','Disposed'].forEach(x=>{ if(!stat.includes(x)) stat.push(x); });
  const row=(l,inner)=>`<label class="te-r"><span class="te-l">${l}</span>${inner}</label>`;
  const tog=(f,l)=>`<button type="button" class="te-t${g(f)?' on':''}" data-tog="${f}"><i></i>${l}</button>`;
  const pri=[...new Set(values('Priority','priorityRaw').map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>(+a)-(+b)).slice(0,6);
  const gl=f=>`<button type="button" class="te-gl" data-guess1="${f}">guess</button>`;
  const pick=(label,f,key,ph)=>row(`${label} ${gl(f)}`,`<input class="te-i" data-f="${f}" data-pick="${f}" value="${e(g(f))}" placeholder="${ph||'tap to pick'}" autocomplete="off"><div class="te-gs" data-gsf="${f}"></div>`);
  const days=[['Today',0],['Tomorrow',1],['Mon','mon'],['+3d',3],['+1w',7],['+1m',30]];
  return `${row('Task',`<textarea class="te-i te-name" data-f="Task" rows="2">${e(g('Task'))}</textarea>`)}
    <div class="te-cl" data-cl></div>
    <div class="te-ph" data-ph></div>
    <div class="te-guessbar"><button type="button" class="te-btn sm te-gbtn" data-guess>✨ Guess fields</button><button type="button" class="te-btn sm" data-acceptall hidden>Accept all</button></div>
    <div class="te-3">${pick('Project','Project','project')}${pick('Lead','SBLead','lead')}${pick('Sub','Sub','sub')}</div>
    ${row(`Category ${gl('Category')}`,`<select class="te-i te-hide" data-cat>${catOptions().map(([v,l])=>`<option value="${e(v)}"${v.toLowerCase()===String(cat).toLowerCase()?' selected':''}>${e(l)}</option>`).join('')}<option value="__new">+ New category…</option></select>
      <div class="te-seg" data-catchips>${catOptions().map(([v,l])=>`<button type="button" class="te-ch${v.toLowerCase()===String(cat).toLowerCase()?' on':''}" data-catv="${e(v)}">${e(l)}</button>`).join('')}<button type="button" class="te-ch new" data-catv="__new">＋ New</button></div><div class="te-gs" data-gsf="Category"></div>`)}
    <div class="te-2">${row('Status',`<select class="te-i te-hide" data-f="Status">${stat.map(v=>`<option${v===(g('Status')||'Open')?' selected':''}>${e(v)}</option>`).join('')}</select><div class="te-seg" data-segfor="Status">${['Open','Done','Disposed'].map(v=>`<button type="button" class="te-ch${v===(g('Status')||'Open')?' on':''}" data-segv="${v}">${v}</button>`).join('')}</div>`)}
      ${row('Priority',`<input class="te-i te-hide" data-f="Priority" value="${e(g('Priority'))}"><div class="te-seg" data-segfor="Priority"><button type="button" class="te-ch${!g('Priority')?' on':''}" data-segv="">—</button>${pri.map(v=>`<button type="button" class="te-ch${String(g('Priority'))===v?' on':''}" data-segv="${e(v)}">${e(v)}</button>`).join('')}</div>`)}</div>
    ${row('Do date',`<div class="te-seg" data-dchips>${days.map(([l,d])=>`<button type="button" class="te-ch" data-dd="${d}">${l}</button>`).join('')}<label class="te-ch te-dpick">${g('DoDate')?e(g('DoDate')):'Pick'}<input type="date" data-f="DoDate" value="${e(g('DoDate'))}"></label>${g('DoDate')?'<button type="button" class="te-ch" data-dd="clear">✕</button>':''}</div>`)}
    ${row('Reminder',`<input class="te-i" type="datetime-local" data-f="ReminderAt" value="${e(localDT(g('ReminderAt')))}">`)}
    ${row(`Next step ${gl('NextStep')}`,`<input class="te-i" data-f="NextStep" value="${e(g('NextStep'))}"><div class="te-gs" data-gsf="NextStep"></div>`)}
    ${row('Notes',`<textarea class="te-i" data-f="Notes" rows="4">${e(g('Notes'))}</textarea>`)}
    <div class="te-2">${row(`Call contact ${gl('CallContact')}`,`<input class="te-i" data-f="CallContact" value="${e(g('CallContact')==='-'?'':g('CallContact'))}" autocomplete="off"><div class="te-gs" data-gsf="CallContact"></div>`)}${row('Phone',`<input class="te-i" type="tel" data-f="Phone" value="${e(g('Phone'))}" autocomplete="off">`)}</div>
    <div class="te-tg">${tog('RoniFlag','Flag')}${tog('NextUp','Next Up')}${tog('TextExclude','Don’t text lead')}</div>
    ${schema&&schema.denied?`<div class="te-note">Showing values already in use. Give the Airtable token schema read access for every option.</div>`:''}`; }

/* ── Pickers: tap a field → chips right away (Suggested · Recent · All A–Z), type to filter, ＋ New ── */
const KEYOF={Project:'project',SBLead:'lead',Sub:'sub'};
let leadsCache=(()=>{ try{ const x=JSON.parse(localStorage.getItem('te.leads')||'null'); return x&&Date.now()-x.at<864e5?x.v:null; }catch(e){ return null; } })();
async function loadLeads(){ const E=window.TE; if(leadsCache||!E.key()) return; try{ const d=await fetch('https://api.airtable.com/v0/'+E.base()+'/tblH8xQDy6UrNAmWC?pageSize=100',{headers:{Authorization:'Bearer '+E.key()}}).then(r=>r.json());
  leadsCache=[...new Set((d.records||[]).flatMap(r=>[r.fields.SBLead,r.fields.Name&&String(r.fields.Name).split(' ')[0]]).filter(Boolean).map(String))]; localStorage.setItem('te.leads',JSON.stringify({at:Date.now(),v:leadsCache})); }catch(e){ leadsCache=[]; } }
function allValues(f){ const base=values(f,KEYOF[f]); if(f==='SBLead'&&leadsCache) leadsCache.forEach(v=>{ if(!base.includes(v)) base.push(v); }); return base.sort((a,b)=>a.localeCompare(b)); }
function recentValues(f){ const E=window.TE, now=Date.now(), m=new Map(); E.all().forEach(x=>{ const v=x[KEYOF[f]]; if(!v) return; const w=now-new Date(x.createdTime||0).getTime()<30*864e5?3:1; String(v).split(', ').forEach(y=>{ if(y) m.set(y,(m.get(y)||0)+w); }); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]); }
function showPicker(input,t,guesses){ const f=input.dataset.pick, E=window.TE; let pan=input.parentElement.querySelector('.te-pk'); if(!pan){ pan=document.createElement('div'); pan.className='te-pk'; input.after(pan); }
  const q=input.value.trim().toLowerCase(); const g=(guesses&&guesses[f])?[guesses[f]]:[]; const rec=recentValues(f), all=allValues(f);
  const m=v=>!q||v.toLowerCase().includes(q); const chip=(v,cls)=>`<button type="button" class="te-ch${cls?' '+cls:''}" data-pv="${E.esc(v)}">${E.esc(v)}</button>`;
  const sec=(lab,L,cls)=>{ const x=L.filter(m); return x.length?`<div class="te-pkh">${lab}</div><div class="te-seg">${x.map(v=>chip(v,cls)).join('')}</div>`:''; };
  pan.innerHTML=sec('Suggested',g,'sug')+(q?'':sec('Recent',rec.filter(v=>!g.includes(v))))+sec(q?'Matches':'All A–Z',all.filter(v=>q||!rec.includes(v)))+(q&&!all.some(v=>v.toLowerCase()===q)?`<div class="te-seg">${chip(input.value.trim(),'new')}</div>`:'');
  pan.querySelectorAll('[data-pv]').forEach(b=>b.addEventListener('pointerdown',e=>{ e.preventDefault(); input.value=b.dataset.pv; input.dispatchEvent(new Event('change')); pan.remove(); input.blur(); })); }

/* ── ✨ Guess: from the title + notes, similar past tasks (shared words, same contact), sub→project and contact→lead patterns ── */
const STOP=new Set('the and for with from that this call about re to of in on at a an be is are was it its we our you your they their them need needs follow up fu check get send text email ask tell new not no yes done open please'.split(' '));
const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9א-ת ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
function guessFor(t){ const E=window.TE, all=E.all().filter(x=>x.id!==t.id); const W=new Set([...words(E.get(t,'Task')),...words(E.get(t,'Notes'))]); const out={};
  const df=new Map(); all.forEach(x=>new Set(words(x.name||x.Task||'')).forEach(w=>df.set(w,(df.get(w)||0)+1)));
  const sim=all.map(x=>{ const xw=new Set(words(x.name||'')); let sc=0; W.forEach(w=>{ if(xw.has(w)) sc+=1/Math.log(2+(df.get(w)||1)); }); return {x,sc}; }).filter(o=>o.sc>0).sort((a,b)=>b.sc-a.sc).slice(0,12);
  const vote=(key,list)=>{ const m=new Map(); list.forEach(({x,sc})=>{ const v=x[key]; if(v) m.set(v,(m.get(v)||0)+sc); }); const b=[...m.entries()].sort((a,b)=>b[1]-a[1])[0]; return b&&b[0]; };
  const title=' '+String(E.get(t,'Task')||'').toLowerCase()+' ';
  const named=(f)=>allValues(f).filter(v=>v.length>=3&&title.includes(' '+v.toLowerCase()+' ')||title.includes(v.toLowerCase()+' ')&&v.length>=4)[0];   // value spelled out in the title
  if(!E.get(t,'Project')) out.Project=named('Project')||vote('project',sim);
  if(!E.get(t,'Sub')) out.Sub=named('Sub')||vote('sub',sim);
  const cg=E.contactGuess?E.contactGuess(t):null; if(!E.get(t,'CallContact')&&cg&&cg.who) out.CallContact=cg.who;
  const who=out.CallContact||E.get(t,'CallContact');
  if(!E.get(t,'SBLead')){ const byContact=who?vote('lead',all.filter(x=>x.callWho===who).map(x=>({x,sc:1}))):null; out.SBLead=named('SBLead')||byContact||vote('lead',sim); }
  if(out.Sub&&!out.Project&&!E.get(t,'Project')) out.Project=vote('project',all.filter(x=>x.sub===out.Sub).map(x=>({x,sc:1})));   // sub → project
  if(!E.cat(t)){ if(/^\s*(call|phone|ring)\b/i.test(E.get(t,'Task')||'')) out.Category='calls'; else { const c=vote('sectionRemote',sim); if(c&&c!=='backlog') out.Category=c; } }
  if(!E.get(t,'NextStep')){ const tt=String(E.get(t,'Task')||'').trim(); out.NextStep=/^\s*call\b/i.test(tt)?tt:(who?('Call '+who+' about '+tt):('Follow up: '+tt)); }
  Object.keys(out).forEach(k=>{ if(!out[k]) delete out[k]; }); return out; }
function showGuesses(root,t,G,only){ const E=window.TE; const acc=root.querySelector('[data-acceptall]'); let n=0;
  Object.entries(G).forEach(([f,v])=>{ if(only&&f!==only) return; const box=root.querySelector(`[data-gsf="${f}"]`); if(!box) return; n++;
    const lab=f==='Category'?((catOptions().find(c=>c[0]===v)||[v,v])[1]):v;
    box.innerHTML=`<span class="te-gv">≈ ${E.esc(lab)}</span><button type="button" class="te-gok" data-gok="${f}">✓</button><button type="button" class="te-gx" data-gx="${f}">✕</button>`; });
  if(acc) acc.hidden=!root.querySelector('.te-gv');
  root.querySelectorAll('[data-gok]').forEach(b=>b.onclick=()=>applyGuess(root,b.dataset.gok,G[b.dataset.gok]));
  root.querySelectorAll('[data-gx]').forEach(b=>b.onclick=()=>{ b.parentElement.innerHTML=''; if(acc) acc.hidden=!root.querySelector('.te-gv'); });
  if(!n&&!only) window.TE.undo('Nothing to guess — fields are filled',()=>{}); }
function applyGuess(root,f,v){ const box=root.querySelector(`[data-gsf="${f}"]`); if(box) box.innerHTML='';
  if(f==='Category'){ const cs=root.querySelector('[data-cat]'); cs.value=v; cs.dispatchEvent(new Event('change')); root.querySelectorAll('[data-catv]').forEach(x=>x.classList.toggle('on',x.dataset.catv===v)); }
  else { const el=root.querySelector(`[data-f="${f}"]`); if(el){ el.value=v; el.dispatchEvent(new Event('change')); } }
  const acc=root.querySelector('[data-acceptall]'); if(acc) acc.hidden=!root.querySelector('.te-gv'); }
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
  let G={};
  root.querySelectorAll('[data-pick]').forEach(inp=>{ inp.addEventListener('focus',()=>showPicker(inp,t,G)); inp.addEventListener('input',()=>showPicker(inp,t,G));
    inp.addEventListener('blur',()=>setTimeout(()=>{ const p=inp.parentElement.querySelector('.te-pk'); if(p&&!p.contains(document.activeElement)) p.remove(); },150)); });
  if(!leadsCache) loadLeads();
  root.querySelectorAll('[data-segfor]').forEach(seg=>{ const f=seg.dataset.segfor, el=root.querySelector(`[data-f="${f}"]`); seg.querySelectorAll('[data-segv]').forEach(b=>b.onclick=()=>{ el.value=b.dataset.segv; el.dispatchEvent(new Event('change')); seg.querySelectorAll('[data-segv]').forEach(x=>x.classList.toggle('on',x===b)); }); });
  root.querySelectorAll('[data-catv]').forEach(b=>b.onclick=()=>{ const cs=root.querySelector('[data-cat]'); cs.value=b.dataset.catv; cs.dispatchEvent(new Event('change')); if(b.dataset.catv!=='__new') root.querySelectorAll('[data-catv]').forEach(x=>x.classList.toggle('on',x===b)); });
  { const di=root.querySelector('input[data-f="DoDate"]'); const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    root.querySelectorAll('[data-dd]').forEach(b=>b.onclick=()=>{ const k=b.dataset.dd; let v=''; if(k!=='clear'){ const d=new Date(); if(k==='mon'){ d.setDate(d.getDate()+((8-d.getDay())%7||7)); } else d.setDate(d.getDate()+(+k)); v=iso(d); }
      di.value=v; di.dispatchEvent(new Event('change')); const lab=root.querySelector('.te-dpick'); if(lab&&lab.firstChild) lab.firstChild.nodeValue=v||'Pick'; }); }
  root.querySelector('[data-guess]').onclick=()=>{ G=guessFor(t); root.querySelectorAll('.te-gs').forEach(x=>x.innerHTML=''); showGuesses(root,t,G); };
  root.querySelectorAll('[data-guess1]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const f=b.dataset.guess1; const all=guessFor(t); G[f]=all[f]; if(!all[f]){ const box=root.querySelector(`[data-gsf="${f}"]`); if(box) box.innerHTML='<span class="te-gn">no guess</span>'; return; } showGuesses(root,t,{[f]:all[f]},f); });
  root.querySelector('[data-acceptall]').onclick=()=>{ Object.entries(G).forEach(([f,v])=>{ if(root.querySelector(`[data-gsf="${f}"] .te-gv`)) applyGuess(root,f,v); }); };
  const cs=root.querySelector('[data-cat]'); let lastCat=E.cat(t);
  cs.addEventListener('change',()=>{ let v=cs.value; if(v==='__new'){ v=(prompt('New category name')||'').trim(); if(!v){ cs.value=lastCat; return; }
      const o=document.createElement('option'); o.value=v; o.textContent=v; o.selected=true; cs.insertBefore(o,cs.lastElementChild); }
    const prevRaw=E.catRaw(t); lastCat=v; E.setCat(t,v); E.refresh();
    E.undo('Category saved',()=>{ E.restoreCat(t,prevRaw); cs.value=E.cat(t); lastCat=cs.value; E.refresh(); }); });
}

/* ── ✨ Send to Claude: per-task instructions → Airtable ClaudeQueue; the "Claude task queue" scheduled task works them.
   Anything that messages / emails / spends comes back as a DRAFT with status "Needs approval" → Approve & send / Edit / Cancel here. ── */
const CQ='tbliwVVKs3wdNRehV';
const cqApi=(path,opt)=>{ const E=window.TE; return fetch('https://api.airtable.com/v0/'+E.base()+'/'+CQ+(path||''),Object.assign({headers:{Authorization:'Bearer '+E.key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():Promise.reject(r.status)); };
const CQC={Queued:'#8aa6af',Working:'#39c7df','Needs approval':'#e0a458',Approved:'#6fd0e0',Done:'#62e08a',Failed:'#e5533a',Cancelled:'#64838d'};
async function cqLoad(t){ const u='?pageSize=6&filterByFormula='+encodeURIComponent("{ItemId}='"+t.id+"'")+'&sort%5B0%5D%5Bfield%5D=QueuedAt&sort%5B0%5D%5Bdirection%5D=desc'; const d=await cqApi(u); return (d.records||[]).map(r=>Object.assign({id:r.id},r.fields)); }
function cqRowHTML(q){ if(window.CQ){ CQ.css(); return CQ.rowHTML(q,{task:false,onOpen:false}); } const e=s=>window.TE.esc(s==null?'':String(s)); const st=q.Status||'Queued';
  return `<div class="cq" data-q="${q.id}"><div class="cqh"><span class="cqs" style="color:${CQC[st]||'#8aa6af'};border-color:${CQC[st]||'#8aa6af'}">${e(st)}</span><span class="cqt">${q.QueuedAt?new Date(q.QueuedAt).toLocaleString([], {month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}):''}</span></div>
    <div class="cqi">${e(q.Instruction)}</div>${q.Result?`<div class="cqr">${e(q.Result)}</div>`:''}${q.Error?`<div class="cqr" style="color:#e5533a">${e(q.Error)}</div>`:''}
    ${st==='Needs approval'?`<div class="cqd"><div class="cql">${e(q.DraftChannel||'Message')} → ${e(q.DraftTo||'')}${q.DraftSubject?' · '+e(q.DraftSubject):''}</div><textarea class="te-i" rows="4" data-draft>${e(q.Draft)}</textarea>
      <div class="cqb"><button class="te-btn ok" data-ok>Approve &amp; send</button><button class="te-btn" data-save>Save edit</button><button class="te-btn" data-x>Cancel</button></div></div>`:''}
    ${st==='Queued'?`<div class="cqb"><button class="te-btn sm" data-x>Cancel</button></div>`:''}</div>`; }
// 📷 Photos on the task: Photo Library / camera / paste; drop or ⌘V on desktop. Thumbnails → full-screen viewer.
function wirePhotos(root,t){ const box=root.querySelector('[data-ph]'); if(!box||!window.Photos) return; Photos.css();
  const draw=()=>{ const L=t.photos||[]; box.innerHTML=`<span class="te-l">Photos${L.length?' · '+L.length:''}</span>${Photos.thumbsHTML(L)}<div class="ph-btns"><button type="button" class="te-btn sm" data-phadd>📷 Add photo</button><button type="button" class="te-btn sm" data-phpaste>📋 Paste</button></div>`;
    Photos.wireThumbs(box,L); box.querySelector('[data-phadd]').onclick=async()=>{ const f=await Photos.pick(); add(f); }; box.querySelector('[data-phpaste]').onclick=async()=>{ const f=await Photos.fromClipboard(); add(f); }; };
  const add=f=>{ if(!f||!f.length) return; if(!/^rec/.test(t.id)){ alert('Saving the task first — try again in a second'); return; } const n=box.querySelector('.te-l'); if(n) n.textContent='Photos · uploading '+f.length+'…'; Photos.add(t,f,()=>{ draw(); try{ window.TE.refresh&&window.TE.refresh(); }catch(e){} }); };
  root.addEventListener('paste',e=>{ const f=Photos.imagesFrom(e); if(f.length){ e.preventDefault(); add(f); } }); Photos.dropZone(root,f=>add(f)); draw(); }
function wireClaude(root,t){ const box=root.querySelector('[data-cl]'); if(!box) return; const E=window.TE;
  box.innerHTML=`<span class="te-l">Instructions for Claude</span><textarea class="te-i" rows="3" data-ci placeholder="e.g. Find Joe's email in Gmail and draft a follow-up asking for the revised quote"></textarea>
    <div class="cqb"><button class="te-btn pri" data-csend>Send to Claude ✨</button></div><div data-clist></div>`;
  const list=box.querySelector('[data-clist]');
  const draw=async()=>{ if(!E.key()){ list.innerHTML='<div class="te-note">Connect Airtable (⚙︎) to use Send to Claude.</div>'; return; } try{ const L=await cqLoad(t); if(!document.body.contains(list)) return; list.innerHTML=L.map(cqRowHTML).join('');
      { const hd=root.querySelector('.te-h'); if(hd&&window.CQ){ let c=hd.querySelector('.te-cqchip'); if(!c){ c=document.createElement('span'); c.className='te-cqchip'; c.style.cssText='margin-left:8px;cursor:pointer'; hd.querySelector('b').after(c); c.onclick=()=>box.scrollIntoView({behavior:'smooth',block:'start'}); } c.innerHTML=L[0]?CQ.chipHTML(L[0])+' <span style="color:#64838d;font-size:11px;font-weight:400">'+(L[0].Status==='Done'&&L[0].DoneAt?CQ.when(L[0].DoneAt):CQ.when(L[0].QueuedAt))+'</span>':''; } }
      list.querySelectorAll('.cq').forEach(row=>{ const id=row.dataset.q; const ta=row.querySelector('[data-draft]');
        const upd=(fields,msg)=>cqApi('/'+id,{method:'PATCH',body:JSON.stringify({fields,typecast:true})}).then(()=>{ if(msg) E.undo(msg,()=>{}); draw(); }).catch(()=>alert('Save failed'));
        const ok=row.querySelector('[data-ok]'); if(ok) ok.onclick=()=>upd({Status:'Approved',ApprovedAt:new Date().toISOString(),Draft:ta?ta.value:undefined},'Approved — sends on the next queue run');
        const sv=row.querySelector('[data-save]'); if(sv) sv.onclick=()=>upd({Draft:ta.value},'Draft saved');
        const x=row.querySelector('[data-x]'); if(x) x.onclick=()=>upd({Status:'Cancelled'},'Cancelled'); }); }catch(e){ list.innerHTML='<div class="te-note">Couldn’t load Claude requests ('+e+').</div>'; } };
  box.querySelector('[data-csend]').onclick=async()=>{ const sb=box.querySelector('[data-csend]'); if(sb.disabled) return; const ta=box.querySelector('[data-ci]'); const v=ta.value.trim(); if(!v) { ta.focus(); return; } if(!E.key()){ alert('Connect Airtable first'); return; } sb.disabled=true; sb.textContent='Sending…'; setTimeout(()=>{ sb.disabled=false; sb.textContent='Send to Claude ✨'; },2500);
    const name=String(E.get(t,'Task')||'').slice(0,60);
    try{ await cqApi('',{method:'POST',body:JSON.stringify({typecast:true,records:[{fields:{Summary:'Claude → '+name,ItemId:t.id,Item:[t.id],Instruction:v,Status:'Queued',QueuedAt:new Date().toISOString()}}]})}).then(d=>{ if(window.CQ&&d&&d.records) d.records.forEach(r=>CQ.mark(Object.assign({id:r.id},r.fields))); }); ta.value=''; E.undo('✨ Queued — you’ll get a text when Claude finishes',()=>{}); draw(); }catch(e){ alert('Couldn’t queue it ('+e+')'); } };
  draw(); const iv=setInterval(()=>{ if(!document.body.contains(box)) return clearInterval(iv); if(!box.contains(document.activeElement)) draw(); },20000); }
// Count of drafts waiting for Roni (for an app-level "Claude needs approval" badge)
async function claudePending(){ const E=window.TE; if(!E||!E.key()) return []; try{ const d=await cqApi('?pageSize=20&filterByFormula='+encodeURIComponent("{Status}='Needs approval'")); return (d.records||[]).map(r=>Object.assign({id:r.id},r.fields)); }catch(e){ return []; } }

let cur=null;
function close(){ if(!cur) return; const {sc,sh}=cur; const a=document.activeElement; if(a&&sh.contains(a)) a.blur(); sc.classList.remove('on'); sh.classList.remove('on'); setTimeout(()=>{ sc.remove(); sh.remove(); },280); cur=null; }
function open(t,opts){ const E=window.TE; if(!E||!t) return; ensureCss(); if(cur) close();
  const sc=document.createElement('div'); sc.className='te-scrim'; const sh=document.createElement('div'); sh.className='te'; sh.setAttribute('role','dialog');
  const render=()=>{ sh.innerHTML=`<div class="te-h"><b>Edit task</b><button class="te-x" data-close aria-label="Close">✕</button></div><div class="te-b">${formHTML(t)}</div>
    <div class="te-a"><button class="te-btn ok" data-done>✓ Done</button><button class="te-btn" data-snz>Snooze…</button><button class="te-btn${E.get(t,'NextUp')?' on':''}" data-nu>⏫ Next up</button>
      <div class="te-snz"><button class="te-btn" data-d="1">Tomorrow</button><button class="te-btn" data-d="3">3 days</button><button class="te-btn" data-d="10">10 days</button><button class="te-btn" data-d="30">Month</button><label class="te-btn te-pick">Pick date<input type="date" data-pick></label></div>
      <button class="te-btn sm" data-mv="morning">→ AM</button><button class="te-btn sm" data-mv="afternoon">→ PM</button><button class="te-btn sm" data-mv="">Remove from category</button><button class="te-btn pri" data-close>Close</button></div>`;
    wire(sh,t); wirePhotos(sh,t); wireClaude(sh,t);
    sh.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    sh.querySelector('[data-done]').onclick=()=>{ close(); E.done(t); };
    sh.querySelector('[data-snz]').onclick=()=>sh.querySelector('.te-snz').classList.toggle('on');
    sh.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ close(); E.snooze(t,+b.dataset.d); });
    sh.querySelector('[data-pick]').onchange=ev=>{ const v=ev.target.value; if(!v) return; const days=Math.max(1,Math.round((new Date(v+'T12:00:00')-new Date())/864e5)); close(); E.snooze(t,days,v); };
    sh.querySelector('[data-nu]').onclick=()=>{ const tg=sh.querySelector('[data-tog="NextUp"]'); if(tg) tg.click(); sh.querySelector('[data-nu]').classList.toggle('on',!!E.get(t,'NextUp')); };
    const mvMark=()=>{ const c=String(E.cat(t)||''); sh.querySelectorAll('[data-mv]').forEach(x=>x.classList.toggle('on',!!x.dataset.mv&&x.dataset.mv===c)); const cs=sh.querySelector('[data-cat]'); if(cs) cs.value=c; sh.querySelectorAll('[data-catv]').forEach(x=>x.classList.toggle('on',x.dataset.catv===c)); };
    sh.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{ const v=b.dataset.mv; const prevRaw=E.catRaw(t); E.setCat(t,v); mvMark(); E.refresh(); if(navigator.vibrate) navigator.vibrate(8);
      E.undo(v==='morning'?'Moved to AM call':v==='afternoon'?'Moved to PM call':'Removed from category',()=>{ E.restoreCat(t,prevRaw); mvMark(); E.refresh(); }); }); mvMark();
    sh.querySelectorAll('.te-a button').forEach(b=>b.addEventListener('pointerdown',e=>{ const a=document.activeElement; if(a&&sh.contains(a)&&/INPUT|TEXTAREA/.test(a.tagName)) e.preventDefault(); })); };
  render(); sc.onclick=close; document.body.append(sc,sh); cur={sc,sh,t};
  const show=()=>{ sc.classList.add('on'); sh.classList.add('on'); }; requestAnimationFrame(()=>requestAnimationFrame(show)); setTimeout(show,60);
  if(opts&&opts.claude) setTimeout(()=>{ const ci=sh.querySelector('[data-ci]'); if(ci){ ci.scrollIntoView({block:'center'}); ci.focus(); } },350);
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
window.TaskEditor={open,close,loadSchema,plain,dotColor,claudePending};
})();
