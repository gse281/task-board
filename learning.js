/* ═══════════════════════════════════════════════════════════════════════════
   learning.js — Roni's Learning tracks, shared by the iPhone app and the desktop.
   1) Mishnah Gittin — one mishnah at a time (Hebrew, English toggle), % of the tractate, streak, learned today.
   2) Shnayim Mikra v'Echad Targum — this week's parsha, one pasuk at a time: Mikra (Hebrew) then Targum Onkelos.
      Resets when the new parsha starts; shows how many pesukim are left before Shabbat.
   Texts: Sefaria API (cached in localStorage). Progress: Airtable AppNotes row Key "learning" (syncs phone ↔ desktop).
   Needs window.TE (key(), base()) from the page — same adapter the task editor uses.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
const AN='tblfAeWMfvocVGxZk', SEF='https://www.sefaria.org/api';
const GITTIN=[6,7,8,9,9,7,9,10,10];                       // mishnayot per chapter (Sefaria shape)
const G_TOTAL=GITTIN.reduce((a,b)=>a+b,0);
const LS=k=>{ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }, SS=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const today=()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clean=s=>String(s||'').replace(/<sup[^>]*>.*?<\/sup>/g,'').replace(/<i class="footnote">.*?<\/i>/g,'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\{[פס]\}/g,'').trim();
const heNum=n=>{ const o=['','א','ב','ג','ד','ה','ו','ז','ח','ט'], t=['','י','כ','ל','מ','נ','ס','ע','פ','צ']; if(n===15) return 'טו'; if(n===16) return 'טז'; return (t[Math.floor(n/10)]||'')+(o[n%10]||''); };

let st=LS('learn.state')||{at:0,g:{ch:1,m:1,done:0},p:{name:'',ref:'',idx:0},log:{}};
const E=()=>window.TE||{key:()=>'',base:()=>''};
/* Progress sync (AppNotes "learning"). Per-track timestamps (g.at / p.at) set ONLY by Roni's own steps; defaults never carry one,
   so a fresh device / new PWA install can't overwrite real progress. Merge: newer per-track step wins; with no timestamps, furthest wins; log = per-day max.
   Nothing is written to Airtable until the first pull has merged the remote copy; every write re-reads + merges first. */
let pulled=false, pullTries=0, pushT=null, rid=null;
const say=m=>{ try{ if(typeof window.toast==='function') window.toast(m); }catch(e){} };
const gOrd=g=>{ let n=0; for(let c=1;c<(g&&g.ch||1);c++) n+=GITTIN[c-1]; return n+((g&&g.m)||1)-1; };
function pickG(a,b){ if(!a) return b; if(!b) return a; const x=a.at||0, y=b.at||0; if(x!==y) return x>y?a:b; return gOrd(a)>=gOrd(b)?Object.assign({},a,{done:Math.max(a.done||0,b.done||0)}):Object.assign({},b,{done:Math.max(a.done||0,b.done||0)}); }
function pickP(a,b){ if(!a||!a.name) return b||a; if(!b||!b.name) return a; const x=a.at||0, y=b.at||0;
  if(a.name===b.name){ if(x!==y) return x>y?a:b; return (a.idx||0)>=(b.idx||0)?a:b; } return x>=y?a:b; }
function merge(a,b){ if(!b) return a; if(!a) return b; const log={}; const la=a.log||{}, lb=b.log||{}; new Set([...Object.keys(la),...Object.keys(lb)]).forEach(d=>log[d]=Math.max(la[d]||0,lb[d]||0));
  return {at:Math.max(a.at||0,b.at||0),g:pickG(a.g,b.g),p:pickP(a.p,b.p),log}; }
const same=(a,b)=>JSON.stringify([a.g,a.p,a.log])===JSON.stringify([b.g,b.p,b.log]);
const anUrl=()=>'https://api.airtable.com/v0/'+E().base()+'/'+AN;
async function remote(){ const u=new URL(anUrl()); u.searchParams.set('filterByFormula',"{Key}='learning'"); u.searchParams.set('maxRecords','1');
  const r=await fetch(u,{headers:{Authorization:'Bearer '+E().key()}}); if(!r.ok) throw r.status; const d=await r.json(); const rec=d.records&&d.records[0]; if(!rec) return null; rid=rec.id;
  try{ return JSON.parse(rec.fields.Text||'null'); }catch(e){ return null; } }
