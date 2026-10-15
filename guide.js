/* guide.js — "Open items · @Computer" step-by-step guide drawer, shared by Focus (radial.html) and iPhone (m/).
   Guide text lives in Airtable Items.Guide:
     WHY: one line
     TIME: ~3 min
     CLAUDE: yes|no
     1. step …
   One step per screen; progress per item in Items.GuideStep (+ localStorage). Step text may hold [img: url] for a screenshot.
   window.Guide = { isOpenItem, list, parse, meta, open, close, sendClaude, copies } */
(function(){
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iso=d=>{ const z=new Date(d.getTime()-d.getTimezoneOffset()*6e4); return z.toISOString().slice(0,10); };
const today=()=>iso(new Date());
const plus=n=>{ const d=new Date(); d.setDate(d.getDate()+n); return iso(d); };
const nextMon=()=>{ const d=new Date(); d.setDate(d.getDate()+((8-d.getDay())%7||7)); return iso(d); };

function isOpenItem(t){ const s=((t.sectionRemote||t.section||'')+' '+(t.project||'')).toLowerCase(); return /@computer|open items/.test(s); }
function ageDays(t){ return Math.max(0,Math.floor((Date.now()-new Date(t.createdTime||Date.now()))/864e5)); }
function overdue(t){ const d=(t.doDate||'').slice(0,10); if(!d) return 0; const n=Math.round((new Date(today()+'T12:00')-new Date(d+'T12:00'))/864e5); return n>0?n:0; }
function snoozed(t){ const d=(t.doDate||'').slice(0,10); return !!d&&d>today(); }
// open @Computer / Open Items, not snoozed; overdue first (most overdue), then oldest
function list(tasks){ return tasks.filter(t=>(!t.status||/^open$/i.test(t.status))&&isOpenItem(t)&&!snoozed(t))
  .sort((a,b)=>(overdue(b)-overdue(a))||(ageDays(b)-ageDays(a))); }

function parse(txt){ const o={why:'',time:'',claude:false,steps:[],extra:[]}; String(txt||'').split(/\n+/).forEach(l=>{ l=l.trim(); if(!l) return; let m;
    if((m=l.match(/^WHY:\s*(.*)/i))) o.why=m[1]; else if((m=l.match(/^TIME:\s*(.*)/i))) o.time=m[1]; else if((m=l.match(/^CLAUDE:\s*(.*)/i))) o.claude=/^yes/i.test(m[1]);
    else if((m=l.match(/^\d+[.)]\s*(.*)/))) o.steps.push(m[1]); else if(o.steps.length) o.steps[o.steps.length-1]+=' '+l; else o.extra.push(l); }); return o; }
function meta(t){ const g=parse(t.guide); return {time:g.time?g.time.replace(/^~?\s*/,'~').replace(/\s*min(ute)?s?$/i,'m'):'', claude:g.claude, has:!!g.steps.length, n:g.steps.length, on:g.steps.length?stepOf(t,g.steps.length):0}; }


// URLs / bare domains → links; quoted names → bold; arrows kept; [img: …] removed (shown separately)
function rich(s){ let h=esc(String(s).replace(/\[img:\s*[^\]]+\]/gi,'').trim());
  h=h.replace(/(https?:\/\/[^\s<]+[^\s<.,;)])/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  h=h.replace(/(^|[\s(])((?:[a-z0-9-]+\.)+(?:com|io|org|net)(?:\/[^\s<,;)]*[^\s<.,;)])?)/gi,(m,p,u)=>p+'<a href="https://'+u+'" target="_blank" rel="noopener">'+u+'</a>');
  h=h.replace(/&quot;([^&]{2,60}?)&quot;/g,'<b>“$1”</b>');
  h=h.replace(/→/g,'<span class="gd-ar">→</span>');
  return h; }
// exact text worth copying: what to type/search/paste/name, URLs, search operators, emails
function copies(s){ const out=[]; const add=v=>{ v=String(v||'').trim().replace(/[.,;]+$/,'').replace(/^["“]|["”]$/g,''); if(v&&v.length<=160&&!out.includes(v)) out.push(v); };
  s=String(s); let m;
  const re1=/\b(?:search bar type|tell claude|type|search(?: for)?|paste|name it)\s*:?\s*("[^"]+"|“[^”]+”|[^\s→(][^→(]*?)(?=\s*(?:→|\(|$|\. ))/gi; while((m=re1.exec(s))) add(m[1]);
  const re2=/(https?:\/\/[^\s)]+)/g; while((m=re2.exec(s))) add(m[1]);
  const re3=/\b((?:[a-z0-9-]+\.)+(?:com|io)\/[^\s,;)]+)/gi; while((m=re3.exec(s))) if(!/^https?:/.test(m[1])) add(m[1]);
  return out.filter(v=>!/^(?:the|a|an|it)$/i.test(v)); }
