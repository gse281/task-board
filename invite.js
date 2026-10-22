/* invite.js — 👥 Invite to the call, desktop (grid panel + Focus drawer). Same shared roster as the iPhone (Airtable CallContacts),
   same local keys as m/ (same origin): selection m.invsel.<slot>, invited stamps m.invited.<date>, dial-in m.dialin2.
   Invite / Invite group / Invite N selected open Messages with the recipients + text prefilled — Roni presses Send.
   window.Invite = { init({key,base}), load(force), mount(el,{toast}), count(slot), roster() } */
(function(){
const CC='tblLl5Wb4vJK8xGBs', ROOM='https://meetings.dialpad.com/room/rbenjamini', DIAL_DEF='917-268-3365';
const TRADES=['1oak','21 Fire Suppression','22 Plumbing','23 HVAC','26 Electrical','27 Communications','28 Fire Alarm','03 Concrete','04 Masonry','05 Metals / Steel','06 Wood / Millwork','07 Thermal & Moisture','08 Openings','09 Finishes','10 Specialties','11 Equipment','12 Furnishings','14 Conveying','31-33 Sitework','Other'];
const MEP=new Set(['21 Fire Suppression','22 Plumbing','23 HVAC','26 Electrical','27 Communications','28 Fire Alarm']);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }, SV=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
let cfg={key:()=>window.TE&&window.TE.key&&window.TE.key(), base:()=>(window.TE&&window.TE.base&&window.TE.base())||'appdDTNBbVrp6hVOv'};
let rows=LS('m.callcts',[]), at=0, busy=null, slot='all', mounts=[];
const dialIn=()=>localStorage.getItem('m.dialin2')||DIAL_DEF;
const msg=()=>'Please join the call: '+ROOM+' or dial '+dialIn()+' (no PIN)';
const digits=p=>String(p||'').replace(/[^\d+]/g,'');
const smsOne=ph=>'sms:'+digits(ph)+'&body='+encodeURIComponent(msg());
const smsMany=L=>'sms://open?addresses='+L.map(c=>digits(c.phone)).join(',')+'&body='+encodeURIComponent(msg());
function inferTrade(n){ n=String(n||'').toLowerCase(); const T=[[/1\s*oak|gustavo|sam mari|\brke\b/,'1oak'],[/sprinkler|fire supp/,'21 Fire Suppression'],[/plumb/,'22 Plumbing'],[/hvac|mechanical|\bcms\b|coil/,'23 HVAC'],[/elec/,'26 Electrical'],[/tele|low volt|cabling|\bav\b/,'27 Communications'],[/fire alarm/,'28 Fire Alarm'],[/concrete|foundation/,'03 Concrete'],[/mason|brick|stone/,'04 Masonry'],[/steel|metal|iron/,'05 Metals / Steel'],[/millwork|cabinet|carpent|wood/,'06 Wood / Millwork'],[/roof|waterproof|decoflex|insulation/,'07 Thermal & Moisture'],[/window|glass|storefront|alumtec|door/,'08 Openings'],[/drywall|tile|floor|paint|panel|finish|green global/,'09 Finishes'],[/elevator|conveying/,'14 Conveying'],[/landscap|site|excavat|paving/,'31-33 Sitework']];
  for(const [re,t] of T) if(re.test(n)) return t; return 'Other'; }
const api=(path,opt)=>fetch('https://api.airtable.com/v0/'+cfg.base()+'/'+CC+(path||''),Object.assign({headers:{Authorization:'Bearer '+cfg.key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():Promise.reject(r.status));
const flat=v=>Array.isArray(v)?v.map(x=>x&&x.name||x).join(', '):(v&&typeof v==='object'?v.name||'':String(v||''));
async function load(force){ if(!cfg.key()) return rows; if(busy) return busy; if(!force&&Date.now()-at<60000) return rows;
  busy=(async()=>{ let out=[],off,g=0; do{ const d=await api('?pageSize=100'+(off?'&offset='+off:'')); out=out.concat((d.records||[]).map(x=>({id:x.id,name:x.fields.Name||'',phone:x.fields.Phone||'',slots:x.fields.Slots||[],active:!!x.fields.Active,trade:flat(x.fields.Trade)||'',guess:!!x.fields.TradeGuess}))); off=d.offset; }while(off&&++g<10);
    const ch=JSON.stringify(out)!==JSON.stringify(rows); rows=out; at=Date.now(); SV('m.callcts',rows); if(ch) redraw(); return rows; })().catch(()=>rows).finally(()=>{ busy=null; }); return busy; }
const patch=(id,fields)=>{ if(!cfg.key()||!/^rec/.test(id)) return Promise.resolve(); return api('/'+id,{method:'PATCH',body:JSON.stringify({fields,typecast:true})}).catch(()=>{}); };
const roster=()=>rows.filter(c=>c.active);
const listFor=s=>roster().filter(c=>s==='all'||(c.slots||[]).includes(s));
function groups(L){ const g=new Map(TRADES.map(t=>[t,[]])); L.forEach(c=>{ const t=TRADES.includes(c.trade)?c.trade:'Other'; g.get(t).push(c); }); g.forEach(v=>v.sort((a,b)=>a.name.localeCompare(b.name))); return [...g.entries()].filter(([,v])=>v.length); }
const selKey=()=>'m.invsel.'+slot;
function html(){ const L=listFor(slot), sel=LS(selKey(),{}), sent=LS('m.invited.'+iso(new Date()),{}); const S=L.filter(c=>sel[c.phone]), n=S.length; const target=n?S:L;
  const big=L.length?`<a class="iv-go" href="${smsMany(target)}" data-ivgo>📣 ${n?'Invite '+n+' selected':'Invite all '+L.length}</a>`:'';
  let mep=false;
  return `<div class="iv"><div class="iv-seg">${[['morning','AM'],['afternoon','PM'],['all','All']].map(([k,l])=>`<button class="${slot===k?'on':''}" data-ivs="${k}">${l} <b>${listFor(k).length}</b></button>`).join('')}<button class="iv-add" data-ivadd title="Add someone to the roster">＋</button></div>
    <div class="iv-dial"><div><span>Dial-in · no PIN</span><b>${esc(dialIn())}</b></div><button data-ivedit>Edit</button></div>
    <div class="iv-msg">Message: “${esc(msg())}”</div>${big}
    ${L.length?`<div class="iv-selbar"><span class="${n?'':'z'}">${n?n+' of '+L.length+' selected':'Tick ☐ to pick people'}</span><button data-ivall>Select all</button><button data-ivclr${n?'':' disabled'}>Clear</button></div>`:''}
    ${groups(L).map(([t,G])=>{ const hdr=(MEP.has(t)&&!mep)?(mep=true,'<div class="iv-sup">MEP</div>'):''; const allOn=G.every(c=>sel[c.phone]);
      return hdr+`<div class="iv-trh"><span>${esc(t)}</span><b>${G.length}</b><button data-ivgsel="${esc(t)}" class="${allOn?'on':''}">${allOn?'✓ Group':'Select group'}</button><a href="${smsMany(G)}" data-ivginv="${esc(t)}">Invite group</a></div>
      <div class="iv-list">${G.map(c=>`<div class="iv-row" data-id="${c.id}"><button class="iv-cb${sel[c.phone]?' on':''}" data-ivsel="${esc(c.phone)}" aria-label="Select ${esc(c.name)}">✓</button>
        <div class="iv-who"><b>${esc(c.name)}${sent[c.id]?` <i>✓ invited ${sent[c.id]>1?new Date(sent[c.id]).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}</i>`:''}</b><span>${esc(c.phone)} · <select data-ivtr="${c.id}" title="Trade">${TRADES.map(x=>`<option${x===(c.trade||'Other')?' selected':''}>${esc(x)}</option>`).join('')}</select>${c.guess?' ≈':''}</span></div>
        <button class="iv-sl${(c.slots||[]).includes('morning')?' on':''}" data-ivflag="morning" data-fid="${c.id}">AM</button><button class="iv-sl${(c.slots||[]).includes('afternoon')?' on':''}" data-ivflag="afternoon" data-fid="${c.id}">PM</button>
        <a class="iv-one" href="${smsOne(c.phone)}" data-ivone="${c.id}">Invite</a><button class="iv-rm" data-ivrm="${c.id}" title="Remove from roster">⊘</button></div>`).join('')}</div>`; }).join('')||'<div class="iv-none">No one here yet — ＋ to add.</div>'}
    ${L.length?`<div style="margin-top:10px">${big}</div>`:''}<div class="iv-foot">Invite opens Messages with the text filled in — you press Send. Same roster as the iPhone.</div></div>`; }
function mark(ids){ const k='m.invited.'+iso(new Date()), m=LS(k,{}), now=Date.now(); ids.forEach(i=>m[i]=now); SV(k,m); setTimeout(redraw,500); }
function wire(el,o){ const say=m=>o&&o.toast&&o.toast(m); const q=s=>el.querySelectorAll(s);
  q('[data-ivs]').forEach(b=>b.onclick=()=>{ slot=b.dataset.ivs; redraw(); });
  const sel=()=>LS(selKey(),{}), put=v=>{ SV(selKey(),v); redraw(); };
  q('[data-ivsel]').forEach(b=>b.onclick=()=>{ const s=sel(), p=b.dataset.ivsel; if(s[p]) delete s[p]; else s[p]=1; put(s); });
  q('[data-ivall]').forEach(b=>b.onclick=()=>{ const s=sel(); listFor(slot).forEach(c=>s[c.phone]=1); put(s); });
  q('[data-ivclr]').forEach(b=>b.onclick=()=>put({}));
  q('[data-ivgsel]').forEach(b=>b.onclick=()=>{ const G=(groups(listFor(slot)).find(x=>x[0]===b.dataset.ivgsel)||[0,[]])[1]; const s=sel(); const on=G.every(c=>s[c.phone]); G.forEach(c=>{ if(on) delete s[c.phone]; else s[c.phone]=1; }); put(s); });
  q('[data-ivgo]').forEach(a=>a.addEventListener('click',()=>{ const L=listFor(slot), s=sel(), S=L.filter(c=>s[c.phone]); mark((S.length?S:L).map(c=>c.id)); }));
  q('[data-ivginv]').forEach(a=>a.addEventListener('click',()=>{ const G=(groups(listFor(slot)).find(x=>x[0]===a.dataset.ivginv)||[0,[]])[1]; mark(G.map(c=>c.id)); }));
  q('[data-ivone]').forEach(a=>a.addEventListener('click',()=>mark([a.dataset.ivone])));
  q('[data-ivflag]').forEach(b=>b.onclick=()=>{ const c=rows.find(x=>x.id===b.dataset.fid); if(!c) return; const f=b.dataset.ivflag; c.slots=(c.slots||[]).includes(f)?c.slots.filter(x=>x!==f):[...(c.slots||[]),f]; SV('m.callcts',rows); redraw(); patch(c.id,{Slots:c.slots}); say((c.slots.includes(f)?'Added to ':'Removed from ')+(f==='morning'?'AM':'PM')+' call'); });
  q('[data-ivtr]').forEach(s=>s.onchange=()=>{ const c=rows.find(x=>x.id===s.dataset.ivtr); if(!c) return; c.trade=s.value; c.guess=false; SV('m.callcts',rows); redraw(); patch(c.id,{Trade:c.trade,TradeGuess:false}); say('Trade: '+c.trade); });
  q('[data-ivrm]').forEach(b=>b.onclick=()=>{ const c=rows.find(x=>x.id===b.dataset.ivrm); if(!c||!confirm('Remove '+c.name+' from the invite roster? (not deleted — just inactive)')) return; c.active=false; SV('m.callcts',rows); redraw(); patch(c.id,{Active:false}); say('Removed '+c.name); });
  q('[data-ivedit]').forEach(b=>b.onclick=()=>{ const v=(prompt('Conference dial-in number',dialIn())||'').trim(); if(!v) return; localStorage.setItem('m.dialin2',v); redraw(); });
  q('[data-ivadd]').forEach(b=>b.onclick=async()=>{ const name=(prompt('Name (company helps guess the trade):')||'').trim(); if(!name) return; const ph=(prompt('Mobile number for '+name+':')||'').trim(); if(digits(ph).replace('+','').length<7) return;
    const flags=slot==='all'?['morning','afternoon']:[slot]; const k=digits(ph).slice(-10); const ex=rows.find(c=>digits(c.phone).slice(-10)===k);
    if(ex){ ex.slots=[...new Set([...(ex.slots||[]),...flags])]; ex.active=true; SV('m.callcts',rows); redraw(); patch(ex.id,{Slots:ex.slots,Active:true}); return; }
    const c={id:'tmp'+Date.now(),name,phone:ph,slots:flags,active:true,trade:inferTrade(name),guess:true}; rows.push(c); redraw();
    if(cfg.key()) try{ const d=await api('',{method:'POST',body:JSON.stringify({typecast:true,records:[{fields:{Name:name,Phone:ph,Slots:flags,Active:true,Source:'Desktop',Trade:c.trade,TradeGuess:true}}]})}); c.id=d.records[0].id; SV('m.callcts',rows); }catch(e){ say('⚠︎ Not saved ('+e+')'); } }); }
function redraw(){ mounts=mounts.filter(m=>document.body.contains(m.el)); mounts.forEach(m=>{ const sc=m.el.scrollTop; m.el.innerHTML=html(); m.el.scrollTop=sc; wire(m.el,m.o); }); }
function mount(el,o){ css(); mounts.push({el,o}); el.innerHTML=html(); wire(el,o); load(); }
const CSS=`.iv{font:13px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#e7f3f6}
.iv-seg{display:flex;gap:4px;margin-bottom:8px}.iv-seg button{flex:1;height:34px;border-radius:9px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#8aa6af;font-weight:700;cursor:pointer}.iv-seg button.on{background:rgba(57,199,223,.16);color:#e7f3f6;border-color:#39c7df}.iv-seg button b{font-size:11px;color:#8aa6af;margin-left:3px}.iv-seg .iv-add{flex:0 0 38px;color:#39c7df;font-size:16px}
.iv-dial{display:flex;align-items:center;gap:8px;border:1px solid rgba(57,199,223,.2);border-radius:10px;padding:7px 10px}.iv-dial div{flex:1;display:flex;flex-direction:column}.iv-dial span{font-size:11px;color:#8aa6af}.iv-dial b{font-size:15px}.iv-dial button{height:30px;border-radius:8px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#cfeaf1;padding:0 10px;cursor:pointer}
.iv-msg{color:#8aa6af;font-size:12px;margin:6px 2px 8px}
.iv-go{display:flex;align-items:center;justify-content:center;min-height:42px;border-radius:12px;background:linear-gradient(135deg,#45b8d0,#1f7f93);color:#07141a;font-weight:800;font-size:14.5px;text-decoration:none}
.iv-selbar{display:flex;align-items:center;gap:6px;margin:8px 2px 2px}.iv-selbar span{margin-right:auto;font-weight:800;color:#39c7df;font-size:12.5px}.iv-selbar span.z{color:#8aa6af;font-weight:600}.iv-selbar button{height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#cfeaf1;font-weight:700;cursor:pointer}.iv-selbar button[disabled]{opacity:.35}
.iv-sup{font:800 10px ui-monospace,Menlo,monospace;letter-spacing:1.4px;color:#64838d;margin:12px 2px 0}
.iv-trh{display:flex;align-items:center;gap:6px;margin:10px 2px 4px;font-weight:800;font-size:13px}.iv-trh b{color:#8aa6af;font-size:11px}.iv-trh button{margin-left:auto;font-size:11.5px;font-weight:800;color:#39c7df;background:transparent;border:1px solid rgba(57,199,223,.35);border-radius:8px;padding:4px 8px;cursor:pointer}.iv-trh button.on{background:rgba(57,199,223,.15)}.iv-trh a{font-size:11.5px;font-weight:800;color:#04161c;background:#39c7df;border-radius:8px;padding:5px 9px;text-decoration:none}
.iv-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:5px}.iv-row{display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid rgba(57,199,223,.12);border-radius:9px}
.iv-cb{flex:none;width:24px;height:24px;border-radius:6px;border:2px solid #4f7480;background:transparent;color:transparent;font-size:13px;font-weight:900;cursor:pointer;padding:0}.iv-cb.on{background:#39c7df;border-color:#39c7df;color:#07141a}
.iv-who{flex:1;min-width:0;display:flex;flex-direction:column}.iv-who b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iv-who b i{font-style:normal;font-weight:700;font-size:11px;color:#30D158}.iv-who span{font-size:11.5px;color:#8aa6af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iv-who select{background:transparent;border:0;color:#39c7df;font-size:11.5px;max-width:130px;cursor:pointer}
.iv-sl{flex:none;width:32px;height:26px;border-radius:7px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#8aa6af;font:800 10.5px ui-monospace,Menlo,monospace;cursor:pointer}.iv-sl.on{background:rgba(57,199,223,.18);color:#e7f3f6;border-color:#39c7df}
.iv-one{flex:none;height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:8px;background:#30D158;color:#07141a;font-weight:800;font-size:12px;text-decoration:none}
.iv-rm{flex:none;width:24px;height:24px;border:0;background:transparent;color:#64838d;cursor:pointer}.iv-rm:hover{color:#e5533a}
.iv-none{color:#8aa6af;padding:14px 4px}.iv-foot{color:#64838d;font-size:11.5px;margin-top:8px}`;
let cssDone=false; function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); }
window.Invite={init(c){ Object.assign(cfg,c||{}); css(); return load(true); },load,mount,roster,count:s=>listFor(s||'all').length,redraw};
})();