async function write(){ const body={performUpsert:{fieldsToMergeOn:['Key']},typecast:true,records:[{fields:{Key:'learning',Text:JSON.stringify(st),Updated:new Date().toISOString()}}]};
  const r=await fetch(anUrl(),{method:'PATCH',headers:{Authorization:'Bearer '+E().key(),'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw r.status; }
async function pull(){ const k=E().key(); if(!k){ if(++pullTries<40) setTimeout(pull,1500); return; }
  try{ const x=await remote(); const m=merge(st,x); const changed=!same(m,st); st=m; SS('learn.state',st); pulled=true; if(changed) fire();
    if(!x||!same(m,x)) await write(); await ensureParsha(); }
  catch(e){ if(!pulled&&++pullTries<40) setTimeout(pull,4000); } }
function push(){ st.at=Date.now(); SS('learn.state',st); fire(); if(!pulled){ pull(); return; } clearTimeout(pushT);
  pushT=setTimeout(async()=>{ if(!E().key()) return; try{ const x=await remote(); const m=merge(st,x); if(!same(m,st)){ st=m; SS('learn.state',st); fire(); } await write(); }
    catch(e){ say('⚠︎ Learning progress not saved ('+e+') — will retry'); clearTimeout(pushT); pushT=setTimeout(push,15000); } },700); }
const touch=t=>{ st[t].at=Date.now(); };
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) pull(); });
const subs=[]; const fire=()=>subs.forEach(f=>{ try{ f(); }catch(e){} });
function logToday(n){ const d=today(); st.log[d]=Math.max(0,(st.log[d]||0)+n); for(const k of Object.keys(st.log)) if(k<isoBack(60)) delete st.log[k]; }
function isoBack(n){ const d=new Date(Date.now()-n*864e5); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function streak(){ let n=0; for(let i=(st.log[today()]?0:1);;i++){ if(st.log[isoBack(i)]>0) n++; else break; } return n; }

/* ── Mishnah Gittin ── */
const gIdx=()=>GITTIN.slice(0,st.g.ch-1).reduce((a,b)=>a+b,0)+(st.g.m-1);           // 0-based position
const gPct=()=>Math.round(Math.min(G_TOTAL,st.g.done||gIdx())/G_TOTAL*100);
const gRef=()=>'Gittin '+st.g.ch+':'+st.g.m;
async function gChapter(ch,lang){ const key='learn.gt.'+ch+'.'+lang; const c=LS(key); if(c) return c;
  const v=lang==='en'?'english':'hebrew'; const d=await fetch(SEF+'/v3/texts/Mishnah_Gittin.'+ch+'?version='+v).then(r=>r.json());
  const t=((d.versions||[])[0]||{}).text||[]; const arr=(Array.isArray(t)?t:[t]).map(clean); SS(key,arr); return arr; }
function gMove(dir){ let {ch,m}=st.g; if(dir>0){ if(m<GITTIN[ch-1]) m++; else if(ch<9){ ch++; m=1; } else return false; } else { if(m>1) m--; else if(ch>1){ ch--; m=GITTIN[ch-1]; } else return false; } st.g.ch=ch; st.g.m=m; return true; }

/* ── Parsha: Mikra + Targum Onkelos, one pasuk at a time ── */
async function parsha(){ const c=LS('learn.cal'); const d0=today(); if(c&&c.day===d0&&c.aliyot8) return c;
  const d=await fetch(SEF+'/calendars?diaspora=1&timezone=America/New_York').then(r=>r.json()); const it=(d.calendar_items||[]).find(x=>x.title&&x.title.en==='Parashat Hashavua'); if(!it) return c;
  const v={day:d0,name:it.displayValue.en,he:it.displayValue.he,ref:it.ref,url:it.url,aliyot:(it.extraDetails&&it.extraDetails.aliyot||[]).slice(0,7),aliyot8:(it.extraDetails&&it.extraDetails.aliyot)||[]}; SS('learn.cal',v); return v; }
function flatten(d){ const t=((d.versions||[])[0]||{}).text||[]; const s=d.sections||[], e=d.toSections||[]; const c0=+s[0], v0=+s[1]; const out=[];
  if(Array.isArray(t)&&Array.isArray(t[0])) t.forEach((ch,i)=>ch.forEach((x,j)=>out.push({c:c0+i,v:(i===0?v0:1)+j,t:clean(x)})));
  else (Array.isArray(t)?t:[t]).forEach((x,j)=>out.push({c:c0,v:v0+j,t:clean(x)})); return out; }
async function parshaText(cal){ const key='learn.pt.'+cal.url; const c=LS(key); if(c) return c;
  const [m,o]=await Promise.all([fetch(SEF+'/v3/texts/'+cal.url+'?version=hebrew').then(r=>r.json()),fetch(SEF+'/v3/texts/Onkelos_'+cal.url).then(r=>r.json())]);
  const M=flatten(m), O=flatten(o); const om=new Map(O.map(x=>[x.c+':'+x.v,x.t]));
  const book=(cal.ref||'').split(' ')[0]; const al=(cal.aliyot||[]).map(a=>{ const r=a.replace(book+' ','').split('-')[0].split(':'); return {c:+r[0],v:+r[1]}; });
  const verses=M.map(x=>({c:x.c,v:x.v,m:x.t,o:om.get(x.c+':'+x.v)||'',a:al.reduce((n,a,i)=>(x.c>a.c||(x.c===a.c&&x.v>=a.v))?i+1:n,1)}));
  const v={book,verses}; SS(key,v); for(const k of Object.keys(localStorage)) if(k.startsWith('learn.pt.')&&k!==key) localStorage.removeItem(k); return v; }
async function ensureParsha(){ const cal=await parsha(); if(!cal) return null; if(st.p.name!==cal.name){ if(!pulled||!st.p.name){ if(!st.p.name){ st.p={name:cal.name,ref:cal.ref,idx:0}; SS('learn.state',st); } } else { st.p={name:cal.name,ref:cal.ref,idx:0,at:Date.now()}; push(); } } return cal; }
function daysToShabbat(){ const d=new Date().getDay(); return d===6?0:6-d; }

/* ── Birkat Hamazon (Siddur Ashkenaz) · Me'ein Shalosh / Al HaMichya · Borei Nefashot — scrolling reader, cached offline.
   Additions are tagged from the siddur's own instructions; the ones that apply TODAY (Hebrew calendar) are highlighted, the rest fold away. ── */
const BH_REFS={bh:['Siddur Edot HaMizrach, Post Meal Blessing'],ms:['Siddur Edot HaMizrach, Al Hamihya'],bn:['Siddur Edot HaMizrach, Blessings on Enjoyments',11,13]};   // Nusach Edot HaMizrach
async function bhText(k){ const key='learn.bhE.'+k; const c=LS(key); if(c&&c.length) return c; const [ref,a,b]=BH_REFS[k]; const d=await fetch(SEF+'/v3/texts/'+encodeURIComponent(ref)+'?version=hebrew').then(r=>r.json());
  const t=((d.versions||[])[0]||{}).text||[]; let arr=(Array.isArray(t[0])?t.flat():(Array.isArray(t)?t:[t])).map(clean).filter(x=>x); if(a!=null) arr=arr.slice(a,b); SS(key,arr); return arr; }
function hebDate(d){ try{ const p=new Intl.DateTimeFormat('en-u-ca-hebrew',{month:'long',day:'numeric'}).formatToParts(d); return {m:(p.find(x=>x.type==='month')||{}).value||'',d:+((p.find(x=>x.type==='day')||{}).value||0)}; }catch(e){ return {m:'',d:0}; } }
function dayFlags(){ const now=new Date(); const shabbat=now.getDay()===6||(now.getDay()===5&&now.getHours()>=17); const eve=now.getHours()>=18?new Date(now.getTime()+864e5):now; const h=hebDate(eve), m=h.m, dd=h.d;
  const is=(mm,a,b)=>m.startsWith(mm)&&dd>=a&&dd<=(b||a);
  let chanukah=false; for(let i=0;i<8;i++){ const x=hebDate(new Date(eve.getTime()-i*864e5)); if(x.m.startsWith('Kislev')&&x.d===25) chanukah=true; }
  const rh=is('Tishri',1,2), sukkot=is('Tishri',15,21), yt=rh||is('Tishri',15,16)||is('Tishri',22,23)||is('Nisan',15,16)||is('Nisan',21,22)||is('Sivan',6,7);
  const cholHamoed=is('Tishri',17,21)||is('Nisan',17,20), rc=dd===1||dd===30, purim=(m==='Adar'||m==='Adar II')&&dd===14;
  return {shabbat,rc,yt,rh,sukkot,cholHamoed,chanukah,purim,heb:dd+' '+m}; }
function tagOf(instr){ const t=plainHe(instr).replace(/''/g,'"').replace(/־/g,' ');
  if(/שכחה|שכח /.test(t)) return 'forgot'; if(/חנוכה|פורים/.test(t)) return 'nissim';
  if(/יעלה ויבא|ובחול המועד|ביום טוב ובחול/.test(t)) return 'yaaleh';
  if(/ראש השנה|ר"?ה(?![א-ת])|ברה"ש|לר"ה/.test(t)) return 'rh'; if(/סוכות/.test(t)) return 'sukkot';
  if(/ראש חו?דש|ר"ח/.test(t)) return 'rc'; if(/יו"ט|יום טוב|מועדים|שלש רגלים|פסח|שבועות|שמיני עצרת/.test(t)) return 'yt';
  if(/^ב?ל?שבת|בשבת/.test(t)) return 'shabbat'; if(/בחול/.test(t)) return 'chol';
  if(/שלושה|זימון|המזמן|המסובים|וחוזר|וממשיך|מי שלא אכל|ויש המוסיפים/.test(t)) return 'zimun'; return null; }
const TAGLAB={chol:'Weekdays (Al Naharot)',shabbat:'Shabbat / Yom Tov',nissim:'Al HaNissim — Chanukah / Purim',yaaleh:"Ya'aleh v'Yavo — Rosh Chodesh / Yom Tov / Chol HaMoed",rc:'Rosh Chodesh',yt:'Yom Tov',rh:'Rosh Hashanah',sukkot:'Sukkot',forgot:'If you forgot Retzei / Ya\'aleh v\'Yavo',zimun:'Zimun (3+ who ate together)'};
function tagOn(tag,F){ return {chol:!F.shabbat&&!F.yt&&!F.rc&&!F.chanukah&&!F.purim,shabbat:F.shabbat||F.yt,nissim:F.chanukah||F.purim,yaaleh:F.rc||F.yt||F.cholHamoed,rc:F.rc,yt:F.yt,rh:F.rh,sukkot:F.sukkot,forgot:false,zimun:true}[tag]; }
const hasNikud=s=>{ const n=(s.match(/[ְ-ׇּׁׂ]/g)||[]).length, l=(s.match(/[א-ת]/g)||[]).length; return l>0&&n/l>0.45; };   // vocalized = prayer text; plain = instruction
const plainHe=s=>s.replace(/[֑-ׇ]/g,'').replace(/־/g,' ');
function bhHTML(lines,showAll,F){ let tag=null, one=null, forgot=false, out='';
  // block ends when the main blessing resumes (compared without nikud)
  const RESUME=/^(?:ועל הכל|על הכל|ובנה ירושלים|ותבנה ירושלים|רחם|הרחמן הוא יזכנו|הרחמן הוא יטע|ברוך אתה יהוה,? אלהינו מלך העולם,? (?:\(לעד\) )?האל)/;
  const cls=(t)=>{ const add=!!t&&t!=='zimun'; if(!add) return ''; return tagOn(t,F)?' on':(showAll?' dim':' off'); };
  lines.forEach(ln=>{ const pl=plainHe(ln).trim();
    if(!hasNikud(ln)){ const nt=tagOf(ln); if(/^\s*דיני שכחה/.test(pl)) forgot=true;
      if(forgot) tag='forgot';
      else if(nt&&pl.replace(/[^א-ת]/g,'').length<=10&&!/אומרים|מוסיפים|אומר$/.test(pl)) one=nt;          // short label (בשבת / בר"ח …) → applies to the next line only
      else tag=nt||((tag==='yaaleh'||tag==='nissim')?tag:null);
      const tt=one||tag; out+=`<div class="bhi${tt&&tt!=='zimun'&&tagOn(tt,F)?' on':''}${tt&&tt!=='zimun'&&!tagOn(tt,F)&&!showAll?' off':''}"${tt?` data-tag="${tt}"`:''}>${esc(ln)}${tt&&tt!=='zimun'?` <em>${esc(TAGLAB[tt]||'')}</em>`:''}</div>`; return; }
    if(tag&&!forgot&&RESUME.test(pl)) tag=null;
    // inline label at the start of a vocalized line (Edot HaMizrach style: "בשבת וּרְצֵה…", "בחנוכה אומרים בִּימֵי…")
    let it=null; const lead=(ln.match(/^[^ְ-ׇּׁׂ]*?(?=\s\S*[ְ-ּ])/)||[''])[0]; if(lead&&lead.replace(/[^א-ת]/g,'').length>=2) it=tagOf(lead);
    const t=tag==='forgot'?'forgot':(one||it||tag); one=null;
    out+=`<p class="bhl${cls(t)}">${esc(ln)}</p>`; });
  return out; }
// Birkat Hamazon section index (jump chips), ‹ › = previous / next section, swipe too, and "Where I left off" (scroll position per text, remembered).
const BH_SECS={bh:[['הזן',/^ברוך אתה יהוה.*הזן/],['נודה',/^נודה לך/],['רחם',/^רחם/],['הטוב והמטיב',/הטוב והמטיב/],['הרחמן',/^הרחמן/]],ms:[['על המחיה',/^ברוך אתה יהוה.*על/],['רחם',/^רחם/],['כי אתה',/^כי אתה/]],bn:[['בורא נפשות',/בורא נפשות/]]};
function bhNav(box,mode){ const bar=rd&&rd.querySelector('[data-secs]'); if(!bar) return; const P=[...box.querySelectorAll('.bhl,.bhi')];
  const secs=[]; (BH_SECS[mode]||[]).forEach(([lab,re])=>{ const el=P.find(x=>re.test(plainHe(x.textContent).trim())); if(el) secs.push([lab,el]); });
  const add=box.querySelector('.bhi.on')||box.querySelector('.bhi[data-tag]:not([data-tag="zimun"])'); if(add) secs.push(['תוספות',add]);
  secs.sort((a,b)=>a[1].offsetTop-b[1].offsetTop);
  bar.innerHTML=secs.map(([l],k)=>`<button class="sec" data-sec="${k}">${l}</button>`).join('');
  const go=el=>{ box.scrollTo({top:Math.max(0,el.offsetTop-box.offsetTop-8),behavior:'smooth'}); };
  const curK=()=>{ const y=box.scrollTop+box.offsetTop+20; let k=-1; secs.forEach(([,el],i)=>{ if(el.offsetTop<=y) k=i; }); return k; };
  const mark=()=>{ const k=curK(); bar.querySelectorAll('.sec').forEach((b,i)=>b.classList.toggle('on',i===k)); };
  bar.querySelectorAll('[data-sec]').forEach(b=>b.onclick=()=>go(secs[+b.dataset.sec][1]));
  const step=d=>{ const k=curK(); const t=secs[Math.max(0,Math.min(secs.length-1,k+d))]; if(t) go(t[1]); };
  const sp=rd.querySelector('[data-sp]'), sn=rd.querySelector('[data-sn]'); if(sp) sp.onclick=()=>step(-1); if(sn) sn.onclick=()=>step(1);
  const key='learn.bhpos.'+mode, saved=+LS(key)||0, rs=rd.querySelector('[data-resume]');
  if(rs){ if(saved>40) rs.onclick=()=>box.scrollTo({top:saved,behavior:'smooth'}); else { rs.disabled=true; rs.style.opacity='.4'; rs.textContent='From the top'; } }
  let t=null; box.addEventListener('scroll',()=>{ mark(); clearTimeout(t); t=setTimeout(()=>SS(key,Math.round(box.scrollTop)),400); },{passive:true}); mark();
  let x0=null,y0=0; box.addEventListener('touchstart',e=>{ if(e.touches.length>1){ x0=null; return; } x0=e.touches[0].clientX; y0=e.touches[0].clientY; },{passive:true});
  box.addEventListener('touchend',e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0; x0=null; if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.4) step(dx<0?1:-1); }); }
async function openBH(){ css(); close(); rd=document.createElement('div'); rd.className='lrd'; document.body.appendChild(rd); zoomUI(rd); let mode=LS('learn.bhmode')||'bh', all=false, opening=false; const F=dayFlags();
  const today=[F.shabbat&&'Shabbat',F.rc&&'Rosh Chodesh',F.yt&&'Yom Tov',F.cholHamoed&&'Chol HaMoed',F.chanukah&&'Chanukah',F.purim&&'Purim'].filter(Boolean);
  const draw=async()=>{ if(!rd) return; rd.innerHTML=`<div class="lrh"><b>${mode==='bh'?'Birkat Hamazon':mode==='ms'?"Me'ein Shalosh · Al HaMichya":'Borei Nefashot'} · Edot HaMizrach</b><button class="lrtog${all?' on':''}" data-all>All additions</button><button class="lrx" data-x>✕</button></div>
      <div class="lrseg"><button class="${mode==='bh'?'on':''}" data-m="bh">Birkat Hamazon</button><button class="${mode==='ms'?'on':''}" data-m="ms">Me'ein Shalosh</button><button class="${mode==='bn'?'on':''}" data-m="bn">Borei Nefashot</button></div>
      ${mode==='bh'?`<button class="lropen" data-open>${opening?'Hide opening':'Show opening (Shir HaMaalot / Zimmun)'}</button>`:''}<div class="lrpos">${esc(F.heb)}${today.length?' · today: '+today.join(', ')+' — highlighted':' · weekday'}</div><div class="lrnv" data-secs></div><div class="lrbody bh">Loading…</div>
      <div class="lrnav"><button class="bk" data-sp aria-label="Previous section">‹</button><button class="nx" data-resume style="background:rgba(20,36,42,.85);color:#eaf6fb;border-color:rgba(57,199,223,.3)">↩ Where I left off</button><button class="bk" data-sn aria-label="Next section">›</button></div>`;
    rd.querySelector('[data-x]').onclick=close; rd.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ mode=b.dataset.m; SS('learn.bhmode',mode); draw(); });
    const ab=rd.querySelector('[data-all]'); if(ab) ab.onclick=()=>{ all=!all; draw(); };
    const ob=rd.querySelector('[data-open]'); if(ob) ob.onclick=()=>{ opening=!opening; draw(); };
    try{ const L=await bhText(mode); const box=rd&&rd.querySelector('.lrbody'); if(!box) return; let LL=L; if(mode==='bh'&&!opening){ const i=L.findIndex(x=>/^ברוך אתה יהוה.*הזן/.test(plainHe(x).trim())); if(i>0) LL=L.slice(i); } box.innerHTML=bhHTML(LL,all,F);   /* starts at Birkat HaZan unless the opening is shown */
      box.querySelectorAll('.bhi.off').forEach(x=>x.onclick=()=>{ all=true; draw(); }); bhNav(box,mode); }catch(e){ const b=rd&&rd.querySelector('.lrbody'); if(b) b.textContent='Couldn’t load from Sefaria — check the connection.'; } };
  document.addEventListener('keydown',function k(e){ if(!rd){ document.removeEventListener('keydown',k); return; } if(e.key==='Escape') close(); });
  draw(); }