const imgs=s=>{ const o=[]; String(s).replace(/\[img:\s*([^\]]+)\]/gi,(m,u)=>{ o.push(u.trim()); return m; }); return o; };

const CSS=`
#gdOv{position:fixed;inset:0;z-index:2000;display:none;background:rgba(3,7,10,.72)}
#gdOv.show{display:block}
#gdOv .gd{position:absolute;top:0;right:0;bottom:0;width:min(480px,100vw);background:#0b161b;border-left:1px solid rgba(57,199,223,.35);display:flex;flex-direction:column;color:#e7f3f6;font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;box-shadow:-20px 0 50px rgba(0,0,0,.45)}
@media(max-width:700px){ #gdOv .gd{top:auto;left:0;width:100%;height:92vh;height:92dvh;border-left:0;border-top:1px solid rgba(57,199,223,.35);border-radius:20px 20px 0 0} }
#gdOv .gd-gdh{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 10px}
#gdOv .gd-gdh .gd-k{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.3px;text-transform:uppercase;color:#39c7df}
#gdOv .gd-gdh .gd-t{font-weight:700;font-size:15px;line-height:1.3;margin-top:3px;color:#cfe3e8}
#gdOv .gd-gdh .gd-x{margin-left:auto;flex:none;width:32px;height:32px;border-radius:50%;border:1px solid rgba(57,199,223,.25);background:none;color:#8aa6af;font-size:15px;cursor:pointer}
#gdOv .gd-bar{display:flex;gap:4px;padding:0 16px 4px}
#gdOv .gd-bar i{flex:1;height:4px;border-radius:2px;background:rgba(57,199,223,.15)}
#gdOv .gd-bar i.gd-d{background:#30D158} #gdOv .gd-bar i.gd-c{background:#39c7df}
#gdOv .gd-gdb{flex:1;overflow:auto;padding:14px 18px 18px;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column}
#gdOv .gd-sn{font:800 12px ui-monospace,Menlo,monospace;letter-spacing:1.6px;text-transform:uppercase;color:#39c7df;margin:6px 0 12px}
#gdOv .gd-sn span{color:#8aa6af;font-weight:600;letter-spacing:.5px;text-transform:none;margin-left:8px}
#gdOv .gd-st{font-size:24px;line-height:1.35;font-weight:600;overflow-wrap:anywhere}
@media(max-width:700px){ #gdOv .gd-st{font-size:22px} }
#gdOv .gd-st a{color:#6fd0e0}
#gdOv .gd-ar{color:#39c7df;font-weight:700}
#gdOv .gd-cp{display:flex;align-items:center;gap:8px;margin-top:14px;background:#06222b;border:1px solid rgba(57,199,223,.35);border-radius:12px;padding:8px 8px 8px 12px}
#gdOv .gd-cp code{flex:1;min-width:0;font:600 15px ui-monospace,Menlo,monospace;color:#e7f3f6;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
#gdOv .gd-cp button{flex:none;min-width:70px;height:36px;border-radius:9px;border:0;background:#39c7df;color:#07141a;font:800 12px ui-monospace,Menlo,monospace;cursor:pointer}
#gdOv .gd-shot{margin-top:14px;max-width:100%;border-radius:12px;border:1px solid rgba(57,199,223,.25)}
#gdOv .gd-why{margin-top:auto;padding-top:18px;color:#8aa6af;font-size:12.5px}
#gdOv .gd-why b{color:#39c7df;font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.2px;margin-right:6px}
#gdOv .gd-stk{margin-top:14px;display:flex;flex-direction:column;gap:8px}
#gdOv .gd-stk textarea{width:100%;box-sizing:border-box;min-height:70px;background:#06161c;border:1px solid rgba(57,199,223,.3);border-radius:10px;color:#e7f3f6;font:15px/1.4 inherit;padding:9px 11px;resize:vertical}
#gdOv .gd-msg{margin-top:14px;padding:11px 13px;border-radius:12px;background:rgba(48,209,88,.12);border:1px solid rgba(48,209,88,.4);color:#c9f5d4}
#gdOv .gd-gdf{padding:10px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(57,199,223,.16);display:flex;flex-direction:column;gap:8px}
#gdOv .gd-row{display:flex;gap:8px}
#gdOv .gd-row>button{flex:1}
#gdOv button.gd-b{min-height:46px;border-radius:12px;border:1px solid rgba(57,199,223,.25);background:rgba(57,199,223,.06);color:#e7f3f6;font:700 13px ui-monospace,Menlo,monospace;cursor:pointer}
#gdOv button.gd-b:hover{border-color:#39c7df}
#gdOv button.gd-b[disabled]{opacity:.35;cursor:default}
#gdOv button.gd-go{min-height:58px;background:#30D158;border-color:#30D158;color:#07141a;font-size:16px;font-weight:800}
#gdOv button.gd-cl{background:#39c7df;border-color:#39c7df;color:#07141a}
#gdOv button.gd-sk{color:#e0a458;border-color:rgba(224,164,88,.5)}
#gdOv .gd-mini{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
#gdOv .gd-mini button{background:none;border:0;color:#8aa6af;font:700 11px ui-monospace,Menlo,monospace;padding:6px 8px;cursor:pointer}
#gdOv .gd-mini button:hover{color:#39c7df}
#gdOv .gd-snz{display:flex;gap:6px}#gdOv .gd-snz[hidden]{display:none}#gdOv .gd-snz button{flex:1;min-height:38px}`;

