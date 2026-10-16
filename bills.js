/* bills.js — 💵 Bills & Taxes (Airtable "Bills" table), shared by iPhone (m/) and the grid. TRACKING ONLY: nothing here ever pays anything.
   window.Bills = { init({key,base}), load(force), list(), unpaid(), nextDue(b), daysLeft(b), rowHTML(b), wire(root,{toast,onOpenTask,after}), addFromPhoto(files,{toast}), onChange(fn), css() } */
(function(){
const T='tblTkFfMucX9OFnXq', ITEMS='tblLpOdHqxoP3siYk', RECEIPT='fldNKkUJfuTSiHQjq', PHOTO='fldlEoGjOVpyUkMc2';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cfg={key:()=>window.TE&&window.TE.key&&window.TE.key(), base:()=>(window.TE&&window.TE.base&&window.TE.base())||'appdDTNBbVrp6hVOv'};
let rows=[], subs=[], at=0, busy=null;
const api=(tbl,path,opt)=>fetch('https://api.airtable.com/v0/'+cfg.base()+'/'+tbl+(path||''),Object.assign({headers:{Authorization:'Bearer '+cfg.key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():r.json().then(j=>Promise.reject(r.status+' '+((j.error&&j.error.message)||'')),()=>Promise.reject(r.status)));
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=()=>iso(new Date());
const addDays=(s,n)=>{ const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); };
const addMonths=(s,n)=>{ if(!s) return s; const d=new Date(s+'T12:00:00'); d.setMonth(d.getMonth()+n); return iso(d); };
const money=n=>n==null||n===''?'':'$'+(+n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fire=()=>subs.forEach(f=>{ try{ f(rows); }catch(e){} });
// schedule lines "2026-10-31 $7,064.03 …" → [{d,amt}]
function sched(b){ return String(b.Schedule||'').split('\n').map(l=>{ const m=l.match(/(\d{4}-\d{2}-\d{2})\s+\$?([\d,]+\.\d\d)/); return m?{d:m[1],amt:+m[2].replace(/,/g,''),approx:/≈/.test(l)}:null; }).filter(Boolean); }
// what to pay next and by when (cheapest step still open), else NoPenaltyBy / DueDate
function nextDue(b){ const t=today(); const s=sched(b).find(x=>x.d>=t); if(s) return {by:s.d,amt:s.amt,approx:s.approx,step:true};
  const by=(b.NoPenaltyBy&&b.NoPenaltyBy>=t)?b.NoPenaltyBy:(b.DueDate||b.NoPenaltyBy||''); return {by,amt:b.Amount,approx:false,step:false}; }
const daysLeft=b=>{ const n=nextDue(b); if(!n.by) return null; return Math.round((new Date(n.by+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5); };
const unpaid=()=>rows.filter(b=>(b.Status||'Unpaid')!=='Paid').sort((a,b)=>String(nextDue(a).by||'9').localeCompare(String(nextDue(b).by||'9')));
async function load(force){ if(!cfg.key()) return rows; if(busy) return busy; if(!force&&Date.now()-at<60000) return rows;
  busy=(async()=>{ let out=[],off,g=0; do{ const d=await api(T,'?pageSize=100'+(off?'&offset='+off:'')); out=out.concat((d.records||[]).map(r=>Object.assign({id:r.id},r.fields))); off=d.offset; }while(off&&++g<20);
    const old=JSON.stringify(rows); rows=out; at=Date.now(); if(JSON.stringify(rows)!==old) fire(); return rows; })().catch(()=>rows).finally(()=>{ busy=null; }); return busy; }
const firstUrl=s=>{ const m=String(s||'').match(/https?:\/\/[^\s)]+/); return m?m[0]:''; };
function rowHTML(b,o){ o=o||{}; const n=nextDue(b), dl=daysLeft(b), paid=b.Status==='Paid'; const url=firstUrl(b.PayNotes);
  const cls=paid?'ok':dl==null?'':dl<0?'late':dl<=7?'soon':'';
  const when=paid?('Paid '+(b.PaidDate||'')+(b.Confirmation?' · #'+esc(b.Confirmation):'')):(n.by?(dl<0?Math.abs(dl)+'d LATE':dl===0?'due TODAY':dl+'d left')+' · by '+new Date(n.by+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:n.by.slice(0,4)!==today().slice(0,4)?'2-digit':undefined}):'');
  return `<div class="bl-row ${cls}" data-bill="${b.id}"><div class="bl-top" data-bopen><div class="bl-l"><b>${esc(b.Description||'(bill)')}</b><span>${esc((b.Payee||'').split(' — ')[0])}${b.Property?' · '+esc(String(b.Property).split(',')[0]):''}</span></div>
    <div class="bl-r"><b>${n.approx?'≈':''}${money(n.amt)}</b><span class="bl-d">${when}</span></div></div>
    <div class="bl-more" hidden>${n.step&&!paid?`<div class="bl-n">Price steps up after ${esc(n.by)} — see schedule.</div>`:''}
      ${b.Schedule?`<div class="bl-k">Pay-by schedule</div><pre>${esc(b.Schedule)}</pre>`:''}${b.PayNotes?`<div class="bl-k">How to pay</div><pre>${esc(b.PayNotes)}</pre>`:''}${b.Notes?`<div class="bl-k">Notes</div><pre>${esc(b.Notes)}</pre>`:''}
      <div class="bl-k">${esc([b.Parcel&&('Parcel '+b.Parcel),b.BillNo&&('Bill #'+b.BillNo),b.Recurs&&b.Recurs!=='None'&&('Recurs '+b.Recurs)].filter(Boolean).join(' · '))}</div></div>
    ${paid?'':`<div class="bl-b">${url?`<a class="bl-btn" href="${esc(url)}" target="_blank" rel="noopener">Pay site ↗</a>`:''}${b.TaskId&&o.onOpenTask!==false?'<button class="bl-btn" data-btask>Task</button>':''}<button class="bl-btn pay" data-bpaid>✓ Mark paid</button></div>
    <div class="bl-pf" hidden><input class="bl-in" data-bconf placeholder="Confirmation # (optional)" autocomplete="off"><div class="bl-pfb"><button class="bl-btn" data-brcpt>📷 Receipt</button><span data-brn></span><button class="bl-btn pay" data-bsave>Save as paid</button><button class="bl-btn" data-bx>Cancel</button></div></div>`}</div>`; }
async function markPaid(b,conf,receipt,o){ const t=today(); const say=m=>o&&o.toast&&o.toast(m);
  await api(T,'/'+b.id,{method:'PATCH',body:JSON.stringify({typecast:true,fields:{Status:'Paid',PaidDate:t,Confirmation:conf||null}})}); Object.assign(b,{Status:'Paid',PaidDate:t,Confirmation:conf||''});
  if(receipt&&window.Photos){ try{ const p=await Photos.prep(receipt); await fetch('https://content.airtable.com/v0/'+cfg.base()+'/'+b.id+'/'+RECEIPT+'/uploadAttachment',{method:'POST',headers:{Authorization:'Bearer '+cfg.key(),'Content-Type':'application/json'},body:JSON.stringify({contentType:p.contentType,file:p.file,filename:'receipt_'+p.filename})}); }catch(e){ say('⚠︎ Receipt photo not saved ('+e+')'); } }
  if(b.TaskId){ try{ await api(ITEMS,'/'+b.TaskId,{method:'PATCH',body:JSON.stringify({typecast:true,fields:{Status:'Done',Notes:'Paid '+t+(conf?' · conf #'+conf:'')+' (💵 Bills)'}})}); }catch(e){} }
  // recurring → next bill (amount carried over as an estimate) + its reminder task
  const step=b.Recurs==='Annual'?12:b.Recurs==='Semiannual'?6:0; let made=null;
  if(step){ const due=addMonths(b.DueDate,step), np=addMonths(b.NoPenaltyBy,step), by=np||due; let remind=addDays(by,-14); if(remind<t) remind=t;
    const desc=String(b.Description||'').replace(/(\d{4})(\s*[–-]\s*)(\d{2,4})/,(m,a,s2,c)=>(+a+step/12)+s2+(c.length===2?String(+c+step/12).padStart(2,'0'):(+c+step/12)));
    try{ const tr=await api(ITEMS,'',{method:'POST',body:JSON.stringify({typecast:true,fields:{Task:'💵 Pay '+desc+' — ≈'+money(b.Amount)+' by '+by,Status:'Open',Section:'Bills & Taxes',DoDate:remind,TextExclude:true,Source:'Claude',NextStep:'New bill should arrive — update the amount in 💵 Bills'}})});
      const nb=await api(T,'',{method:'POST',body:JSON.stringify({typecast:true,fields:{Description:desc,Payee:b.Payee,Property:b.Property,Parcel:b.Parcel,Amount:b.Amount,DueDate:due||null,NoPenaltyBy:np||null,PayNotes:b.PayNotes,Status:'Unpaid',Recurs:b.Recurs,Task:[tr.id],TaskId:tr.id,Notes:'≈ Estimated from last period ('+money(b.Amount)+') — update when the new bill arrives.'}})});
      made=nb; rows.push(Object.assign({id:nb.id},nb.fields)); }catch(e){ say('⚠︎ Next bill not created ('+e+')'); } }
  fire(); say('✓ Marked paid'+(made?' · next one added':'')); return made; }
function wire(root,o){ o=o||{}; root.querySelectorAll('.bl-row[data-bill]').forEach(r=>{ if(r._w) return; r._w=1; const b=rows.find(x=>x.id===r.dataset.bill); if(!b) return; let rcpt=null;
  const q=s=>r.querySelector(s); const op=q('[data-bopen]'); if(op) op.onclick=()=>{ const m=q('.bl-more'); m.hidden=!m.hidden; };
  const tk=q('[data-btask]'); if(tk) tk.onclick=e=>{ e.stopPropagation(); o.onOpenTask&&o.onOpenTask(b.TaskId); };
  const pb=q('[data-bpaid]'); if(pb) pb.onclick=e=>{ e.stopPropagation(); const f=q('.bl-pf'); f.hidden=!f.hidden; if(!f.hidden) setTimeout(()=>q('[data-bconf]').focus(),50); };
  const rb=q('[data-brcpt]'); if(rb) rb.onclick=async()=>{ if(!window.Photos) return; const f=await Photos.pick(false); if(f[0]){ rcpt=f[0]; q('[data-brn]').textContent='📷 1 photo'; } };
  const x=q('[data-bx]'); if(x) x.onclick=()=>{ q('.bl-pf').hidden=true; };
  const sv=q('[data-bsave]'); if(sv) sv.onclick=async()=>{ sv.disabled=true; sv.textContent='Saving…'; try{ await markPaid(b,q('[data-bconf]').value.trim(),rcpt,o); o.after&&o.after(); }catch(e){ sv.disabled=false; sv.textContent='Save as paid'; o.toast&&o.toast('⚠︎ Not saved ('+e+')'); } }; }); }
// 📷 Add bill: new task with the photo → Send to Claude to read it and create the Bills row + reminder
async function addFromPhoto(files,o){ const say=m=>o&&o.toast&&o.toast(m); if(!files||!files.length) return; if(!cfg.key()){ say('Connect Airtable first'); return; }
  const stamp=new Date().toLocaleString([], {month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
  const tr=await api(ITEMS,'',{method:'POST',body:JSON.stringify({typecast:true,fields:{Task:'💵 New bill from photo '+stamp,Status:'Open',Section:'Bills & Taxes',TextExclude:true,Source:'Claude',DoDate:today()}})});
  const t={id:tr.id,name:tr.fields.Task}; say('📷 Uploading bill…'); if(window.Photos) await Photos.add(t,files);
  const instr="Read the bill photo(s) in this item's Photos field (download the Airtable attachment URL to /tmp with curl and view it with the Read tool). Create ONE row per bill in the Airtable Bills table (tblTkFfMucX9OFnXq) with Description, Payee, Property, Parcel, BillNo, Amount, DueDate, NoPenaltyBy, Schedule (one line per pay-by step: 'YYYY-MM-DD $amount'), PayNotes (portal URL, phone, payable-to, certified-check rules), Status Unpaid, Recurs (None/Semiannual/Annual), Notes — put ≈ before any value you can't read clearly. For each bill create a reminder task in Items (Section 'Bills & Taxes', DoDate = 14 days before NoPenaltyBy or the cheapest pay-by date, RoniFlag ⭐ if that is ≤ 7 days away, TextExclude true, title '💵 Pay <description> — $<amount> by <date>') and link it (Bills.Task + TaskId). Then rename this photo item to a short summary and mark it Done (keep the photo). Never pay anything.";
  await api('tbliwVVKs3wdNRehV','',{method:'POST',body:JSON.stringify({typecast:true,records:[{fields:{Summary:'Claude → 💵 Read bill photo',ItemId:t.id,Item:[t.id],Instruction:instr,Status:'Queued',QueuedAt:new Date().toISOString()}}]})});
  say('✨ Bill sent to Claude — it will fill in 💵 Bills'); return t; }
const CSS=`.bl-row{border-top:1px solid rgba(57,199,223,.14);padding:9px 2px}.bl-row:first-child{border-top:0}
.bl-top{display:flex;gap:10px;align-items:flex-start;cursor:pointer}.bl-l{flex:1;min-width:0;display:flex;flex-direction:column}.bl-l b{font-size:14px;line-height:1.25}.bl-l span{color:#8aa6af;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bl-r{flex:none;text-align:right;display:flex;flex-direction:column}.bl-r b{font:800 15px ui-monospace,Menlo,monospace}.bl-d{font-size:11.5px;color:#8aa6af}
.bl-row.soon .bl-d{color:#e0a458;font-weight:700}.bl-row.late .bl-d{color:#e5533a;font-weight:800}.bl-row.ok{opacity:.6}.bl-row.ok .bl-d{color:#30D158}
.bl-more pre{white-space:pre-wrap;font:12.5px/1.45 ui-monospace,Menlo,monospace;color:#cfeaf1;margin:2px 0 6px;overflow-wrap:anywhere}.bl-k{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.2px;text-transform:uppercase;color:#64838d;margin-top:6px}.bl-n{color:#e0a458;font-size:12.5px;margin-top:6px}
.bl-b,.bl-pfb{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;align-items:center}.bl-btn{min-height:34px;padding:0 12px;border-radius:9px;border:1px solid rgba(57,199,223,.3);background:rgba(57,199,223,.07);color:#e7f3f6;font:700 12.5px -apple-system,system-ui,sans-serif;text-decoration:none;display:inline-flex;align-items:center;cursor:pointer}
.bl-btn.pay{background:#30D158;border-color:#30D158;color:#07141a}.bl-in{width:100%;box-sizing:border-box;margin-top:7px;height:38px;border-radius:9px;border:1px solid rgba(57,199,223,.3);background:#06161c;color:#e7f3f6;font-size:16px;padding:0 10px}
.bl-sum{font:700 11.5px ui-monospace,Menlo,monospace;color:#8aa6af;margin:0 2px 4px}.bl-sum b{color:#e0a458}`;
let cssDone=false; function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); }
function summary(){ const U=unpaid(); const soon=U.filter(b=>{ const d=daysLeft(b); return d!=null&&d<=14; }); const tot=U.reduce((s,b)=>s+(+nextDue(b).amt||0),0);
  return U.length?`${U.length} unpaid · ${money(tot)}${soon.length?' · <b>'+soon.length+' due within 14d</b>':''}`:'All paid'; }
setInterval(()=>{ if(!document.hidden) load(true); },5*60000);
window.Bills={init(c){ Object.assign(cfg,c||{}); css(); return load(true); },load,list:()=>rows,unpaid,nextDue,daysLeft,rowHTML,wire,addFromPhoto,summary,css,money,onChange(f){ subs.push(f); }};
})();