/* ── summaries for home rows / desktop panel ── */
function summary(){ const cal=LS('learn.cal'), pt=cal&&LS('learn.pt.'+cal.url); const n=pt?pt.verses.length:0, i=Math.min(st.p.idx||0,n);
  return { g:{pos:gRef(),pct:gPct(),done:st.g.done||gIdx(),total:G_TOTAL}, p:{name:cal?cal.name:'Parsha',he:cal?cal.he:'',pct:n?Math.round(i/n*100):0,i,n,left:n-i,pos:pt&&pt.verses[i]?('Aliyah '+pt.verses[i].a+' · pasuk '+(i+1)+' of '+n):'',shabbat:daysToShabbat()}, today:st.log[today()]||0, streak:streak() }; }
function previews(){ const out={g:'',p:'',o:''};
  const gc=LS('learn.gt.'+st.g.ch+'.he'); if(gc) out.g=gc[st.g.m-1]||''; else if(!previews._g){ previews._g=1; gChapter(st.g.ch,'he').then(()=>{ previews._g=0; fire(); }).catch(()=>{ previews._g=0; }); }
  const cal=LS('learn.cal'), pt=cal&&LS('learn.pt.'+cal.url); if(pt){ const v=pt.verses[Math.min(st.p.idx||0,pt.verses.length-1)]; if(v){ out.p=v.m; out.o=v.o; } }
  return out; }