let ov=null, cur=null;
function ensure(){ if(ov) return ov; const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  ov=document.createElement('div'); ov.id='gdOv'; document.body.appendChild(ov);
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
  document.addEventListener('keydown',e=>{ if(!ov.classList.contains('show')) return; if(e.key==='Escape') close();
    if(e.target&&/TEXTAREA|INPUT/.test(e.target.tagName)) return; if(e.key==='ArrowRight'||e.key==='Enter'){ const b=ov.querySelector('[data-go]'); b&&b.click(); } if(e.key==='ArrowLeft'){ const b=ov.querySelector('[data-back]'); b&&!b.disabled&&b.click(); } });
  return ov; }
function close(){ if(!ov) return; ov.classList.remove('show'); ov.innerHTML=''; cur=null; if(/#guide=/.test(location.hash)) history.replaceState(null,'',location.pathname+location.search); }
const lsK=id=>'gd.step.'+id;
function stepOf(t,n){ let k=+t.guideStep||0; try{ k=Math.max(k,+localStorage.getItem(lsK(t.id))||0); }catch(e){} return Math.min(Math.max(0,k),Math.max(0,n-1)); }
function saveStep(t,k,h){ t.guideStep=k; try{ localStorage.setItem(lsK(t.id),String(k)); }catch(e){} h.saveStep&&h.saveStep(t,k); }
async function copy(v,btn){ try{ await navigator.clipboard.writeText(v); }catch(e){ const ta=document.createElement('textarea'); ta.value=v; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(_){} ta.remove(); } if(btn){ btn.textContent='✓ Copied'; setTimeout(()=>{ if(btn.isConnected) btn.textContent='Copy'; },1400); } }

/* h = {done(t), snooze(t,iso), drop(t), edit(t), next(t)→item|null, saveStep(t,k), key(), base()} */
function open(t,h,startAt){ ensure(); cur=t; const g=parse(t.guide), N=g.steps.length;
  if(!N) return openEmpty(t,h,g);
  let k=startAt!=null?startAt:stepOf(t,N);
  const head=()=>'<div class="gd-gdh"><div style="min-width:0"><div class="gd-k">Open item · @Computer'+(g.time?' · '+esc(g.time):'')+'</div><div class="gd-t">'+esc(t.name)+'</div></div><button class="gd-x" data-x aria-label="Close">✕</button></div>'+
    '<div class="gd-bar">'+g.steps.map((_,i)=>'<i class="'+(i<k?'gd-d':i===k?'gd-c':'')+'"></i>').join('')+'</div>';
  const draw=(note)=>{ const s=g.steps[k], cps=copies(s), ims=imgs(s), last=k===N-1;
    ov.innerHTML='<div class="gd" role="dialog" aria-label="Guide">'+head()+
      '<div class="gd-gdb"><div class="gd-sn">Step '+(k+1)+' of '+N+(k===0&&overdue(t)?'<span>· overdue '+overdue(t)+'d</span>':'')+'</div>'+
        '<div class="gd-st">'+rich(s)+'</div>'+
        cps.map((v,i)=>'<div class="gd-cp"><code>'+esc(v)+'</code><button data-cp="'+i+'">Copy</button></div>').join('')+
        ims.map(u=>'<img class="gd-shot" src="'+esc(u)+'" alt="screenshot">').join('')+
        (note||'')+
        '<div data-stk></div>'+
        (k===0&&g.why?'<div class="gd-why"><b>WHY</b>'+rich(g.why)+'</div>':'')+'</div>'+
      '<div class="gd-gdf"><button class="gd-b gd-go" data-go>'+(last?'✓ Done — finish item':'✓ Done — next step ›')+'</button>'+
        '<div class="gd-row"><button class="gd-b" data-back'+(k===0?' disabled':'')+'>‹ Back</button><button class="gd-b gd-sk" data-stuck>I’m stuck</button>'+(g.claude?'<button class="gd-b gd-cl" data-cl>✨ Do it for me</button>':'')+'</div>'+
        '<div class="gd-snz" data-snzrow hidden><button class="gd-b" data-sd="1">Tomorrow</button><button class="gd-b" data-sd="3">+3 days</button><button class="gd-b" data-sd="w">Next Mon</button></div>'+
        '<div class="gd-mini"><button data-close>Pause — resume later</button><button data-snz>Snooze</button><button data-drop>Drop</button>'+(h.edit?'<button data-edit>Edit</button>':'')+'</div></div></div>';
    ov.classList.add('show');
    const q=sel=>ov.querySelector(sel);
    q('[data-x]').onclick=close; q('[data-close]').onclick=close;
    ov.querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>copy(cps[+b.dataset.cp],b));
    q('[data-go]').onclick=()=>{ if(last){ saveStep(t,0,h); finish(t,h); } else { k++; saveStep(t,k,h); draw(); q('.gd-gdb').scrollTop=0; } };
    q('[data-back]').onclick=()=>{ if(k>0){ k--; saveStep(t,k,h); draw(); } };
    q('[data-stuck]').onclick=()=>{ const box=q('[data-stk]'); if(box.innerHTML){ box.innerHTML=''; return; }
      box.innerHTML='<div class="gd-stk"><textarea data-stq placeholder="What’s confusing? (optional — e.g. I don’t see a sliders icon)"></textarea><button class="gd-b gd-sk" data-stsend>Ask Claude about step '+(k+1)+'</button></div>';
      const ta=q('[data-stq]'); setTimeout(()=>ta.focus(),30);
      q('[data-stsend]').onclick=async()=>{ const b=q('[data-stsend]'); b.disabled=true; b.textContent='Sending…';
        const instr='Roni is STUCK on step '+(k+1)+' of '+N+' of this @Computer item.\nStep: "'+s+'"'+(ta.value.trim()?'\nHis question: '+ta.value.trim():'')+'\nAnswer him with a simpler, more detailed explanation of just this step (exact clicks, what he should see). If the step itself is wrong or outdated, fix that step in the item\'s Guide field. Never send messages for him.';
        try{ await sendClaude(t,h,instr); box.innerHTML='<div class="gd-msg">Sent to Claude. The answer shows in ✨ Claude approvals / the item within ~10 min. You can pause here — this step is saved.</div>'; }catch(e){ b.disabled=false; b.textContent='Couldn’t send ('+e+') — retry'; } }; };
    const cl=q('[data-cl]'); if(cl) cl.onclick=async()=>{ cl.disabled=true; cl.textContent='Sending…';
      try{ await sendClaude(t,h,'Do this @Computer open item for Roni, following its Guide steps (he is on step '+(k+1)+' of '+N+'). Anything that sends a message/email or spends money: draft it for approval, never send.'); cl.textContent='✓ Queued'; }catch(e){ cl.disabled=false; cl.textContent='Retry ✨'; } };
    q('[data-snz]').onclick=()=>{ const r=q('[data-snzrow]'); r.hidden=!r.hidden; };
    ov.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>{ const v=b.dataset.sd; const d=v==='w'?nextMon():plus(+v); close(); h.snooze&&h.snooze(t,d); });
    q('[data-drop]').onclick=()=>{ close(); h.drop&&h.drop(t); };
    const ed=q('[data-edit]'); if(ed) ed.onclick=()=>{ close(); h.edit(t); };
  };
  draw(); }
