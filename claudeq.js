/* claudeq.js — "✨ Claude requests": live status of Send-to-Claude requests (Airtable ClaudeQueue), shared by iPhone, grid and Focus.
   window.CQ = { init({key,base}), load(), list(), forItem(id), stale(q), chipHTML(q), rowHTML(q,opts), wire(root,{onOpen}), counts(), onChange(fn), css() }
   Status: Queued → Working → Needs approval → Approved → Done | Failed | Cancelled. Queued > 20 min = amber "not picked up yet". */
(function(){
const T='tbliwVVKs3wdNRehV', STALE_MIN=20;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cfg={key:()=>window.TE&&window.TE.key&&window.TE.key(), base:()=>(window.TE&&window.TE.base&&window.TE.base())||'appdDTNBbVrp6hVOv'};
let rows=[], subs=[], lastLoad=0, loading=null;
const C={Queued:'#8aa6af',Working:'#39c7df','Needs approval':'#e0a458',Approved:'#6fd0e0',Done:'#30D158',Failed:'#e5533a',Cancelled:'#64838d',Stale:'#e0a458'};
const api=(path,opt)=>fetch('https://api.airtable.com/v0/'+cfg.base()+'/'+T+(path||''),Object.assign({headers:{Authorization:'Bearer '+cfg.key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():Promise.reject(r.status));
const st=q=>q.Status||'Queued';
const mins=iso=>iso?Math.round((Date.now()-Date.parse(iso))/6e4):0;
function stale(q){ return st(q)==='Queued'&&mins(q.QueuedAt)>STALE_MIN; }
function when(iso){ if(!iso) return ''; const d=new Date(iso), m=mins(iso); const t=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  const day=d.toDateString()===new Date().toDateString()?'':d.toLocaleDateString([], {month:'numeric',day:'numeric'})+' ';
  return day+t+(m<1?' · just now':m<60?' · '+m+'m ago':m<1440?' · '+Math.round(m/60)+'h ago':''); }
const rank=q=>({'Needs approval':0,Failed:2,Working:3,Approved:3,Queued:4,Done:6,Cancelled:9}[st(q)]??5)-(stale(q)?3:0);
function sorted(L){ return L.slice().sort((a,b)=>(rank(a)-rank(b))||(Date.parse(b.QueuedAt||0)-Date.parse(a.QueuedAt||0))); }
async function load(force){ if(!cfg.key()) return rows; if(loading) return loading; if(!force&&Date.now()-lastLoad<15000) return rows;
  const f="AND({Status}!='Cancelled',IS_AFTER({QueuedAt},DATEADD(NOW(),-7,'days')))";
  loading=api('?pageSize=60&filterByFormula='+encodeURIComponent(f)+'&sort%5B0%5D%5Bfield%5D=QueuedAt&sort%5B0%5D%5Bdirection%5D=desc')
    .then(d=>{ const old=JSON.stringify(rows.map(r=>[r.id,r.Status,r.Result])); rows=sorted((d.records||[]).map(r=>Object.assign({id:r.id},r.fields))); lastLoad=Date.now();
      if(JSON.stringify(rows.map(r=>[r.id,r.Status,r.Result]))!==old) subs.forEach(fn=>{ try{ fn(rows); }catch(e){} }); return rows; })
    .catch(()=>rows).finally(()=>{ loading=null; });
  return loading; }
function counts(){ const n={approve:0,stale:0,active:0,failed:0,done:0,total:rows.length}; rows.forEach(q=>{ const s=st(q); if(s==='Needs approval') n.approve++; else if(stale(q)) n.stale++; else if(/Queued|Working|Approved/.test(s)) n.active++; else if(s==='Failed') n.failed++; else if(s==='Done') n.done++; }); return n; }
const forItem=id=>sorted(rows.filter(q=>q.ItemId===id));
function chipHTML(q){ const s=st(q), sl=stale(q), c=sl?C.Stale:(C[s]||C.Queued);
  return '<span class="cqx-chip'+(sl?' cqx-stale':'')+'" style="color:'+c+';border-color:'+c+'">✨ '+esc(s==='Queued'&&sl?'Queued · not picked up yet':s)+'</span>'; }
function rowHTML(q,o){ o=o||{}; const s=st(q), sl=stale(q); const name=String(q.Summary||'').replace(/^Claude →\s*/,'');
  const t=s==='Done'&&q.DoneAt?'done '+when(q.DoneAt):'sent '+when(q.QueuedAt);
  return '<div class="cq cqx'+(sl?' cqx-amber':'')+(s==='Needs approval'?' cqx-need':'')+'" data-q="'+q.id+'"><div class="cqx-h">'+chipHTML(q)+'<span class="cqx-t">'+esc(t)+'</span></div>'+
    (o.task!==false&&name?'<div class="cqx-n"'+(q.ItemId?' data-open="'+esc(q.ItemId)+'"':'')+'>'+esc(name)+(q.ItemId&&o.onOpen!==false?' ›':'')+'</div>':'')+
    '<div class="cqx-i">'+esc(q.Instruction)+'</div>'+
    (sl?'<div class="cqx-warn">Not picked up yet — waiting '+(mins(q.QueuedAt)<120?mins(q.QueuedAt)+' min':Math.round(mins(q.QueuedAt)/60)+'h')+'. The “Claude task queue” runner hasn’t taken it. You’ll get a text when it finishes.</div>':'')+
    (s==='Working'?'<div class="cqx-warn" style="color:#39c7df">Claude is working on it…</div>':'')+
    (q.Result?'<div class="cqx-r"><b>Claude:</b> '+esc(q.Result)+'</div>':'')+(q.Error?'<div class="cqx-r cqx-e"><b>Problem:</b> '+esc(q.Error)+'</div>':'')+
    (s==='Needs approval'?'<div class="cqx-d"><div class="cqx-l">'+esc(q.DraftChannel||'Message')+' → '+esc(q.DraftTo||'')+(q.DraftSubject?' · '+esc(q.DraftSubject):'')+'</div><textarea class="cqx-ta" rows="4" data-draft>'+esc(q.Draft)+'</textarea>'+
      '<div class="cqx-b"><button class="cqx-btn ok" data-ok>Approve &amp; send</button><button class="cqx-btn" data-save>Save edit</button><button class="cqx-btn" data-x>Cancel</button></div></div>':'')+
    (s==='Queued'?'<div class="cqx-b"><button class="cqx-btn sm" data-x>Cancel request</button></div>':'')+'</div>'; }
function upd(id,fields){ const q=rows.find(r=>r.id===id); if(q) Object.assign(q,fields); rows=sorted(rows); subs.forEach(fn=>{ try{ fn(rows); }catch(e){} });
  return api('/'+id,{method:'PATCH',body:JSON.stringify({fields,typecast:true})}); }
function wire(root,o){ o=o||{}; root.querySelectorAll('.cqx[data-q]').forEach(row=>{ if(row._w) return; row._w=1; const id=row.dataset.q; const ta=row.querySelector('[data-draft]');
    const say=m=>{ if(o.toast) o.toast(m); };
    const ok=row.querySelector('[data-ok]'); if(ok) ok.onclick=e=>{ e.stopPropagation(); upd(id,{Status:'Approved',ApprovedAt:new Date().toISOString(),Draft:ta?ta.value:undefined}).then(()=>say('Approved — sends on the next queue run')).catch(()=>alert('Save failed')); };
    const sv=row.querySelector('[data-save]'); if(sv) sv.onclick=e=>{ e.stopPropagation(); upd(id,{Draft:ta.value}).then(()=>say('Draft saved')).catch(()=>alert('Save failed')); };
    row.querySelectorAll('[data-x]').forEach(x=>x.onclick=e=>{ e.stopPropagation(); upd(id,{Status:'Cancelled'}).then(()=>say('Cancelled')).catch(()=>alert('Save failed')); });
    const op=row.querySelector('[data-open]'); if(op&&o.onOpen) op.onclick=()=>o.onOpen(op.dataset.open); }); }
const CSS=`.cqx{border-top:1px solid rgba(57,199,223,.14);padding:9px 2px 10px;margin:0}.cqx:first-child{border-top:0}
.cqx-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cqx-chip{font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:.6px;text-transform:uppercase;border:1px solid;border-radius:999px;padding:2px 8px;white-space:nowrap}
.cqx-t{color:#64838d;font-size:11.5px}
.cqx-n{font-weight:700;font-size:14px;margin-top:5px;color:#e7f3f6;cursor:pointer}
.cqx-i{color:#bfe3ec;font-size:13.5px;margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cqx-warn{color:#e0a458;font-size:12.5px;margin-top:5px}
.cqx-amber{background:rgba(224,164,88,.06);border-radius:10px;padding-left:8px;padding-right:8px}
.cqx-need{background:rgba(224,164,88,.09);border-radius:10px;padding-left:8px;padding-right:8px}
.cqx-r{color:#eaf6fb;font-size:13.5px;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(20,36,42,.85);border-radius:9px;padding:8px 10px}.cqx-r b{color:#39c7df}
.cqx-e b{color:#e5533a}
.cqx-d{margin-top:8px}.cqx-l{color:#e0a458;font-size:12.5px;font-weight:700;margin-bottom:5px;overflow-wrap:anywhere}
.cqx-ta{width:100%;box-sizing:border-box;background:#06161c;border:1px solid rgba(57,199,223,.3);border-radius:10px;color:#e7f3f6;font:14px/1.4 -apple-system,system-ui,sans-serif;padding:8px 10px;resize:vertical}
.cqx-b{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.cqx-btn{flex:1;min-height:38px;border-radius:10px;border:1px solid rgba(57,199,223,.3);background:rgba(57,199,223,.07);color:#e7f3f6;font:700 12px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 10px}
.cqx-btn.ok{background:#30D158;border-color:#30D158;color:#07141a}.cqx-btn.sm{flex:0 0 auto;min-height:30px;color:#8aa6af}
.cqx-sum{font:700 11px ui-monospace,Menlo,monospace;color:#8aa6af}.cqx-sum b{color:#e0a458}`;
let cssDone=false; function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); }
function summary(){ const n=counts(); return [n.approve&&'<b>'+n.approve+' to approve</b>',n.stale&&'<b>'+n.stale+' not picked up</b>',n.active&&n.active+' in progress',n.failed&&n.failed+' failed',n.done&&n.done+' done'].filter(Boolean).join(' · ')||'none this week'; }
setInterval(()=>{ if(!document.hidden) load(true); },60000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) load(true); });
window.CQ={init(c){ Object.assign(cfg,c||{}); css(); return load(true); }, load, list:()=>rows, forItem, stale, chipHTML, rowHTML, wire, counts, summary, css, when,
  onChange(fn){ subs.push(fn); }, mark(rec){ rows=sorted([rec].concat(rows.filter(r=>r.id!==rec.id))); subs.forEach(fn=>{ try{ fn(rows); }catch(e){} }); } };
})();