function rowsHTML(){ css(); const S=summary(), P=previews(); const bar=p=>`<span class="lcbar"><i style="width:${p}%"></i></span>`;
  const arrows=k=>`<div class="lcar"><button class="lca" data-lstep="${k}:-1" aria-label="Back">‹</button><button class="lca" data-lstep="${k}:1" aria-label="Learned — next">›</button></div>`;
  const F=dayFlags(); const add=[F.shabbat&&'Retzei',(F.rc||F.yt||F.cholHamoed)&&"Ya'aleh v'Yavo",(F.chanukah||F.purim)&&'Al HaNissim'].filter(Boolean);
  return `<div class="lrn"><div class="lcgrid">
      <div class="lcw"><button class="lcard" data-learn="g"><span class="lct">Gittin ${st.g.ch}:${st.g.m}</span>${bar(S.g.pct)}<span class="lche">${esc(P.g)||'…'}</span><span class="lcm">${S.g.pct}% of Gittin</span></button>${arrows('g')}</div>
      <div class="lcw"><button class="lcard" data-learn="p"><span class="lct">${esc(S.p.name)} ${S.p.n?(Math.min(S.p.i+1,S.p.n))+'/'+S.p.n:''}</span>${bar(S.p.pct)}<span class="lche">${esc(P.p)||'…'}</span><span class="lcm">${S.p.pct}%${S.p.n?' · '+(S.p.shabbat?S.p.shabbat+'d to Shabbat':'Shabbat'):''}</span></button>${arrows('p')}</div>
    </div>
    <button class="lrrow bhrow" data-learn="b"><span class="lrt">Birkat Hamazon</span><span class="lrp">${add.length?'today: '+add.join(' · '):"Edot HaMizrach · Me'ein Shalosh"}</span></button>
    ${S.today||S.streak?`<div class="lrs">Learned today ${S.today}${S.streak?' · 🔥 '+S.streak+'-day streak':''}</div>`:''}</div>`; }