// last step done → mark the item Done, offer the next open item
function finish(t,h){ h.done&&h.done(t); const nx=h.next?h.next(t):null; const m=nx?meta(nx):null;
  ov.innerHTML='<div class="gd" role="dialog"><div class="gd-gdh"><div><div class="gd-k">Done</div><div class="gd-t">'+esc(t.name)+'</div></div><button class="gd-x" data-x>✕</button></div>'+
    '<div class="gd-gdb"><div class="gd-st" style="font-size:26px">✓ Item done.</div>'+(nx?'<div class="gd-sn" style="margin-top:26px">Next open item</div><div class="gd-st" style="font-size:19px">'+esc(nx.name)+'</div><div class="gd-why" style="margin-top:8px;padding-top:0">'+[m.time&&('⏱ '+esc(m.time)),overdue(nx)?'overdue '+overdue(nx)+'d':'open '+ageDays(nx)+'d'].filter(Boolean).join(' · ')+'</div>':'<div class="gd-why" style="margin-top:16px">No more open items. Nice.</div>')+'</div>'+
    '<div class="gd-gdf">'+(nx?'<button class="gd-b gd-go" data-nx>Start next item ›</button>':'')+'<button class="gd-b" data-close>Close</button></div></div>';
  ov.querySelector('[data-x]').onclick=close; ov.querySelector('[data-close]').onclick=close;
  const b=ov.querySelector('[data-nx]'); if(b) b.onclick=()=>{ if(nx._open) nx._open(); else open(nx,h); }; }
