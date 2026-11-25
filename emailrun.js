/* emailrun.js — "✉ Email run": button + results panel, shared by Dashboard and Focus 2.
   Button → EmailRunRequests row (Kind Scan). The "Email run" scheduled task picks it up, sorts the inbox into
   A Archive · B Don't miss · C Reply (drafted) · D Starred action · E FYI, and writes rows to EmailRun.
   A: uncheck what to keep, then "Archive checked" → Archive request. C/D drafts: Approve → Status Approved → the task sends it in-thread (or forwards it to ForwardTo when set).
   window.ER = { init(), button(opts), panel(), open() → email.html, mountPage(el), request(kind), rows(), onChange(fn) } */
(function(){
const RUN='tblIl26oggXP4WtvE', REQ='tblpkdXhqbqN1XFDd';
const key=()=>window.TE&&window.TE.key&&window.TE.key(), base=()=>(window.TE&&window.TE.base&&window.TE.base())||'appdDTNBbVrp6hVOv';
// Superhuman: Mac/PC → open the app directly (superhuman://); phone → web link.
const SHU=/iPhone|iPod|Android/.test(navigator.userAgent)?'https://mail.superhuman.com/rbenjamini@gmail.com/thread/':'superhuman://rbenjamini@gmail.com/thread/';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Key facts (amounts, dates, due/failed/fraud…) highlighted in summaries.
const hl=t=>{const s=esc(t).replace(/^★([^·]*)/,'<mark class="hl star">★$1</mark>');return s.replace(/(\$[\d,]+(?:\.\d+)?[KkMm]?|\b(?:due|overdue|expires?|expired|deadline|matures?|past due|declined|failed|fraud|urgent|final notice|danger|by (?:today|tomorrow|Mon|Tue|Wed|Thu|Fri|Sun)\w*)\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)/gi,'<mark class="hl">$1</mark>');};
const flat=v=>v&&typeof v==='object'&&'name' in v?v.name:(v==null?'':v);
const api=(t,path,opt)=>fetch('https://api.airtable.com/v0/'+base()+'/'+t+(path||''),Object.assign({headers:{Authorization:'Bearer '+key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():Promise.reject(r.status));
const BK=[['A','A · Archive','🗄 Archive','Just archive — uncheck anything you want to keep in the inbox'],
          ['B',"B · Don't miss",'⚠️ Don\'t miss','Looks important — do not miss'],
          ['C','C · Reply','✍️ Reply','Addressed to you / needs your response — reply drafted'],
          ['D','D · Starred action','⭐ Starred · action','Starred & needs action — draft or a question for you'],
          ['E','E · FYI','📄 Everything else','Summary + whether to read / act']];
let rows=[], dups={}, pend={}, req=null, reqs=[], inbox=null, subs=[], poll=null, lastLoad=0;
// Kept across redraws (the page redraws whenever Live Gmail or Airtable changes): unticked Archive rows and half-typed drafts.
const unchk={}, edits={};
const notify=()=>subs.forEach(fn=>{ try{ fn(); }catch(e){} });
const toast=m=>{ if(typeof window.toast==='function') return window.toast(m); let e=document.querySelector('.er-toast'); if(!e){e=document.createElement('div');e.className='er-toast';document.body.appendChild(e);} e.textContent=m; clearTimeout(e._t); e._t=setTimeout(()=>e.remove(),2800); };
function when(iso){ if(!iso) return ''; const d=new Date(iso), m=Math.round((Date.now()-d)/6e4); return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+(m<1?' · just now':m<60?' · '+m+'m ago':m<1440?' · '+Math.round(m/60)+'h ago':' · '+d.toLocaleDateString([], {month:'numeric',day:'numeric'})); }

async function load(force){
  if(!key()) return; if(!force&&Date.now()-lastLoad<10000) return; lastLoad=Date.now();
  try{
    const f=encodeURIComponent("OR({Status}='New',{Status}='Answered',{Status}='ToArchive',{Status}='Approved')");
    let out=[], off='';
    do{ const d=await api(RUN,'?pageSize=100&filterByFormula='+f+(off?'&offset='+off:'')); out=out.concat(d.records||[]); off=d.offset||''; }while(off);
    const all=out.map(r=>Object.assign({id:r.id},r.fields)).map(r=>Object.assign(r,{Bucket:flat(r.Bucket),Status:flat(r.Status),StarReq:flat(r.StarReq)}));
    // One row per thread: the newest run wins (each run that touches a thread again adds a row). L = bucket letter,
    // so odd spellings ("C · FYI", "B") still land in a category. Older rows are remembered so an action clears them too.
    // Done / Approved rows wait for the next run to archive or send; until then the thread is still in the inbox.
    const by={}; dups={}; pend={};
    all.forEach(r=>{ if(/ToArchive|Approved/.test(r.Status)&&r.ThreadId) pend[r.ThreadId]=r.Status; });
    all.filter(r=>!/ToArchive|Approved/.test(r.Status)).forEach(r=>{ r.L=String(r.Bucket||'').charAt(0).toUpperCase(); const k=r.ThreadId||r.id, o=by[k];
      if(!o){ by[k]=r; return; }
      const newer=String(r.RunAt||'')>=String(o.RunAt||''); (dups[k]=dups[k]||[]).push(newer?o.id:r.id); if(newer) by[k]=r; });
    rows=Object.keys(by).map(k=>by[k]);
    const q=await api(REQ,'?pageSize=8&sort%5B0%5D%5Bfield%5D=RequestedAt&sort%5B0%5D%5Bdirection%5D=desc');
    const rq=(q.records||[]).map(r=>Object.assign({id:r.id},r.fields)).map(r=>Object.assign(r,{Status:flat(r.Status),Kind:flat(r.Kind)}));
    req=rq[0]||null; reqs=rq; const ic=rq.find(r=>r.InboxCount!=null); inbox=ic?{n:ic.InboxCount,at:ic.FinishedAt||ic.RequestedAt}:null;
    if(req&&/Requested|Running/.test(req.Status)) startPoll(); else stopPoll();
    notify();
  }catch(e){}
}
function startPoll(){ if(!poll) poll=setInterval(()=>{ if(!document.hidden) load(true); },30000); }
function stopPoll(){ if(poll){ clearInterval(poll); poll=null; } }
const busy=()=>req&&/Requested|Running/.test(req.Status);

async function request(kind){
  if(!key()){ toast('Connect Airtable in ⚙︎ first'); return; }
  if(busy()&&req.Kind===kind){ toast('Already '+(req.Status==='Running'?'running':'queued')+' — results land here'); return; }
  const now=new Date().toISOString();
  try{ const r=await api(REQ,'',{method:'POST',body:JSON.stringify({fields:{Name:(kind==='Scan'?'Email run ':'Archive A ')+new Date().toLocaleString(),Kind:kind,Status:'Requested',RequestedAt:now},typecast:true})});
    req={id:r.id,Kind:kind,Status:'Requested',RequestedAt:now}; startPoll(); notify();
    toast(kind==='Scan'?'✉ Email run queued — next run 11a or 2:47p':'🗄 Archive queued');
  }catch(e){ toast('Could not queue — check connection'); }
}
const patch=(id,fields)=>api(RUN,'/'+id,{method:'PATCH',body:JSON.stringify({fields,typecast:true})});
// Acting on a thread also closes its older duplicate rows, so they don't pop back up as "New".
function markPend(id,status){ const r=rows.find(x=>x.id===id); if(r&&r.ThreadId) pend[r.ThreadId]=status; }
function clearDups(id){ const r=rows.find(x=>x.id===id), k=r&&(r.ThreadId||r.id), ids=(k&&dups[k])||[]; if(!ids.length) return; delete dups[k];
  for(let i=0;i<ids.length;i+=10) api(RUN,'',{method:'PATCH',body:JSON.stringify({records:ids.slice(i,i+10).map(x=>({id:x,fields:{Status:'Done'}})),typecast:true})}).catch(()=>{}); }
function drop(id,status){ clearDups(id); rows=rows.filter(r=>r.id!==id); notify(); return patch(id,{Status:status}).catch(()=>toast('Save failed')); }
// ✓ Done = archive it in Gmail too: Status "ToArchive" + make sure an Archive request is queued (silently).
async function doneArchive(id){
  clearDups(id); markPend(id,'ToArchive'); rows=rows.filter(r=>r.id!==id); notify();
  try{ await patch(id,{Status:'ToArchive'}); }catch(e){ return toast('Save failed'); }
  const live=(reqs||[]).find(r=>r.Kind==='Archive'&&/Requested|Running/.test(r.Status));
  if(live&&live.Status==='Requested'){ toast('✓ Done — archives at next run (11a/2:47p)'); return; }
  try{ const now=new Date().toISOString(); const r=await api(REQ,'',{method:'POST',body:JSON.stringify({fields:{Name:'Archive (Done) '+new Date().toLocaleString(),Kind:'Archive',Status:'Requested',RequestedAt:now},typecast:true})});
    reqs.unshift({id:r.id,Kind:'Archive',Status:'Requested',RequestedAt:now}); startPoll(); notify(); toast('✓ Done — archives at next run (11a/2:47p)'); }catch(e){ toast('Could not queue archive'); }
}
async function approve(r,text,to){   // sent by the next Email run pass (never auto-sent): in-thread, or forwarded when ForwardTo is set
  clearDups(r.id); markPend(r.id,'Approved'); delete edits[r.id]; rows=rows.filter(x=>x.id!==r.id); notify();
  try{ await patch(r.id,Object.assign({Status:'Approved',Draft:text},to?{ForwardTo:to}:{})); toast('✅ Approved — '+(to?'forwards':'sends')+' at next run (11a/2:47p)'); }
  catch(e){ toast('Approve failed'); load(true); }
}
// ForwardTo rows: who it goes to, editable, shown above the note. A forward must never fall back to a reply, so empty or bad addresses block Approve.
function fwdBox(r,d,cls){
  if(!r.ForwardTo) return null;
  d.insertAdjacentHTML('beforeend','<div class="er-adv">↪ Forward to (not a reply):</div>');
  const i=document.createElement('input'); i.className=cls; i.type='text'; i.value=r.ForwardTo; i.onclick=e=>e.stopPropagation(); d.appendChild(i); return i;
}
function send(r,ta,to){ const v=ta.value.trim(); if(!v) return toast('Draft is empty');
  if(!to) return approve(r,v);
  const L=to.value.split(',').map(x=>x.trim()).filter(Boolean);
  if(!L.length||!L.every(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return toast('Check the forward address');
  approve(r,v,L.join(', '));
}
// A = the Archive rows on screen. Only rows with a checkbox in `box` are touched (never the whole table).
async function archiveChecked(box,A){
  const keep=[], go=[];
  (A||[]).forEach(r=>{ const cb=box.querySelector('input[data-a="'+r.id+'"]'); if(!cb) return; (cb.checked?go:keep).push(r); });
  if(!go.length){ toast('Nothing checked'); return; }
  go.concat(keep).forEach(r=>{ clearDups(r.id); delete unchk[r.id]; });
  try{
    for(let i=0;i<keep.length;i+=10) await api(RUN,'',{method:'PATCH',body:JSON.stringify({records:keep.slice(i,i+10).map(r=>({id:r.id,fields:{Keep:true,Status:'Done'}})),typecast:true})});
    for(let i=0;i<go.length;i+=10) await api(RUN,'',{method:'PATCH',body:JSON.stringify({records:go.slice(i,i+10).map(r=>({id:r.id,fields:{Keep:false}})),typecast:true})});
    rows=rows.filter(r=>!keep.includes(r));
    await request('Archive');
  }catch(e){ toast('Save failed'); }
}

function card(r,n,L){
  const d=document.createElement('div'); d.className='er-it';
  const link=(r.ThreadId?'<a href="'+SHU+esc(r.ThreadId)+'" class="er-a" title="Open in Superhuman">⚡</a> ':'')+(r.Link?'<a href="'+esc(r.Link)+'" target="_blank" rel="noopener" class="er-a" style="margin-left:4px" title="Open in Gmail">✉️</a>':'');
  d.innerHTML='<div class="er-h"><span class="er-n">'+L+n+'</span><b>'+esc(r.From||r.FromEmail)+'</b>'+(r.Received?'<span class="er-w">'+esc(r.Received)+'</span>':'')+link+'</div>'+
    '<div class="er-s"><b>'+esc(r.Subject)+'</b>'+(r.Summary?' — '+hl(r.Summary):'')+'</div>'+
    (r.Advice?'<div class="er-adv">→ '+esc(r.Advice)+'</div>':'');
  const row=document.createElement('div'); row.className='er-b';
  const mk=(t,cls,fn)=>{ const b=document.createElement('button'); b.type='button'; b.className='er-btn '+(cls||''); b.textContent=t; b.onclick=e=>{e.stopPropagation(); fn();}; row.appendChild(b); return b; };
  if(L==='C'||(L==='D'&&r.Draft)){
    const to=fwdBox(r,d,'er-ta');
    const ta=document.createElement('textarea'); ta.className='er-ta'; ta.rows=4; ta.value=r.Draft||''; d.appendChild(ta);
    mk(to?'✅ Approve & forward':'✅ Approve & send','ok',()=>send(r,ta,to));
  }
  if(L==='D'&&!r.Draft){
    if(r.Question) d.insertAdjacentHTML('beforeend','<div class="er-q">❓ '+esc(r.Question)+'</div>');
    const ta=document.createElement('textarea'); ta.className='er-ta'; ta.rows=2; ta.placeholder='Tell Claude what to do (draft a reply, make a task, …)'; ta.value=r.Answer||''; d.appendChild(ta);
    mk(r.Status==='Answered'?'✓ Answered — next run':'➤ Send answer','ok',()=>{ const v=ta.value.trim(); if(!v) return toast('Type an answer');
      r.Answer=v; r.Status='Answered'; notify(); patch(r.id,{Answer:v,Status:'Answered'}).then(()=>request('Scan')).catch(()=>toast('Save failed')); });
  }
  mk('✓ Done','',()=>drop(r.id,'Done'));
  d.appendChild(row); return d;
}
function panel(){
  const p=document.createElement('div'); p.className='er-panel';
  const scan=reqs.find(r=>r.Kind==='Scan'), arc=reqs.find(r=>r.Kind==='Archive'), live=r=>r&&/Requested|Running/.test(r.Status), arcLive=live(arc);
  const st=req?(busy()?'<span class="er-run">'+(req.Kind==='Archive'?'Archiving':'Scanning')+' — '+(req.Status==='Running'?'working…':'queued '+when(req.RequestedAt))+'</span>':
      req.Status==='Failed'?'<span class="er-bad">Last run failed'+(req.Detail?': '+esc(req.Detail):'')+'</span>':'Last run '+when(req.FinishedAt||req.RequestedAt)+(req.Detail?' · '+esc(req.Detail):'')):'Never run';
  p.innerHTML='<div class="er-top"><div class="er-st">'+st+'</div></div>';
  const go=document.createElement('button'); go.type='button'; go.className='er-btn ok er-go'; go.textContent=live(scan)?'⏳ Scan queued':'✉ Run now'; go.disabled=live(scan); go.onclick=()=>request('Scan'); p.firstChild.appendChild(go);
  if(!rows.length){ const e=document.createElement('div'); e.className='er-empty'; e.textContent=live(scan)?'Working through your inbox…':'Inbox handled. Hit ✉ Run now for a fresh pass.'; p.appendChild(e); return p; }
  BK.forEach(([L,val,title,sub])=>{
    const its=rows.filter(r=>r.L===L); if(!its.length) return;
    const s=document.createElement('details'); s.className='er-sec er-'+L; s.open=L!=='E'||its.length<=8;
    s.innerHTML='<summary><span class="er-sl">'+L+'</span> '+title+' <i>'+its.length+'</i><div class="er-sub">'+sub+'</div></summary>';
    if(L==='A'){
      const box=document.createElement('div'); box.className='er-alist';
      box.innerHTML=its.map((r,i)=>'<label class="er-arow"><input type="checkbox" data-a="'+r.id+'"'+(r.Keep?'':' checked')+'><span class="er-n">A'+(i+1)+'</span><span class="er-af">'+esc(r.From||r.FromEmail)+'</span><span class="er-as">'+esc(r.Subject)+'</span></label>').join('');
      s.appendChild(box);
      const b=document.createElement('div'); b.className='er-b';
      const all=document.createElement('button'); all.type='button'; all.className='er-btn'; all.textContent='Toggle all'; all.onclick=()=>{ const cbs=box.querySelectorAll('input'); const on=[].some.call(cbs,c=>!c.checked); cbs.forEach(c=>c.checked=on); };
      const ar=document.createElement('button'); ar.type='button'; ar.className='er-btn ok'; ar.textContent='🗄 Archive checked'; ar.disabled=arcLive; ar.onclick=()=>archiveChecked(box,its);
      b.appendChild(all); b.appendChild(ar); s.appendChild(b);
    } else its.forEach((r,i)=>s.appendChild(card(r,i+1,L)));
    p.appendChild(s);
  });
  return p;
}
function button(o){
  o=o||{}; const b=document.createElement('button'); b.type='button'; b.className=(o.cls||'')+' er-trig'; b.title='Email run — sort the inbox (A archive · B don\'t miss · C reply · D starred · E FYI)';
  const paint=()=>{ const n=rows.filter(r=>r.L!=='A').length; b.innerHTML='✉ Email run'+(busy()?' <span class="er-dot">⏳</span>':n?' <span class="er-cnt">'+n+'</span>':''); };
  paint(); subs.push(paint);
  b.onclick=()=>{ if(o.onClick) return o.onClick(); open(); };
  return b;
}
// Full-screen page (email.html). open() navigates there instead of a pop-out.
function open(){ location.href='email.html'; }
function close(){}

// ☆/★ — star or unstar in Gmail. The next Email run applies it (StarReq) and clears the request.
async function toggleStar(r){
  const on=!r.Starred; const f={Starred:on,StarReq:on?'Star':'Unstar'};
  if(on){ f.Bucket='D · Starred action'; } else if(String(r.Bucket).startsWith('D')){ f.Bucket='E · FYI'; }
  Object.assign(r,f); r.L=String(r.Bucket||'').charAt(0); notify();
  try{ await patch(r.id,f); toast(on?'★ Starred — syncs to Gmail at next run':'☆ Unstarred — syncs to Gmail at next run'); }catch(e){ toast('Save failed'); load(true); }
}
function starBtn(r){ const b=document.createElement('button'); b.type='button'; b.className='erw-star'+(r.Starred?' on':'')+(r.StarReq?' pend':''); b.textContent=r.Starred?'★':'☆'; b.title=(r.Starred?'Unstar':'Star')+(r.StarReq?' (syncing to Gmail…)':'');
  b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); toggleStar(r); }; return b; }
const SH=r=>r.ThreadId?SHU+encodeURIComponent(r.ThreadId):'';
const links=r=>(SH(r)?'<a href="'+esc(SH(r))+'" class="erw-gm erw-sh" title="Open in Superhuman">⚡</a>':'')+(r.Link?'<a href="'+esc(r.Link)+'" target="_blank" rel="noopener" class="erw-gm erw-gl" title="Open in Gmail">✉️</a>':'');
// L = how the row behaves (the bucket the run gave it). tag = the category it is listed under (number label).
function wideRow(r,n,L,tag){
  tag=tag||L;
  const d=document.createElement('div'); d.className='erw-row erw-'+L;
  const link=links(r);
  if(L==='A'){
    d.innerHTML='<label class="erw-al"><input type="checkbox" data-a="'+r.id+'"'+(r.Keep||unchk[r.id]?'':' checked')+'><span class="er-n">'+tag+n+'</span><span class="erw-f">'+esc(r.From||r.FromEmail)+'</span><span class="erw-as">'+esc(r.Subject)+'</span></label>'+link;
    d.querySelector('input').onchange=e=>{ unchk[r.id]=!e.target.checked; };
    return d;
  }
  d.innerHTML='<div class="erw-h"><span class="er-n">'+tag+n+'</span><span class="erw-f" title="'+esc(r.FromEmail)+'">'+esc(r.From||r.FromEmail)+'</span><span class="erw-w">'+esc(r.Received||'')+'</span>'+link+'</div>'+
    '<div class="erw-s"><b>'+esc(r.Subject)+'</b>'+(r.Summary?' — '+hl(r.Summary):'')+'</div>'+
    (r.Advice?'<div class="erw-adv">→ '+esc(r.Advice)+'</div>':'');
  { const h=d.querySelector('.erw-h'); h.insertBefore(starBtn(r),h.querySelector('.erw-w')); }
  const mk=(host,t,cls,fn)=>{ const b=document.createElement('button'); b.type='button'; b.className='erw-btn '+(cls||''); b.textContent=t; b.onclick=e=>{e.preventDefault();e.stopPropagation(); fn();}; host.appendChild(b); return b; };
  const bar=document.createElement('div'); bar.className='erw-bb';
  if(L==='C'||L==='D'){
    if(r.Draft||L==='C'){
      const to=fwdBox(r,d,'erw-ta');
      const ta=document.createElement('textarea'); ta.className='erw-ta'; ta.rows=3; ta.value=edits[r.id]!==undefined?edits[r.id]:(r.Draft||''); ta.oninput=()=>{ edits[r.id]=ta.value; }; d.appendChild(ta);
      mk(bar,to?'✅ Approve & forward':'✅ Approve & send','ok',()=>send(r,ta,to));
    } else {
      if(r.Question) d.insertAdjacentHTML('beforeend','<div class="er-q">❓ '+esc(r.Question)+'</div>');
      const ta=document.createElement('textarea'); ta.className='erw-ta'; ta.rows=2; ta.placeholder='Tell Claude what to do…'; ta.value=edits[r.id+':a']!==undefined?edits[r.id+':a']:(r.Answer||''); ta.oninput=()=>{ edits[r.id+':a']=ta.value; }; d.appendChild(ta);
      mk(bar,r.Status==='Answered'?'✓ Answered':'➤ Send answer','ok',()=>{ const v=ta.value.trim(); if(!v) return toast('Type an answer');
        r.Answer=v; r.Status='Answered'; notify(); patch(r.id,{Answer:v,Status:'Answered'}).then(()=>request('Scan')).catch(()=>toast('Save failed')); });
    }
  }
  if(L==='C'||L==='D'){ mk(bar,'✓ Done','',()=>doneArchive(r.id)); d.appendChild(bar); }
  else { const h=d.querySelector('.erw-h'); const b=mk(h,'✓','erw-ck',()=>doneArchive(r.id)); b.title='Done — archives it'; }
  return d;
}
// ── Scan tab (email.html) ───────────────────────────────────────────────────────
// Same layout as Live Gmail: categories in a rail on the left, open ones on the right, and the page opens with
// only Reply and Don't miss unfolded. When Live Gmail has the whole inbox loaded, Scan shows exactly those threads,
// in the category Live puts them in, so the counts on the two tabs are the same. A thread a run has sorted gets the
// full card (summary, advice, draft to approve); one no run has reached yet shows as a plain line.
const CATS0=[['D','Starred','star'],['C','Reply','reply'],['B',"Don't miss",'alert'],['E','Everything else','file'],['A','Archive','archive']];
const sOpen={C:true,B:true};
const gic=n=>window.GL&&GL.ic?GL.ic(n):'';
function bareRow(t,n,L){
  const d=document.createElement('div'); d.className='erw-row erw-bare';
  const dt=t.date?new Date(t.date).toLocaleString([], {month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  d.innerHTML='<div class="erw-h"><span class="er-n">'+L+n+'</span><span class="erw-f" title="'+esc(t.email)+'">'+esc(t.from)+'</span><span class="erw-w">'+esc(dt)+'</span>'+
    '<a href="'+esc(SHU+encodeURIComponent(t.id))+'" class="erw-gm erw-sh" title="Open in Superhuman">⚡</a><a href="https://mail.google.com/mail/u/0/#inbox/'+encodeURIComponent(t.id)+'" target="_blank" rel="noopener" class="erw-gm erw-gl" title="Open in Gmail">✉️</a></div>'+
    '<div class="erw-s"><b>'+esc(t.subject)+'</b>'+(t.snippet?' — '+esc(t.snippet):'')+'</div>'+
    (pend[t.id]?'<div class="erw-adv">'+(pend[t.id]==='Approved'?'✅ Approved. Sends at the next run (11a / 2:47p)':'✓ Done. Archives at the next run (11a / 2:47p)')+'</div>':'');
  if(pend[t.id]) d.classList.add('erw-pend');
  return d;
}
function pageView(){
  const p=document.createElement('div'); p.className='erw';
  const scan=reqs.find(r=>r.Kind==='Scan'), arc=reqs.find(r=>r.Kind==='Archive');
  const live=r=>r&&/Requested|Running/.test(r.Status);
  const st=scan?(live(scan)?'<span class="er-run">Scanning — '+(scan.Status==='Running'?(scan.Detail?esc(scan.Detail):'working…'):'queued '+when(scan.RequestedAt)+' · runs 11a/2:47p')+'</span>':
      scan.Status==='Failed'?'<span class="er-bad">Last scan failed'+(scan.Detail?': '+esc(scan.Detail):'')+'</span>':'Last scan '+when(scan.FinishedAt||scan.RequestedAt)+(scan.Detail?' · '+esc(scan.Detail):'')):'Never run';
  const arcLive=live(arc);
  // Matched to Live Gmail once it has the whole inbox: same threads, same categories, same counts.
  // Until then (still loading, or Gmail not connected) it falls back to the saved scan rows, one per thread.
  const snap=window.GL&&GL.snapshot?GL.snapshot():null, matched=!!(snap&&snap.complete);
  const cats=matched?GL.CATS:CATS0, by={}, put=(L,x)=>(by[L]=by[L]||[]).push(x);
  let nSorted=rows.length;
  if(matched){ const byT={}; rows.forEach(r=>{ if(r.ThreadId) byT[r.ThreadId]=r; }); nSorted=0;
    snap.threads.forEach(t=>{ const r=byT[t.id]||null; if(r||pend[t.id]) nSorted++; put(t.b,{t,r}); }); }
  else rows.forEach(r=>put('DCBEA'.indexOf(r.L)>=0?r.L:'E',{r,t:null}));
  const nAll=matched?snap.loaded:rows.length;
  const chips=matched
    ?'<span class="erw-chip erw-inbox" title="Threads in your Gmail inbox right now. Same number as Live Gmail.">📥 <b>'+snap.loaded+'</b> in inbox</span><span class="erw-chip" title="Inbox threads an Email run has sorted so far">✓ <b>'+nSorted+'</b> sorted</span>'
    :(inbox?'<span class="erw-chip erw-inbox" title="Threads in your Gmail inbox as of '+esc(when(inbox.at))+'">📥 <b>'+inbox.n+'</b> in inbox at last run</span>':'');
  const note=matched?'':'<span class="erw-note">'+(snap&&snap.connected?'Matching to your inbox… '+snap.loaded+' loaded':'Live Gmail not connected. Showing every email past runs left as New, not today\'s inbox')+'</span> · ';
  p.innerHTML='<div class="erw-bar"><div class="erw-chips">'+chips+'</div><div class="er-st erw-st">'+note+st+'</div></div>';
  const go=document.createElement('button'); go.type='button'; go.className='er-btn ok erw-go'; go.textContent=live(scan)?'⏳ Scan queued':'✉ Run now'; go.disabled=live(scan); go.onclick=()=>request('Scan'); p.firstChild.appendChild(go);
  if(!nAll){ const e=document.createElement('div'); e.className='er-empty'; e.textContent=live(scan)?'Working through your inbox…':'Inbox handled. Hit ✉ Run now for a fresh pass.'; p.appendChild(e); return p; }
  // Rail on the left: every category with its count. Tap = open / close it on the right.
  const body=document.createElement('div'); body.className='erw-body'; p.appendChild(body);
  const rail=document.createElement('nav'); rail.className='erw-rail'; rail.innerHTML='<div class="erw-rhd">Categories</div>'; body.appendChild(rail);
  cats.forEach(([L,label,icn])=>{ const n=(by[L]||[]).length, on=!!sOpen[L];
    const b=document.createElement('button'); b.type='button'; b.className='erw-ri er-r'+L+(on?' on':'')+(n?'':' zero'); b.title=(on?'Close ':'Open ')+label;
    b.innerHTML='<span class="er-sl">'+(gic(icn)||L)+'</span><span class="erw-rn">'+esc(label)+'</span><i>'+n+'</i>';
    b.onclick=()=>{ sOpen[L]=!on; notify(); }; rail.appendChild(b); });
  const main=document.createElement('div'); main.className='erw-main'; body.appendChild(main);
  const shown=cats.filter(c=>sOpen[c[0]]&&(by[c[0]]||[]).length);
  if(!shown.length){ main.innerHTML='<div class="er-empty">All categories are closed. Pick one on the left.</div>'; return p; }
  const w=window.innerWidth-250, nCol=Math.max(1,Math.min(shown.length,w>=1150?3:w>=700?2:1)), colEls=[];
  for(let i=0;i<nCol;i++){ const c=document.createElement('div'); c.className='erw-col'; main.appendChild(c); colEls.push(c); }
  const kind=r=>r.L==='C'||r.L==='D'||r.L==='B'?r.L:'E';   // how a card behaves when it is not in the Archive checklist
  shown.forEach(([L,label,icn],si)=>{
    const its=by[L], rich=its.filter(x=>x.r), bare=its.filter(x=>!x.r), aRows=L==='A'?rich.filter(x=>x.r.L==='A').map(x=>x.r):[];
    const s=document.createElement('section'); s.className='erw-sec er-'+L; s.id='erw-'+L;
    s.innerHTML='<div class="erw-sh" title="Close '+esc(label)+'"><span class="er-sl">'+(gic(icn)||L)+'</span><h2>'+esc(label)+'</h2><i>'+its.length+'</i></div>';
    const hb=s.firstChild; hb.onclick=e=>{ if(e.target.closest('button,a,input,summary')) return; sOpen[L]=false; notify(); };
    const list=document.createElement('div'); list.className='erw-list'; let n=0;
    if(L==='A'&&arcLive&&aRows.length){
      s.classList.add('erw-q');
      hb.insertAdjacentHTML('beforeend','<span class="er-run erw-qs">🗄 '+(arc.Status==='Running'?(arc.Detail?esc(arc.Detail):'archiving…'):'queued '+when(arc.RequestedAt)+' · runs 11a/2:47p')+'</span>');
      const det=document.createElement('details'); det.className='erw-qd';
      det.innerHTML='<summary>'+aRows.length+' queued to archive — tap to see</summary>';
      const ql=document.createElement('div'); ql.className='erw-list';
      aRows.forEach(r=>{ const row=wideRow(r,++n,'A'); const cb=row.querySelector('input'); if(cb) cb.disabled=true; ql.appendChild(row); });
      det.appendChild(ql); s.appendChild(det);
    } else if(aRows.length){
      // Rows the run itself filed under Archive: tick list + "Archive checked" (untick = keep in the inbox).
      aRows.forEach(r=>list.appendChild(wideRow(r,++n,'A')));
      const all=document.createElement('button'); all.type='button'; all.className='er-btn'; all.textContent='Toggle all'; all.onclick=()=>{ const cbs=list.querySelectorAll('input[data-a]'); const on=[].some.call(cbs,c=>!c.checked); cbs.forEach(c=>{ c.checked=on; unchk[c.dataset.a]=!on; }); };
      const ar=document.createElement('button'); ar.type='button'; ar.className='er-btn ok'; ar.textContent='🗄 Archive checked'; ar.onclick=()=>archiveChecked(list,aRows);
      const sb=document.createElement('span'); sb.className='erw-shb'; sb.appendChild(all); sb.appendChild(ar); hb.appendChild(sb);
    }
    if(L==='A') rich.filter(x=>x.r.L!=='A').forEach(x=>list.appendChild(wideRow(x.r,++n,kind(x.r),'A')));
    else {
      const g={}; rich.forEach(x=>{ const k=x.r.Project||'Other'; (g[k]=g[k]||[]).push(x.r); });
      const keys=Object.keys(g).sort((a,b)=>(a==='Other')-(b==='Other')||g[b].length-g[a].length||a.localeCompare(b));
      keys.forEach(k=>{ const h=document.createElement('div'); h.className='erw-pj'; h.innerHTML=esc(k)+' <i>'+g[k].length+'</i>'; list.appendChild(h);
        g[k].forEach(r=>list.appendChild(wideRow(r,++n,kind(r),L))); });
    }
    // In the inbox but no Email run has sorted it yet: plain line, so the count here is the count in Live Gmail.
    const wait=bare.filter(x=>pend[x.t.id]), raw=bare.filter(x=>!pend[x.t.id]);
    [[wait,'Handled · waiting for the next run'],[raw,'Not sorted by a run yet']].forEach(([grp,ttl])=>{ if(!grp.length) return;
      if(rich.length||wait.length){ const h=document.createElement('div'); h.className='erw-pj'; h.innerHTML=ttl+' <i>'+grp.length+'</i>'; list.appendChild(h); }
      grp.forEach(x=>list.appendChild(bareRow(x.t,++n,L))); });
    if(L==='N'){ const sb=document.createElement('span'); sb.className='erw-shb'; const b=document.createElement('button'); b.type='button'; b.className='er-btn ok'; b.textContent=live(scan)?'⏳ Queued':'✉ Sort these'; b.disabled=!!live(scan); b.onclick=()=>request('Scan'); sb.appendChild(b); hb.appendChild(sb); }
    s.appendChild(list); colEls[si%nCol].appendChild(s);
  });
  return p;
}
function mountPage(host){
  css();
  const fill=()=>{ const a=document.activeElement; if(a&&host.contains(a)&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&a.type!=='checkbox'))) return;
    const y=host.scrollTop, v=pageView(); host.replaceChildren(v); host.scrollTop=y;
    const bar=v.querySelector('.erw-bar'), rail=v.querySelector('.erw-rail'); if(bar&&rail&&bar.offsetHeight) rail.style.top=bar.offsetHeight+'px'; };
  subs.push(fill); fill(); load(true);
  // Live Gmail changed (finished loading, archived, starred, hidden, kept…): redraw only if what Scan shows would change.
  if(window.GL&&GL.onChange){ let sig=''; GL.onChange(()=>{ const s=GL.snapshot(), k=s.complete+':'+s.loaded+':'+s.threads.map(t=>t.id+t.b).join(','); if(k!==sig){ sig=k; fill(); } }); }
}
const CSS=`.er-trig .er-cnt{background:#e0a458;color:#07141a;border-radius:999px;padding:0 6px;font-size:11px;font-weight:800;margin-left:3px}
.er-ov{position:fixed;inset:0;z-index:9999;background:rgba(2,8,11,.62);display:flex;justify-content:center;align-items:flex-start;padding:4vh 12px;overflow:auto}
.er-mod{width:min(760px,100%);background:#0b1b21;border:1px solid rgba(57,199,223,.3);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#e7f3f6;font:14px/1.4 -apple-system,system-ui,sans-serif}
.er-mh{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(57,199,223,.15)}.er-mh h3{margin:0;font-size:17px}
.er-body{padding:10px 16px 16px}
.er-panel{color:#e7f3f6;font:14px/1.4 -apple-system,system-ui,sans-serif}
.er-top{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:8px}.er-st{color:#8aa6af;font-size:12.5px}
.er-run{color:#39c7df;font-weight:700}.er-bad{color:#e5533a;font-weight:700}
.er-go{flex:0 0 auto!important}
.er-empty{color:#8aa6af;padding:18px 4px;text-align:center}
.er-sec{border-top:1px solid rgba(57,199,223,.14);padding:8px 0}
.er-sec summary{cursor:pointer;font-weight:800;font-size:14.5px;list-style:none}.er-sec summary::-webkit-details-marker{display:none}
.er-sec summary i{font-style:normal;color:#07141a;background:#39c7df;border-radius:999px;padding:0 7px;font-size:11.5px;margin-left:4px}
.er-sub{font-weight:400;color:#8aa6af;font-size:12px;margin-top:2px}
.er-sl{display:inline-block;width:20px;height:20px;border-radius:6px;text-align:center;line-height:20px;font:800 12px ui-monospace,Menlo,monospace;background:rgba(57,199,223,.15);color:#39c7df}
.er-B .er-sl{background:#e5533a;color:#fff}.er-D .er-sl{background:#e0a458;color:#07141a}.er-A .er-sl{color:#8aa6af}
.er-it{background:rgba(20,36,42,.7);border-radius:10px;padding:9px 11px;margin-top:8px}
.er-h{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.er-w{color:#64838d;font-size:12px}.er-a{margin-left:auto;text-decoration:none}
.er-n{font:700 11px ui-monospace,Menlo,monospace;color:#39c7df;min-width:22px}
.er-s{margin-top:3px;color:#bfe3ec;overflow-wrap:anywhere}.er-s mark.hl.star,.erw-s mark.hl.star{background:rgba(224,164,88,.35);color:#ffe0a8}.er-s mark.hl,.erw-s mark.hl{background:rgba(224,164,88,.2);color:#ffd28a;border-radius:3px;padding:0 2px;font-weight:700}.er-adv{margin-top:4px;color:#e0a458;font-size:13px}.er-q{margin-top:6px;color:#e0a458;font-weight:700}
.er-ta{width:100%;box-sizing:border-box;margin-top:7px;background:#06161c;border:1px solid rgba(57,199,223,.3);border-radius:10px;color:#e7f3f6;font:14px/1.4 -apple-system,system-ui,sans-serif;padding:8px 10px;resize:vertical}
.er-b{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.er-btn{flex:1;min-height:34px;border-radius:10px;border:1px solid rgba(57,199,223,.3);background:rgba(57,199,223,.07);color:#e7f3f6;font:700 12px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 10px}
.er-btn.ok{background:#30D158;border-color:#30D158;color:#07141a}.er-btn:disabled{opacity:.45;cursor:default}.er-x{flex:0 0 auto}
.er-alist{margin-top:6px;max-height:360px;overflow:auto}
.er-arow{display:flex;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid rgba(57,199,223,.07);cursor:pointer;font-size:13px}
.er-af{flex:0 0 32%;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.er-as{flex:1;color:#bfe3ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.er-toast{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);background:#0b1b21;color:#e7f3f6;border:1px solid #39c7df;border-radius:10px;padding:8px 14px;z-index:10000}

.erw{padding:0 18px 30px;font-size:13px}
.erw-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;background:linear-gradient(#070d11 85%,rgba(7,13,17,0))}
.erw-bar h1{margin:0;font-size:18px}.erw-back{color:#8aa6af;text-decoration:none;font:700 12px ui-monospace,Menlo,monospace}.erw-back:hover{color:#39c7df}
.erw-chips{display:flex;gap:5px}.erw-chip{text-decoration:none;color:#e7f3f6;border:1px solid rgba(57,199,223,.3);border-radius:999px;padding:2px 9px;font:600 11.5px ui-monospace,Menlo,monospace}
.erw-chip b{color:#39c7df}.erw-cB b{color:#e5533a}.erw-cD b{color:#e0a458}
.erw-st{flex:1;min-width:180px}.erw-go{flex:0 0 auto;padding:0 16px}
.erw-body{display:flex;gap:16px;align-items:flex-start}
.erw-main{flex:1;min-width:0;display:flex;gap:14px;align-items:flex-start}.erw-col{flex:1;min-width:0}
.erw-rail{flex:none;width:212px;position:sticky;top:50px;display:flex;flex-direction:column;gap:3px;max-height:calc(100vh - 120px);overflow:auto;padding-bottom:6px}
.erw-rhd{font:800 10.5px ui-monospace,Menlo,monospace;letter-spacing:1.2px;text-transform:uppercase;color:#64838d;padding:2px 9px 4px}
.erw-ri{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border-radius:9px;border:1px solid transparent;background:none;color:#9fb9c2;font:700 14px -apple-system,system-ui,sans-serif;text-align:left;cursor:pointer}
.erw-ri:hover{background:rgba(57,199,223,.08);color:#e7f3f6}.erw-ri.on{background:rgba(57,199,223,.12);border-color:rgba(57,199,223,.38);color:#e7f3f6}.erw-ri.zero{opacity:.42}
.erw-rn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erw-ri i{font-style:normal;color:#07141a;background:#39c7df;border-radius:999px;padding:0 7px;font-size:11px;font-weight:800;flex:none}
.erw-ri .er-sl,.erw-sh .er-sl{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none}.er-sl .gi{width:14px;height:14px;margin:0}
.erw-ri.er-rB .er-sl,.erw-ri.er-rB i{background:#e5533a;color:#fff}.erw-ri.er-rD .er-sl,.erw-ri.er-rD i{background:#e0a458;color:#07141a}
.erw-ri.er-rA .er-sl,.erw-ri.er-rN .er-sl,.erw-ri.er-rX .er-sl{color:#8aa6af}.erw-ri.er-rK .er-sl,.er-K .er-sl{color:#e0a458}
.erw-bare{border-style:dashed}.erw-bare .erw-s{color:#9fb9c2}.erw-pend{opacity:.6}.erw-pend .erw-adv{color:#30D158}
.erw-note{color:#e0a458}
.erw-sec{margin-bottom:12px}
.erw-pj{break-after:avoid;font:800 10.5px ui-monospace,Menlo,monospace;letter-spacing:1.2px;text-transform:uppercase;color:#64838d;margin:6px 2px 0}.erw-pj i{font-style:normal;color:#39c7df;margin-left:3px}
.erw-q{opacity:.5}.erw-q:hover{opacity:.8}.erw-qs{font-size:11.5px;margin-left:auto}.erw-qd summary{cursor:pointer;color:#8aa6af;font-size:12px;padding:4px 2px}
.erw-inbox{border-color:rgba(48,209,88,.4)}.erw-inbox b{color:#30D158}
.erw-sh{display:flex;align-items:center;gap:7px;padding:4px 2px 6px;break-after:avoid;flex-wrap:wrap}
div.erw-sh{cursor:pointer;user-select:none}
.erw-sh h2{margin:0;font-size:13.5px;font-weight:800}.erw-sh i{font-style:normal;color:#07141a;background:#39c7df;border-radius:999px;padding:0 7px;font-size:11px;font-weight:800}
.erw-shb{margin-left:auto;display:flex;gap:5px}
.erw-list{display:flex;flex-direction:column;gap:4px}
.erw-row{break-inside:avoid;-webkit-column-break-inside:avoid;border:1px solid rgba(57,199,223,.12);border-radius:9px;padding:6px 9px}
.erw-B{border-color:rgba(229,83,58,.35)}.erw-D{border-color:rgba(224,164,88,.35)}
.erw-h{display:flex;align-items:baseline;gap:6px;min-width:0}
.erw-f{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erw-w{flex:none;color:#64838d;font-size:11px}.erw-gm{flex:none;text-decoration:none;font-size:12px}
.erw-s{margin-top:2px;color:#bfe3ec;font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.erw-s:hover{-webkit-line-clamp:unset}.erw-B .erw-s{-webkit-line-clamp:6}
.erw-adv{margin-top:2px;color:#e0a458;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.erw-row .er-q{font-size:12px;margin-top:4px}
.erw-ta{width:100%;box-sizing:border-box;margin-top:5px;background:#06161c;border:1px solid rgba(57,199,223,.25);border-radius:8px;color:#e7f3f6;font:12.5px/1.35 -apple-system,system-ui,sans-serif;padding:6px 8px;resize:vertical}
.erw-bb{display:flex;gap:5px;margin-top:5px;justify-content:flex-end}
.erw-btn{height:26px;border-radius:7px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#cfe7ee;font:700 11px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 9px}
.erw-star{flex:none;background:none;border:0;cursor:pointer;color:#64838d;font-size:15px;line-height:1;padding:0 2px}.erw-star.on{color:#f5c518}.erw-star.pend{opacity:.55}.erw-star:hover{color:#f5c518}
.erw-gl{opacity:.45;font-size:11px}.erw-gl:hover{opacity:1}
.erw-ck{height:20px;padding:0 6px;font-size:11px;flex:none}
.erw-btn.ok{background:#30D158;border-color:#30D158;color:#07141a}
.erw-A{padding:3px 8px;display:flex;align-items:center;gap:6px}
.erw-al{flex:1;min-width:0;display:flex;align-items:center;gap:6px;cursor:pointer}
.erw-al .erw-f{flex:0 0 38%}.erw-as{flex:1;min-width:0;color:#bfe3ec;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erw-shb .er-btn{flex:0 0 auto;min-height:26px;font-size:11px}
@media(max-width:700px){.erw{padding:0 10px 24px}
  .erw-body{flex-direction:column;gap:6px}.erw-main{flex-direction:column;width:100%}.erw-col{width:100%}
  .erw-rail{width:100%;flex-direction:row;gap:5px;overflow-x:auto;max-height:none;z-index:4;background:#070d11;padding:5px 0;scrollbar-width:none}.erw-rail::-webkit-scrollbar{display:none}
  .erw-rhd{display:none}.erw-ri{width:auto;flex:none;padding:6px 10px;border-color:rgba(57,199,223,.2)}.erw-rn{flex:none}}
@media(max-width:600px){.er-af{flex-basis:38%}.er-ov{padding:0}.er-mod{border-radius:0;min-height:100%}}`;
let cssDone=false; function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); }
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) load(); });
window.ER={ init(){ css(); return load(true); }, load, button, panel, open, close, mountPage, request, rows:()=>rows, onChange(fn){ subs.push(fn); } };
})();