function wireRows(root){ root.querySelectorAll('[data-learn]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); b.dataset.learn==='b'?openBH():open(b.dataset.learn); });
  root.querySelectorAll('[data-lstep]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const [t,d]=b.dataset.lstep.split(':'); step(t,+d); if(navigator.vibrate) navigator.vibrate(6); }); }

/* ── one-at-a-time reader (full screen, large Hebrew, RTL, swipe ← next / → back) ── */
const CSS=`.lrn{display:flex;flex-direction:column;gap:6px;margin:0 0 12px}
.pga{flex:none;width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(57,199,223,.22);background:rgba(20,36,42,.6);color:#39c7df;font-size:22px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.lcgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
.lcw{position:relative;min-width:0}
.lcard{display:flex;flex-direction:column;gap:3px;width:100%;min-width:0;text-align:left;padding:6px 8px 24px;border-radius:12px;background:rgba(14,26,31,.72);border:1px solid rgba(57,199,223,.18);color:#eaf6fb;cursor:pointer;font:inherit}
.lct{font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lcbar{height:3px;border-radius:2px;background:rgba(57,199,223,.12);overflow:hidden}.lcbar i{display:block;height:100%;background:#39c7df}
.lche{direction:rtl;text-align:right;font:500 calc(20px*var(--heC,1))/1.42 "Times New Roman","SBL Hebrew",serif;color:#f4fbfe;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:2.84em}
.lcm{color:#8aa6af;font-size:10.5px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 28px}
.lcar{position:absolute;left:0;right:0;bottom:-6px;display:flex;justify-content:space-between;pointer-events:none}
.lca{pointer-events:auto;width:40px;height:44px;border:0;background:transparent;color:#39c7df;font-size:17px;font-weight:700;cursor:pointer}
.bhrow{padding:7px 12px!important}
.lrhe2{grid-column:1/-1;direction:rtl;text-align:right;font:500 calc(21px*var(--heC,1))/1.5 "Times New Roman","SBL Hebrew",serif;color:#f4fbfe;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:4px 0 2px}
.lron{grid-column:1/-1;direction:rtl;text-align:right;font:500 calc(16.5px*var(--heC,1))/1.5 "Times New Roman",serif;color:#9fdbe7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.lrw{position:relative}.lrw .lrrow{width:100%;padding-bottom:34px}
.lrar{position:absolute;left:0;right:0;bottom:-4px;display:flex;justify-content:space-between;pointer-events:none}
.lra{pointer-events:auto;width:44px;height:44px;border:0;background:transparent;color:#39c7df;font-size:20px;font-weight:700;cursor:pointer;border-radius:10px}.lra:active{background:rgba(57,199,223,.15)}
.lrrow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 10px;width:100%;text-align:left;padding:9px 12px 10px;border-radius:13px;background:rgba(14,26,31,.72);border:1px solid rgba(57,199,223,.18);color:#eaf6fb;cursor:pointer;font:inherit}
.lrt{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lrp{color:#8aa6af;font-size:12px;white-space:nowrap}
.lrbar{grid-column:1/-1;height:4px;border-radius:2px;background:rgba(57,199,223,.12);overflow:hidden}.lrbar i{display:block;height:100%;background:#39c7df;border-radius:2px}
.lrs{color:#8aa6af;font-size:12px;margin:0 4px}
.lrd{position:fixed;inset:0;z-index:9500;background:radial-gradient(130% 120% at 50% 16%,#0d1920 0%,#0a1216 55%,#05090c 100%);color:#eaf6fb;display:flex;flex-direction:column;
  padding:max(12px,env(safe-area-inset-top,0px)) 16px max(14px,env(safe-area-inset-bottom,0px));font:16px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;touch-action:pan-y}
@media(min-width:760px){ .lrd{inset:6vh 50% auto auto;transform:translateX(50%);width:720px;height:86vh;border:1px solid rgba(57,199,223,.3);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6)} }
.lrh{display:flex;align-items:center;gap:10px}.lrh b{flex:1;font:700 12px ui-monospace,Menlo,monospace;letter-spacing:2px;text-transform:uppercase;color:#39c7df}
.lrz{display:flex;gap:4px}.lrz button{height:36px;min-width:40px;border-radius:10px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#39c7df;font:700 14px -apple-system,system-ui,sans-serif;cursor:pointer}.lrz button:active{background:rgba(57,199,223,.15)}
.lrx,.lrtog{height:36px;min-width:36px;border-radius:10px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#bfe3ec;font-size:14px;cursor:pointer;padding:0 10px}
.lrtog.on{background:rgba(57,199,223,.16);color:#eaf6fb}
.lrpos{color:#8aa6af;font-size:13px;margin:8px 2px 4px}.lrpb{height:5px;border-radius:3px;background:rgba(57,199,223,.12);overflow:hidden;margin-bottom:10px}.lrpb i{display:block;height:100%;background:#39c7df}
.lrbody{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:6px 2px}
.lrhe{direction:rtl;text-align:right;font:500 calc(28px*var(--heS,1))/1.75 "Times New Roman","SBL Hebrew","Taamey Frank CLM",serif;color:#f4fbfe}
.lrtg{direction:rtl;text-align:right;font:500 calc(24px*var(--heS,1))/1.7 "Times New Roman",serif;color:#9fdbe7;margin-top:18px;padding-top:14px;border-top:1px solid rgba(57,199,223,.18)}
.lrlab{font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:1.6px;color:#64838d;text-transform:uppercase;margin:0 0 4px;direction:ltr;text-align:left}
.lren{font-size:calc(17px*min(var(--heS,1),1.4));line-height:1.55;color:#cfeaf1;margin-top:14px}
.lrbody.bh{padding-bottom:40px}.bhl{direction:rtl;text-align:right;font:500 calc(27px*var(--heS,1))/1.8 "Times New Roman","SBL Hebrew",serif;color:#f4fbfe;margin:0 0 12px}
.bhl.on{border-right:3px solid #39c7df;padding-right:10px;background:rgba(57,199,223,.06);border-radius:6px}.bhl.dim{opacity:.38}.bhl.off{display:none}
.bhi{direction:rtl;text-align:right;color:#64838d;font-size:14px;margin:16px 0 6px}.bhi.on{color:#39c7df;font-weight:700}.bhi.off{opacity:.5;cursor:pointer;font-size:12.5px}.bhi em{font-style:normal;font-size:11px;color:#64838d;margin-right:6px;direction:ltr;display:inline-block}.bhi.on em{color:#39c7df}.bhi.off::after{content:"  (tap to show)";font-size:11px}
.lropen{display:block;margin:8px 0 0;background:transparent;border:0;color:#39c7df;font-size:13px;font-weight:700;cursor:pointer;padding:6px 0}
.lrseg{display:flex;gap:4px;margin:10px 0 2px;border:1px solid rgba(57,199,223,.22);border-radius:10px;padding:3px}.lrseg button{flex:1;height:34px;border-radius:8px;border:0;background:transparent;color:#8aa6af;font-size:13px;font-weight:700;cursor:pointer}.lrseg button.on{background:rgba(57,199,223,.16);color:#eaf6fb}
.bhrow{grid-template-columns:minmax(0,1fr) auto}
.lrnav{display:flex;gap:10px;padding-top:10px}.lrnav button{height:52px;border-radius:14px;border:1px solid rgba(57,199,223,.3);background:rgba(20,36,42,.85);color:#eaf6fb;font-size:16px;font-weight:700;cursor:pointer}
.lrnav .bk{width:62px}
.lrnv{display:flex;gap:6px;align-items:center;margin:8px 0 2px;flex-wrap:wrap}
.lrnv button{height:36px;border-radius:10px;border:1px solid rgba(57,199,223,.3);background:rgba(20,36,42,.7);color:#eaf6fb;font:700 13px/1 -apple-system,system-ui,sans-serif;padding:0 10px;cursor:pointer;white-space:nowrap}
.lrnv .lrpick{flex:1;min-width:120px;font-size:15px;font-family:"Times New Roman",serif}.lrnv .home{background:#e0a458;border-color:#e0a458;color:#1a0e07}
.lrnv .sec{font-size:12px;height:32px}.lrnv .sec.on{background:#39c7df;color:#04161c;border-color:#39c7df}
.lrmap{max-height:42vh;overflow:auto;border:1px solid rgba(57,199,223,.18);border-radius:12px;padding:8px;margin:6px 0;background:rgba(10,20,26,.92);flex:none}
.lrmr{display:flex;align-items:flex-start;gap:8px;margin:5px 0;direction:rtl}.lrmr b{flex:none;width:48px;font:700 15px "Times New Roman",serif;color:#39c7df;text-align:center;cursor:pointer;padding-top:7px}
.lrcells{display:flex;flex-wrap:wrap;gap:5px;direction:rtl}
.lrc{min-width:36px;height:36px;border-radius:8px;border:1px solid rgba(57,199,223,.25);background:transparent;color:#cfeaf1;font:700 14px "Times New Roman",serif;cursor:pointer;padding:0 4px}
.lrc.w{font:700 11.5px ui-monospace,Menlo,monospace;min-width:46px;direction:ltr}
.lrc.d{background:rgba(48,209,88,.2);border-color:rgba(48,209,88,.55);color:#bff3cd}.lrc.pl{outline:2px solid #e0a458;outline-offset:1px}.lrc.v{background:#39c7df;border-color:#39c7df;color:#04161c}
.lral{display:flex;flex-wrap:wrap;gap:5px;direction:rtl;margin-bottom:8px}.lral button{height:34px;border-radius:9px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#eaf6fb;font:700 14px "Times New Roman",serif;padding:0 10px;cursor:pointer}.lral .on{background:#39c7df;color:#04161c}
.lrjump{display:flex;gap:6px;margin-top:10px}.lrjump input{flex:1;height:38px;border-radius:9px;border:1px solid rgba(57,199,223,.3);background:#06161c;color:#eaf6fb;font-size:16px;padding:0 10px}.lrjump button{height:38px;border-radius:9px;border:0;background:#39c7df;color:#04161c;font-weight:800;padding:0 16px}
.lrkey{display:flex;gap:12px;align-items:center;justify-content:center;color:#8aa6af;font-size:11.5px;margin-top:8px}.lrkey i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px;border:1px solid rgba(57,199,223,.3)}.lrkey i.d{background:rgba(48,209,88,.35)}.lrkey i.pl{outline:2px solid #e0a458}.lrkey i.v{background:#39c7df}
.lrsub{display:flex;gap:6px;justify-content:center;padding-top:4px;color:#8aa6af;font-size:12px;text-align:center}.lrsub button{background:none;border:0;color:#39c7df;font:700 12.5px -apple-system,system-ui,sans-serif;padding:8px 10px;cursor:pointer}.lrsub button[disabled]{opacity:.35;cursor:default}
.lrbrowse{color:#e0a458;font-weight:700}.lrnav .nx{flex:1;background:#39c7df;color:#04161c;border-color:#39c7df}`;
/* Hebrew size: A−/A+ in every reader + pinch on the reader text; remembered (learn.heS). Cards follow, damped (--heC). */
let heS=+LS('learn.heS')||1; const HE_MIN=0.7, HE_MAX=1.9;
function applyHe(v,save){ heS=Math.min(HE_MAX,Math.max(HE_MIN,Math.round(v*100)/100)); const r=document.documentElement.style; r.setProperty('--heS',heS); r.setProperty('--heC',Math.min(1.3,Math.max(0.85,1+(heS-1)*0.5)).toFixed(3)); if(save) SS('learn.heS',heS); }
applyHe(heS);
function zoomUI(el){ if(!el||el._zw) return; el._zw=1;
  const add=()=>{ const h=el.querySelector('.lrh'); if(h&&!h.querySelector('.lrz')){ const z=document.createElement('span'); z.className='lrz'; z.innerHTML='<button data-zm aria-label="Smaller text">A−</button><button data-zp aria-label="Larger text">A+</button>'; const x=h.querySelector('.lrx'); h.insertBefore(z,x||null);
      const step=d=>{ const b=el.querySelector('.lrbody'), f=b&&b.scrollHeight?b.scrollTop/b.scrollHeight:0; applyHe(heS+d,true); if(b) b.scrollTop=f*b.scrollHeight; };
      z.querySelector('[data-zm]').onclick=e=>{ e.stopPropagation(); step(-0.1); }; z.querySelector('[data-zp]').onclick=e=>{ e.stopPropagation(); step(0.1); }; } };
  add(); new MutationObserver(add).observe(el,{childList:true});
  let d0=0,s0=1,f0=0; const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  el.addEventListener('touchstart',e=>{ if(e.touches.length===2){ d0=dist(e.touches); s0=heS; const b=el.querySelector('.lrbody'); f0=b&&b.scrollHeight?b.scrollTop/b.scrollHeight:0; } },{passive:true});
  el.addEventListener('touchmove',e=>{ if(e.touches.length===2&&d0){ e.preventDefault(); applyHe(s0*dist(e.touches)/d0,false); const b=el.querySelector('.lrbody'); if(b) b.scrollTop=f0*b.scrollHeight; } },{passive:false});
  el.addEventListener('touchend',e=>{ if(d0&&e.touches.length<2){ d0=0; applyHe(heS,true); } },{passive:true});
  ['gesturestart','gesturechange'].forEach(ev=>el.addEventListener(ev,e=>e.preventDefault(),{passive:false})); }
function css(){ if(document.getElementById('lr-css')) return; const s=document.createElement('style'); s.id='lr-css'; s.textContent=CSS; document.head.appendChild(s); }
let rd=null;
function close(){ if(rd){ rd.remove(); rd=null; } fire(); }
/* ── Reader with navigation. VIEW (what's on screen) is separate from saved PROGRESS (st.g / st.p).
   Browsing (pickers, ‹ ›, swipe, week ‹ ›) never changes progress; only ✓, "Set as my place" and "Mark done up to here" do. ── */
const AL_HE=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שביעי','מפטיר'], GCH_HE=['א','ב','ג','ד','ה','ו','ז','ח','ט'];
const gOrdCM=(ch,m)=>GITTIN.slice(0,ch-1).reduce((a,b)=>a+b,0)+m-1;
const gDoneN=()=>Math.max(st.g.done||0,gIdx());
const calMem={}, ptMem={};
async function parshaAt(off){ if(!off) return ensureParsha(); const d=new Date(Date.now()+off*7*864e5); const k=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); if(calMem[k]) return calMem[k];
  const j=await fetch(SEF+'/calendars?diaspora=1&timezone=America/New_York&year='+d.getFullYear()+'&month='+(d.getMonth()+1)+'&day='+d.getDate()).then(r=>r.json());
  const it=(j.calendar_items||[]).find(x=>x.title&&x.title.en==='Parashat Hashavua'); if(!it) throw 'no parsha';
  return calMem[k]={day:k,name:it.displayValue.en,he:it.displayValue.he,ref:it.ref,url:it.url,aliyot:(it.extraDetails&&it.extraDetails.aliyot||[]).slice(0,7),aliyot8:(it.extraDetails&&it.extraDetails.aliyot)||[]}; }
async function ptAt(cal,off){ if(!off) return parshaText(cal); if(ptMem[cal.url]) return ptMem[cal.url];
  const [m,o]=await Promise.all([fetch(SEF+'/v3/texts/'+cal.url+'?version=hebrew').then(r=>r.json()),fetch(SEF+'/v3/texts/Onkelos_'+cal.url).then(r=>r.json())]);
  const M=flatten(m), O=flatten(o); const om=new Map(O.map(x=>[x.c+':'+x.v,x.t])); const book=(cal.ref||'').split(' ')[0];
  const al=(cal.aliyot||[]).map(a=>{ const r=a.replace(book+' ','').split('-')[0].split(':'); return {c:+r[0],v:+r[1]}; });
  return ptMem[cal.url]={book,verses:M.map(x=>({c:x.c,v:x.v,m:x.t,o:om.get(x.c+':'+x.v)||'',a:al.reduce((n,a,i)=>(x.c>a.c||(x.c===a.c&&x.v>=a.v))?i+1:n,1)}))}; }
function maftirIdx(cal,pt){ const a8=(cal.aliyot8||[])[7]; if(a8){ const r=a8.replace(pt.book+' ','').split('-')[0].split(':'); const i=pt.verses.findIndex(x=>x.c===+r[0]&&x.v===+r[1]); if(i>=0) return i; } return Math.max(0,pt.verses.length-3); }
const say2=m=>{ try{ if(typeof window.toast==='function') window.toast(m); }catch(e){} };

async function open(track){ css(); close(); rd=document.createElement('div'); rd.className='lrd'; document.body.appendChild(rd); zoomUI(rd); let en=LS('learn.en')||false;
  let vg={ch:st.g.ch,m:st.g.m}, vp={off:0,i:st.p.idx||0}, mapOpen=false, selAl=0, cal=null, pt=null, loadedOff=null;
  const gBrowsing=()=>vg.ch!==st.g.ch||vg.m!==st.g.m, pBrowsing=()=>vp.off!==0||vp.i!==(st.p.idx||0);
  const draw=async()=>{ if(!rd) return; const sc=rd.querySelector('.lrmap'), mapSc=sc?sc.scrollTop:0;
    if(track==='g'){ const {ch,m}=vg, ord=gOrdCM(ch,m), doneN=gDoneN(), placeOrd=gIdx(), br=gBrowsing();
      const map=mapOpen?'<div class="lrmap">'+GITTIN.map((n,ci)=>'<div class="lrmr"><b data-gch="'+(ci+1)+'">פרק '+GCH_HE[ci]+'</b><div class="lrcells">'+Array.from({length:n},(_,mi)=>{ const o=gOrdCM(ci+1,mi+1);
          return '<button class="lrc'+(o<doneN?' d':'')+(o===placeOrd?' pl':'')+(ci+1===ch&&mi+1===m?' v':'')+'" data-gm="'+(ci+1)+':'+(mi+1)+'">'+heNum(mi+1)+'</button>'; }).join('')+'</div></div>').join('')+'<div class="lrkey"><i class="d"></i>done <i class="pl"></i>my place <i class="v"></i>showing</div></div>':'';
      rd.innerHTML=`<div class="lrh"><b>Mishnah Gittin</b><button class="lrtog${en?' on':''}" data-en>English</button><button class="lrx" data-x>✕</button></div>
        <div class="lrnv"><button data-chp aria-label="Previous chapter">‹ פרק</button><button class="lrpick" data-map>פרק ${GCH_HE[ch-1]} · משנה ${heNum(m)} ▾</button><button data-chn aria-label="Next chapter">פרק ›</button>${br?`<button class="home" data-home>↩ My place ${st.g.ch}:${st.g.m}</button>`:''}</div>
        <div class="lrpos">${br?'<span class="lrbrowse">Browsing</span> · ':''}Gittin ${ch}:${m} · ${gPct()}% done · learned today ${st.log[today()]||0}${streak()?' · 🔥 '+streak():''}</div><div class="lrpb"><i style="width:${gPct()}%"></i></div>${map}
        <div class="lrbody"><div class="lrlab">פרק ${heNum(ch)} משנה ${heNum(m)}${ord<doneN?' · ✓':''}</div><div class="lrhe">Loading…</div></div>
        <div class="lrnav"><button class="bk" data-bk aria-label="Previous">‹</button><button class="nx" data-nx>${br?'✓ Learned this → next':'✓ Done → next'}</button><button class="bk" data-fw aria-label="Next">›</button></div>
        <div class="lrsub"><button data-setplace${br?'':' disabled'}>Set as my place</button><button data-markdone>Mark done up to here</button></div>`;
      const m2=rd.querySelector('.lrmap'); if(m2){ m2.scrollTop=mapSc; if(!mapSc){ const v=m2.querySelector('.lrc.v'); if(v) v.scrollIntoView({block:'center'}); } }
      try{ const he=await gChapter(ch,'he'); const box=rd&&rd.querySelector('.lrhe'); if(!box||vg.ch!==ch||vg.m!==m) return; box.textContent=he[m-1]||'';
        if(en){ const e2=await gChapter(ch,'en'); const b2=rd&&rd.querySelector('.lrbody'); if(b2&&vg.ch===ch&&vg.m===m) b2.insertAdjacentHTML('beforeend','<div class="lren">'+esc(e2[m-1]||'')+'</div>'); } }
      catch(e){ const b=rd&&rd.querySelector('.lrhe'); if(b) b.textContent='Couldn’t load from Sefaria — check the connection.'; } }
    else { if(!pt||loadedOff!==vp.off){ rd.innerHTML=`<div class="lrh"><b>Shnayim Mikra · Echad Targum</b><button class="lrx" data-x>✕</button></div><div class="lrnv"><button data-home>↩ This week</button></div><div class="lrpos">Loading the parsha…</div><div class="lrbody"></div>`;
        rd.querySelector('[data-x]').onclick=close; rd.querySelector('[data-home]').onclick=()=>{ vp={off:0,i:st.p.idx||0}; draw(); }; const want=vp.off;
        try{ const c2=await parshaAt(want); const p2=await ptAt(c2,want); if(want!==vp.off) return; cal=c2; pt=p2; loadedOff=want; }catch(e){ const p=rd&&rd.querySelector('.lrpos'); if(p) p.textContent='Couldn’t load from Sefaria — check the connection.'; return; } }
      if(!rd) return; const n=pt.verses.length; vp.i=Math.max(0,Math.min(vp.i,n-1)); const i=vp.i, v=pt.verses[i], cur=vp.off===0, placeI=st.p.idx||0, br=pBrowsing(), mf=maftirIdx(cal,pt);
      const alOf=k=>k>=mf&&(cal.aliyot8||[]).length>7?8:pt.verses[k].a; const pct=cur?Math.round(placeI/n*100):0; const wk=vp.off===0?'this week':vp.off===1?'next week':vp.off===-1?'last week':(vp.off>0?'in '+vp.off+' weeks':(-vp.off)+' weeks ago');
      const sa=selAl||alOf(i); const idxs=pt.verses.map((x,k)=>k).filter(k=>sa===8?k>=mf:pt.verses[k].a===sa);
      const map=mapOpen?`<div class="lrmap"><div class="lral">${AL_HE.map((h,k)=>`<button class="${sa===k+1?'on':''}" data-al="${k+1}">${h}</button>`).join('')}</div>
          <div class="lrcells">${idxs.map(k=>{ const x=pt.verses[k]; return `<button class="lrc w${cur&&k<placeI?' d':''}${cur&&k===placeI?' pl':''}${k===i?' v':''}" data-pi="${k}" title="${x.c}:${x.v}">${x.c}:${x.v}</button>`; }).join('')}</div>
          <div class="lrjump"><input type="number" inputmode="numeric" min="1" max="${n}" placeholder="Jump to pasuk # (1–${n})" data-jn><button data-jgo>Go</button></div>${cur?'<div class="lrkey"><i class="d"></i>done <i class="pl"></i>my place <i class="v"></i>showing</div>':''}</div>`:'';
      rd.innerHTML=`<div class="lrh"><b>Parashat ${esc(cal.name)} · Mikra + Targum</b><button class="lrx" data-x>✕</button></div>
        <div class="lrnv"><button data-wkp aria-label="Previous week's parsha">‹ week</button><button class="lrpick" data-map>${esc(cal.he||cal.name)} · ${AL_HE[alOf(i)-1]} ▾</button><button data-wkn aria-label="Next week's parsha">week ›</button>${br?`<button class="home" data-home>↩ My place</button>`:''}</div>
        <div class="lrpos">${vp.off?`<span class="lrbrowse">Browsing ${esc(cal.name)} (${wk})</span> · `:br?'<span class="lrbrowse">Browsing</span> · ':''}${AL_HE[alOf(i)-1]} · pasuk ${i+1} of ${n}${cur?' · '+pct+'% done · '+(n-placeI)+' left'+(daysToShabbat()?' · '+daysToShabbat()+'d to Shabbat':' · Shabbat'):''}${cur?`<div class="lrpb" style="margin-top:6px"><i style="width:${pct}%"></i></div>`:''}</div>${map}
        <div class="lrbody">${cur&&placeI>=n&&!br?'<div class="lrlab">Parsha complete ✓</div>':''}<div class="lrlab">${esc(pt.book)} ${v.c}:${v.v} · מקרא${cur&&i<placeI?' · ✓':''}</div><div class="lrhe">${esc(v.m)}</div><div class="lrtg"><div class="lrlab">תרגום אונקלוס</div>${esc(v.o)}</div></div>
        <div class="lrnav"><button class="bk" data-bk aria-label="Previous">‹</button><button class="nx" data-nx>${!cur?'› Next pasuk':br?'✓ Learned this → next':'✓ Next pasuk'}</button><button class="bk" data-fw aria-label="Next">›</button></div>
        ${cur?`<div class="lrsub"><button data-setplace${br?'':' disabled'}>Set as my place</button><button data-markdone>Mark done up to here</button></div>`:'<div class="lrsub"><span>Looking ahead/back — your progress stays on this week’s parsha.</span></div>'}`;
      const m2=rd.querySelector('.lrmap'); if(m2){ m2.scrollTop=mapSc; if(!mapSc){ const vv=m2.querySelector('.lrc.v'); if(vv) vv.scrollIntoView({block:'center'}); } } }
    wire(); };
  const view=d=>{ if(track==='g'){ let {ch,m}=vg; if(d>0){ if(m<GITTIN[ch-1]) m++; else if(ch<9){ ch++; m=1; } else return; } else { if(m>1) m--; else if(ch>1){ ch--; m=GITTIN[ch-1]; } else return; } vg={ch,m}; }
    else { const n=pt?pt.verses.length:0; const j=vp.i+d; if(j<0||j>=n) return; vp.i=j; } selAl=0; draw(); };
  const setPlace=(mark)=>{ if(track==='g'){ const o=gOrdCM(vg.ch,vg.m); if(mark){ st.g.done=o+1; let {ch,m}=vg; if(m<GITTIN[ch-1]) m++; else if(ch<9){ ch++; m=1; } st.g.ch=ch; st.g.m=m; vg={ch,m}; } else { st.g.ch=vg.ch; st.g.m=vg.m; st.g.done=o; } }
    else { if(vp.off!==0) return; const n=pt?pt.verses.length:0; if(mark){ st.p.idx=Math.min(n,vp.i+1); vp.i=Math.min(n-1,vp.i+1); } else st.p.idx=vp.i; }
    touch(track); push(); say2(mark?'✓ Marked done up to here':'📍 Set as your place'); draw(); };
  const done=()=>{ if(track==='g'){ if(gBrowsing()) return setPlace(true); const was=gIdx(); if(gMove(1)||was===G_TOTAL-1){ st.g.done=Math.max(st.g.done||0,was+1); logToday(1); touch('g'); push(); } vg={ch:st.g.ch,m:st.g.m}; }
    else { if(vp.off!==0) return view(1); if(pBrowsing()){ logToday(1); return setPlace(true); } const n=pt?pt.verses.length:0; if((st.p.idx||0)<n){ st.p.idx=(st.p.idx||0)+1; logToday(1); touch('p'); push(); } vp.i=Math.min(n-1,st.p.idx); }
    if(navigator.vibrate) navigator.vibrate(8); draw(); };
  function wire(){ if(!rd) return; const q=s=>rd.querySelector(s), on=(s,f)=>{ const b=q(s); if(b) b.onclick=f; };
    on('[data-x]',close); on('[data-en]',()=>{ en=!en; SS('learn.en',en); draw(); });
    on('[data-nx]',done); on('[data-bk]',()=>view(-1)); on('[data-fw]',()=>view(1)); on('[data-map]',()=>{ mapOpen=!mapOpen; draw(); });
    on('[data-home]',()=>{ if(track==='g') vg={ch:st.g.ch,m:st.g.m}; else vp={off:0,i:st.p.idx||0}; selAl=0; draw(); });
    on('[data-setplace]',()=>setPlace(false)); on('[data-markdone]',()=>{ if(confirm(track==='g'?'Mark everything up to Gittin '+vg.ch+':'+vg.m+' as done?':'Mark this week’s parsha done up to this pasuk?')) setPlace(true); });
    on('[data-chp]',()=>{ if(vg.ch>1){ vg={ch:vg.ch-1,m:1}; draw(); } }); on('[data-chn]',()=>{ if(vg.ch<9){ vg={ch:vg.ch+1,m:1}; draw(); } });
    on('[data-wkp]',()=>{ vp={off:vp.off-1,i:0}; selAl=0; draw(); }); on('[data-wkn]',()=>{ vp={off:vp.off+1,i:0}; selAl=0; draw(); });
    rd.querySelectorAll('[data-gm]').forEach(b=>b.onclick=()=>{ const [c,mm]=b.dataset.gm.split(':').map(Number); vg={ch:c,m:mm}; draw(); });
    rd.querySelectorAll('[data-gch]').forEach(b=>b.onclick=()=>{ vg={ch:+b.dataset.gch,m:1}; draw(); });
    rd.querySelectorAll('[data-al]').forEach(b=>b.onclick=()=>{ selAl=+b.dataset.al; const k=selAl===8?maftirIdx(cal,pt):pt.verses.findIndex(x=>x.a===selAl); if(k>=0) vp.i=k; draw(); });
    rd.querySelectorAll('[data-pi]').forEach(b=>b.onclick=()=>{ vp.i=+b.dataset.pi; draw(); });
    const jn=q('[data-jn]'), go=()=>{ const k=+jn.value; if(k>=1&&pt&&k<=pt.verses.length){ vp.i=k-1; selAl=0; draw(); } }; if(jn){ on('[data-jgo]',go); jn.onkeydown=e=>{ if(e.key==='Enter') go(); }; }
    const ps=q('.lrpos'); if(ps){ ps.style.cursor='pointer'; ps.title='Open the picker'; ps.onclick=e=>{ if(e.target.closest('button')) return; mapOpen=!mapOpen; draw(); }; } }
  let x0=null,y0=0; rd.addEventListener('touchstart',e=>{ if(e.touches.length>1||e.target.closest('.lrmap,input')){ x0=null; return; } x0=e.touches[0].clientX; y0=e.touches[0].clientY; },{passive:true});
  rd.addEventListener('touchend',e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0; x0=null; if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.4) view(dx<0?1:-1); });
  document.addEventListener('keydown',function k(e){ if(!rd){ document.removeEventListener('keydown',k); return; } if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName)) return; if(e.key==='Escape') close(); if(e.key==='ArrowLeft') view(1); if(e.key==='ArrowRight') view(-1); if(e.key==='Enter') done(); });
  draw(); }

setTimeout(pull,600); setInterval(()=>{ if(!document.hidden) pull(); },3*60000);
ensureParsha().then(cal=>cal&&parshaText(cal)).then(()=>fire()).catch(()=>{});
// step a track from outside the reader (home ‹ › arrows): › = learned → next, ‹ = back
function step(track,dir){ touch(track); if(track==='g'){ if(dir>0){ const was=gIdx(); if(gMove(1)||was===G_TOTAL-1){ st.g.done=Math.max(st.g.done||0,was+1); logToday(1); } } else gMove(-1); }
  else { const cal=LS('learn.cal'), pt=cal&&LS('learn.pt.'+cal.url); const n=pt?pt.verses.length:0; if(dir>0){ if((st.p.idx||0)<n){ st.p.idx=(st.p.idx||0)+1; logToday(1); } } else st.p.idx=Math.max(0,(st.p.idx||0)-1); }
  push(); }
window.Learning={rowsHTML,wireRows,open,openBH,close,summary,step,dayFlags,onChange:f=>subs.push(f)};
setTimeout(()=>{ ['bh','ms','bn'].forEach(k=>bhText(k).catch(()=>{})); },3000);   // cache for offline
})();