function openEmpty(t,h,g){
  ov.innerHTML='<div class="gd" role="dialog"><div class="gd-gdh"><div style="min-width:0"><div class="gd-k">Open item · @Computer</div><div class="gd-t">'+esc(t.name)+'</div></div><button class="gd-x" data-x>✕</button></div>'+
    '<div class="gd-gdb"><div class="gd-st" style="font-size:19px">No step-by-step guide yet.</div>'+(t.next?'<div class="gd-why" style="margin-top:12px;padding-top:0">Next step: '+rich(t.next)+'</div>':'')+'</div>'+
    '<div class="gd-gdf"><button class="gd-b gd-cl" data-cl style="min-height:52px">✨ Ask Claude to write the steps</button><div class="gd-row"><button class="gd-b gd-go" data-done style="min-height:46px;font-size:13px">✓ Done</button><button class="gd-b" data-drop>Drop</button>'+(h.edit?'<button class="gd-b" data-edit>Edit</button>':'')+'</div></div></div>';
  ov.classList.add('show'); const q=s=>ov.querySelector(s);
  q('[data-x]').onclick=close; q('[data-done]').onclick=()=>finish(t,h); q('[data-drop]').onclick=()=>{ close(); h.drop&&h.drop(t); };
  const ed=q('[data-edit]'); if(ed) ed.onclick=()=>{ close(); h.edit(t); };
  q('[data-cl]').onclick=async()=>{ const b=q('[data-cl]'); b.disabled=true; b.textContent='Sending…';
    try{ await sendClaude(t,h,"Write a step-by-step Guide for this @Computer item and save it to the item's Guide field: WHY / TIME / CLAUDE yes|no / numbered steps, ONE short click-level instruction per step, exact text to type in quotes."); b.textContent='✓ Queued — steps appear within ~10 min'; }catch(e){ b.disabled=false; b.textContent='Retry'; } }; }
async function sendClaude(t,h,instr){ const key=h.key&&h.key(), base=(h.base&&h.base())||'appdDTNBbVrp6hVOv'; if(!key) throw 'no Airtable key';
  const r=await fetch('https://api.airtable.com/v0/'+base+'/tbliwVVKs3wdNRehV',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({typecast:true,records:[{fields:{Summary:'Claude → '+String(t.name||'').slice(0,60),ItemId:t.id,Item:[t.id],Instruction:instr,Status:'Queued',QueuedAt:new Date().toISOString()}}]})});
  if(!r.ok) throw r.status; return true; }
const hashId=()=>{ const m=location.hash.match(/guide=(rec[A-Za-z0-9]{14})/); return m?m[1]:null; };
window.Guide={isOpenItem,list,parse,meta,open,close,sendClaude,copies,ageDays,overdue,hashId,esc,stepOf};
})();
