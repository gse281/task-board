/* shortcuts.js — ⌨️ Shortcuts: keyboard visualizer + list, shared by Focus (index/radial) and Dashboard (dashboard/grid).
   Data: Airtable "Shortcuts" table (tblD5XnAycBjDTqzY) via tb.cfg; cached in localStorage tb.shortcuts; built-in snapshot as last resort.
   window.Shortcuts = { open(), close(), load(force) } */
(function(){
'use strict';
const TABLE='tblD5XnAycBjDTqzY';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const flat=v=>v==null?'':Array.isArray(v)?v.map(flat).join(', '):typeof v==='object'?(v.name||v.text||''):String(v);
const ls={get(k){try{return localStorage.getItem(k);}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,v);}catch(e){}}};
const cfg=()=>{try{return JSON.parse(ls.get('tb.cfg')||'{}')||{};}catch(e){return {};}};
const url=id=>'https://api.airtable.com/v0/'+(cfg().baseId||'appdDTNBbVrp6hVOv')+'/'+TABLE+(id?'/'+id:'');

// Snapshot of the Shortcuts table (10/23) — used only when there is no key and no cache.
const SNAP=[["Ctrl+Arrow","Jump by block of cells","Excel",112],["Ctrl+1…4","Switch to Desktop 1–4","macOS",200,1],["F5","Window → First Fourth","My Macros",5],["F13","Go to Messages","My Macros",12],["Ctrl+Shift+Arrow","Select to edge","Excel",111],["F15","Undo","My Macros",15],["F14","Mute Zoom","My Macros",13],["Shift+F14","Mute Teams","My Macros",14],["F16","Insert \"rmb\"","My Macros",16],["F7","Window → Bottom Half","My Macros",7],["Alt+E,S,V","Paste Special → Values","Excel",107,1],["Ctrl+Shift+Enter","Enter formula as an array","Excel",100,1],["Alt+E,S,T","Paste Special → Transpose","Excel",108],["Ctrl+[","Trace precedents","Excel",116],["F6","Window → Top Half","My Macros",6],["Cmd+F4","Window → Center Screen","My Macros",4],["F17","Copy","My Macros",17,1],["Win+M / Win+D","Minimize all / show desktop","macOS",205],["Ctrl+` (tilde)","Toggle formulas / values","Excel",102,1],["Cmd+Ctrl+Q","Lock screen","macOS",204],["Ctrl+;","Insert date (value)","Excel",114],["Ctrl+F","Format Painter (custom remap)","My Macros",20],["Cmd+Space","Spotlight search","macOS",201],["F9","Type \"000\"","My Macros",9],["Ctrl+PgUp / PgDn","Previous / next worksheet","Excel",120],["Ctrl+R / Ctrl+D","Fill right / down","Excel",123],["Alt+O,I / Alt+O,L","Increase / Decrease decimal","Excel",121],["Caps Lock+C","Open Chrome","My Macros",26],["F12","Send","My Macros",11],["Ctrl+Shift+;","Insert time (value)","Excel",115],["Caps Lock+D","Open Day One","My Macros",25],["Caps Lock+W","Open WhatsApp","My Macros",28],["Ctrl+Shift+7","Box border (outline)","Excel",110],["Cmd+Tab","Switch apps","macOS",202],["Alt+=","AutoSum","Excel",101,1],["Ctrl+* (Ctrl+Shift+8)","Select current region","Excel",113],["Caps Lock+V","Copy last screenshot to clipboard (then ⌘V)","My Macros",21,1],["Ctrl+]","Trace dependents","Excel",117],["F2","Edit cell","Excel",103,1],["Shift+Space / Ctrl+Space","Select row / column","Excel",122],["Alt+O,C,A","AutoFit column width","Excel",118],["Ctrl+Enter","Fill selection with formula/text","Excel",106],["Caps Lock+Tab","Move window to next monitor","My Macros",29],["Cmd+Shift+4","Screenshot a selection","macOS",203],["F19","Paste Values","My Macros",19,1],["Caps Lock+F","Open Finder","My Macros",22],["F1","Window → Fourth","My Macros",0],["Alt+O,H,R","Rename worksheet","Excel",119],["F4","Window → Maximize","My Macros",3,1],["F4 (not editing)","Repeat last action","Excel",105],["F18","Paste","My Macros",18,1],["Caps Lock+X","Open Excel","My Macros",27],["F8","Cut","My Macros",8],["F10","Type \"00\"","My Macros",10],["F2","Window → Left Half","My Macros",1],["Caps Lock+S","Open Superhuman","My Macros",24],["Ctrl+1","Format Cells","Excel",109,1],["F3","Window → Right Half","My Macros",2],["F4 (editing)","Toggle $ anchoring in ref","Excel",104,1],["Caps Lock+N","Open Simplenote","My Macros",23]]
  .map((r,i)=>({id:'',keys:r[0],action:r[1],cat:r[2],sort:r[3],fav:!!r[4],notes:'',source:'snapshot'}));

let shortcuts=[]; try{ shortcuts=JSON.parse(ls.get('tb.shortcuts')||'[]')||[]; }catch(e){ shortcuts=[]; }
if(!shortcuts.length) shortcuts=SNAP.slice();
const cache=()=>{ ls.set('tb.shortcuts',JSON.stringify(shortcuts)); };
function load(force){
  const c=cfg(); if(!c.apiKey) return Promise.resolve(shortcuts);
  const fresh=(Date.now()-(+ls.get('tb.shortcuts.ts')||0))<6*60*60*1000;
  if(shortcuts.length&&shortcuts[0].id&&fresh&&!force) return Promise.resolve(shortcuts);
  const out=[]; const page=off=>{ const u=new URL(url()); u.searchParams.set('pageSize','100'); if(off)u.searchParams.set('offset',off);
    return fetch(u,{headers:{Authorization:'Bearer '+c.apiKey}}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(d=>{
      (d.records||[]).forEach(r=>out.push({id:r.id,keys:flat(r.fields.Keys),action:flat(r.fields.Action),cat:flat(r.fields.Category)||'Other',notes:flat(r.fields.Notes),fav:!!r.fields.Fav,sort:+flat(r.fields.Sort)||0,source:flat(r.fields.Source)}));
      return d.offset?page(d.offset):out; }); };
  return page().then(list=>{ shortcuts=list; cache(); ls.set('tb.shortcuts.ts',String(Date.now())); return shortcuts; }).catch(()=>shortcuts);
}
function save(fields,id){ const c=cfg(); if(!c.apiKey) return Promise.resolve(null);
  return fetch(url(id),{method:id?'PATCH':'POST',headers:{Authorization:'Bearer '+c.apiKey,'Content-Type':'application/json'},
    body:JSON.stringify(id?{fields,typecast:true}:{records:[{fields}],typecast:true})}).then(r=>r.ok?r.json():null).then(d=>d?(id?d:d.records[0]):null).catch(()=>null); }
function del(id){ const c=cfg(); if(!c.apiKey||!id) return Promise.resolve(); return fetch(url(id),{method:'DELETE',headers:{Authorization:'Bearer '+c.apiKey}}).catch(()=>{}); }

// ---------- keyboard geometry (units) — Roni's desk: macropad (left) + 75% board ----------
const K=[]; const k=(id,lab,x,y,w,h,o)=>K.push(Object.assign({id,lab,x,y,w:w||1,h:h||1},o||{}));
// Macropad: 5×6 grid + knob. cap = keycap legend; bare = switch without a cap; empty = open socket.
const PX=0, MX=5.75;
const PAD=[ // [col,row,cap,send,kind,w,h] — sends read from Keychron Launcher (K0 Max RGB, Layer 0), 10/23
 [0,0,'🔊 mute','Mute','knob'],[1,0,'','F17','bare'],[2,0,'Z','F18'],[3,0,'Y','F19'],[4,0,'⌄','F8'],
 [0,1,'F1','Esc'],[1,1,'','Esc','bare'],[2,1,'','F15','bare'],[3,1,'','Shift','bare'],[4,1,'','Home','bare'],
 [0,2,'','Esc','bare'],[1,2,'','F1','bare'],[2,2,'','F6','bare'],[3,2,'','F21','bare'],[4,2,'','F16','bare',1,2],
 [0,3,'🔒','F16'],[1,3,'','F2','bare'],[2,3,'','F4','bare'],[3,3,'','F3','bare'],
 [0,4,'esc','Esc'],[1,4,'','F8','bare'],[2,4,'','F7','bare'],[3,4,'X','F19'],[4,4,'C','F17','',1,2],
 [0,5,'⇧ shift','Shift'],[1,5,'🎙','F14','',2,1],[3,5,'V','F18']];
const PAD_DEF={}; PAD.forEach(([c,r,cap,send])=>PAD_DEF['P'+c+r]=send);
PAD.forEach(([c,r,cap,send,kind,w,h])=>k('P'+c+r,cap,PX+c,r,w||1,h||1,{pad:1,kind:kind||'cap'}));
// 75% board: Keychron K3 Pro, Layer 0 as programmed in Keychron Launcher (10/23). cap = the novelty keycap legend.
// Keys that send a shifted symbol (! @ # … : ? + *) work like pad keys: they show what their combo does.
const SYM=(id,lab,send,x,y,cap)=>{ k(id,lab,x,y,1,1,{pad:1,main:1,kind:'cap',cap:cap||''}); PAD_DEF[id]=send; };
k('Esc','esc',MX,0,1,1,{cap:'🍎'}); k('F4','F4',MX+1,0,1,1,{cap:'□'}); k('F2','F2',MX+2,0,1,1,{cap:'<'}); k('F3','F3',MX+3,0,1,1,{cap:'>'}); k('F6','F6',MX+4,0,1,1,{cap:'^'}); k('F5','F5',MX+5,0,1,1,{cap:'⌄'});
[['!','1'],['@','2'],['#','3'],['$','4'],['%','5'],['&','7'],['(','9'],[')','0']].forEach(([c,d],i)=>SYM('S'+d,c,'Shift+'+d,MX+6+i,0));
k('-','-',MX+14,0,1,1,{cap:'_'}); k('=','=',MX+15,0,1,1,{cap:'–'});
let y=1; '`1234567890'.split('').forEach((c,i)=>k(c,c,MX+i,y)); k('F10','F10',MX+11,y,1,1,{cap:'△'}); k('F9','F9',MX+12,y,1,1,{cap:'○'}); k('Backspace','⌫ backspace',MX+13,y,2); k('DelFwd','del ⌦',MX+15,y);
y=2; k('Tab','⇥ tab',MX,y,1.5); 'QWERTYUIOP'.split('').forEach((c,i)=>k(c,c,MX+1.5+i,y)); SYM('SPlus','+','Shift+=',MX+11.5,y,'['); SYM('SStar','*','Shift+8',MX+12.5,y,']'); k('\\','\\',MX+13.5,y,1.5); k('F16','F16',MX+15,y,1,1,{cap:''});
y=3; k('Caps','⇪ caps',MX,y,1.75); 'ASDFGHJKL'.split('').forEach((c,i)=>k(c,c,MX+1.75+i,y)); SYM('SColon',':','Shift+;',MX+10.75,y,';'); k("'","'",MX+11.75,y); k('Return','⏎ enter',MX+12.75,y,2.25); SYM('SQ','?','Shift+/',MX+15,y,'?');
y=4; k('ShiftL','⇧ shift',MX,y,2.25); 'ZXCVBNM,./'.split('').forEach((c,i)=>k(c,c,MX+2.25+i,y)); k('ShiftR','⇧ shift',MX+12.25,y,1.75); k('Up','↑',MX+14,y); k('F12','F12',MX+15,y,1,1,{cap:'end'});
y=5; k('SShot','sshot',MX,y,1.25,1,{cap:'prtsc'}); k('AltL','⌥ opt',MX+1.25,y,1.25); k('CmdL','⌘ cmd',MX+2.5,y,1.25); k('Space','',MX+3.75,y,6.25); k('CmdR','⌘ cmd',MX+10,y); k('CtrlR','⌃ ctrl',MX+11,y); k('Fn','fn (1)',MX+12,y);
k('Left','←',MX+13,y); k('Down','↓',MX+14,y); k('Right','→',MX+15,y);
const KW=MX+16, KH0=6, VY=1.22;
const BOARD=new Set(K.filter(x=>!x.pad).map(x=>x.id));
const MODS=['Caps','Cmd','Ctrl','Alt','Shift'], GLYPH={Caps:'⇪',Cmd:'⌘',Ctrl:'⌃',Alt:'⌥',Shift:'⇧'}, MODNAME={Caps:'Caps',Cmd:'Cmd',Ctrl:'Ctrl',Alt:'Opt',Shift:'Shift'};
const MODKEYS={Caps:['Caps'],Cmd:['CmdL','CmdR'],Ctrl:['CtrlR'],Alt:['AltL'],Shift:['ShiftL','ShiftR']};
const KEYMOD={}; Object.keys(MODKEYS).forEach(m=>MODKEYS[m].forEach(id=>KEYMOD[id]=m));
const LABEL={}; K.forEach(x=>{ if(!x.pad) LABEL[x.id]=x.lab||'space'; });
const lab=id=>LABEL[id]||(/^P\d\d$/.test(id)?'Pad key':id.replace(/^Num/,'num '));

// ---------- parse "Ctrl+Shift+Enter", "Alt+E,S,V", "Ctrl+PgUp / PgDn", "Ctrl+1…4", "Caps Lock+V" ----------
const MODTOK={cmd:'Cmd',command:'Cmd','⌘':'Cmd',win:'Cmd',windows:'Cmd',super:'Cmd',meta:'Cmd',ctrl:'Ctrl',control:'Ctrl','⌃':'Ctrl',ctl:'Ctrl',alt:'Alt',opt:'Alt',option:'Alt','⌥':'Alt',shift:'Shift','⇧':'Shift',caps:'Caps','caps lock':'Caps',capslock:'Caps',hyper:'Caps','⇪':'Caps'};
const NAMED={arrow:['Up','Down','Left','Right'],arrows:['Up','Down','Left','Right'],up:['Up'],down:['Down'],left:['Left'],right:['Right'],'↑':['Up'],'↓':['Down'],'←':['Left'],'→':['Right'],
  pgup:['PgUp'],pageup:['PgUp'],'page up':['PgUp'],pgdn:['PgDn'],pagedown:['PgDn'],'page down':['PgDn'],pgdown:['PgDn'],home:['Home'],end:['End'],
  enter:['Return'],return:['Return'],'⏎':['Return'],space:['Space'],spacebar:['Space'],tab:['Tab'],esc:['Esc'],escape:['Esc'],delete:['Backspace'],backspace:['Backspace'],'⌫':['Backspace'],
  del:['DelFwd'],'fwd del':['DelFwd'],'⌦':['DelFwd'],ins:['Ins'],insert:['Ins'],fn:['Ins'],tilde:['`'],backtick:['`'],grave:['`'],plus:['=']};
const SHIFTED={'~':'`','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','_':'-','+':'=','{':'[','}':']','|':'\\',':':';','"':"'",'<':',','>':'.','?':'/'};
const BASE='`-=[]\\;\',./';
function keyTok(t,mods){
  const l=t.toLowerCase().trim(); let m;
  if((m=l.match(/^f(\d{1,2})$/))) return ['F'+m[1]];
  if((m=l.match(/^(\d)\s*(?:…|\.\.\.|–|-|to)\s*(\d)$/))){ const a=+m[1],b=+m[2],o=[]; for(let i=Math.min(a,b);i<=Math.max(a,b);i++)o.push(String(i)); return o; }
  if(NAMED[l]) return NAMED[l].slice();
  if(l.length===1){ if(/[a-z]/.test(l)) return [l.toUpperCase()]; if(/\d/.test(l)) return [l]; if(BASE.includes(l)) return [l]; if(SHIFTED[l]){ if(l!=='+') mods.add('Shift'); return [SHIFTED[l]]; } }
  return [];
}
function parse(str){
  let s=String(str||''); const qual=((s.match(/\(([^)]*)\)/)||[])[1]||'').trim();
  s=s.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
  const out=[]; let prev=null;
  s.split(/\s+\/\s+|\s+or\s+/i).forEach(alt=>{
    alt=alt.trim(); if(!alt) return;
    let first=alt, seq='';
    if(!/\+,$/.test(alt)&&alt.includes(',')){ const p=alt.split(','); first=p[0].trim(); seq=p.slice(1).map(x=>x.trim()).filter(Boolean).join(', '); }
    let toks=first.split('+').map(x=>x.trim());
    if(/\+\+$/.test(first)){ toks=toks.filter(Boolean); toks.push('plus'); } else toks=toks.filter(Boolean);
    if(/\+,$/.test(alt)) toks.push(',');
    const mods=new Set(), keys=[];
    toks.forEach(t=>{ const mt=MODTOK[t.toLowerCase()]; if(mt) mods.add(mt); else keyTok(t,mods).forEach(x=>keys.push(x)); });
    if(!mods.size&&prev&&prev.size&&keys.length) prev.forEach(x=>mods.add(x));
    prev=mods;
    if(!keys.length&&mods.size===1&&mods.has('Caps')) return;
    out.push({mods,keys,seq,qual});
  });
  return out;
}
const layerOf=mods=>MODS.filter(m=>mods.has(m)).join('+');
const glyphs=mods=>MODS.filter(m=>mods.has(m)).map(m=>GLYPH[m]).join('');

// ---------- state ----------
let st={tab:'kb',mode:'all',mods:[],cats:[],sel:''}; try{ Object.assign(st,JSON.parse(ls.get('tb.scx')||'{}')); }catch(e){}
if(!st.pad||typeof st.pad!=='object') st.pad={};
const keep=()=>ls.set('tb.scx',JSON.stringify({tab:st.tab,mode:st.mode,mods:st.mods,cats:st.cats,pad:st.pad}));
const padSendStr=id=>(id in st.pad)?st.pad[id]:(PAD_DEF[id]||'');
const padGuess=id=>false;
function padSend(id){ const str=padSendStr(id); if(!str) return null; const p=parse(str)[0]; if(!p) { const m=MODTOK[str.toLowerCase()]; return m?{mods:new Set([m]),key:'',mod:m}:null; }
  if(!p.keys.length){ const ms=[...p.mods]; return ms.length===1?{mods:p.mods,key:'',mod:ms[0]}:null; }
  return {mods:p.mods,key:p.keys[0],mod:''}; }
const CATCOL={'My Macros':'#39c7df','Excel':'#3fb27f','macOS':'#e2b04a','Other':'#b58cf0'};
const EXTRA=['#e8683c','#6aa6ff','#e07bb5','#a3c24a'];
function catColor(c){ if(CATCOL[c]) return CATCOL[c]; const cats=allCats(); const i=cats.filter(x=>!CATCOL[x]).indexOf(c); return EXTRA[(i<0?0:i)%EXTRA.length]; }
function allCats(){ const order=['My Macros','Excel','macOS']; const s=[...new Set(shortcuts.map(x=>x.cat||'Other'))]; return s.sort((a,b)=>((order.indexOf(a)+1||99)-(order.indexOf(b)+1||99))||a.localeCompare(b)); }

// ---------- styles ----------
const CSS=`
.scx-bd{position:fixed;inset:0;z-index:9500;background:rgba(3,6,8,.72);display:flex;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px 10px}
.scx{--b:#0c1419;--p:#111c22;--p2:#16252d;--ln:rgba(140,190,205,.16);--ink:#eaf2f4;--dim:#87a0a8;--ac:#39c7df;
  width:min(1560px,98vw);height:min(940px,96vh);display:flex;flex-direction:column;background:var(--b);color:var(--ink);border:1px solid var(--ln);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);
  font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;color-scheme:dark}
.scx *{box-sizing:border-box}
.scx button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.scx button:focus-visible,.scx input:focus-visible{outline:2px solid var(--ac);outline-offset:1px}
.scx-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--ln)}
.scx-ttl{font:800 13px ui-monospace,Menlo,monospace;letter-spacing:2px;text-transform:uppercase;color:var(--ac);white-space:nowrap}
.scx-tabs{display:flex;border:1px solid var(--ln);border-radius:999px;padding:2px}
.scx-tabs button{padding:5px 13px;border-radius:999px;font:700 11px ui-monospace,Menlo,monospace;letter-spacing:1px;color:var(--dim)}
.scx-tabs button.on{background:var(--ac);color:#04131a}
.scx-q{flex:1;min-width:160px;background:var(--p2);border:1px solid var(--ln);border-radius:9px;padding:7px 11px;color:var(--ink);font:inherit}
.scx-btn{border:1px solid var(--ln)!important;border-radius:999px;padding:6px 13px;font:700 11px ui-monospace,Menlo,monospace!important;letter-spacing:1px;color:var(--dim)!important;white-space:nowrap}
.scx-btn:hover{color:var(--ac)!important;border-color:var(--ac)!important}
.scx-btn.go{background:var(--ac)!important;color:#04131a!important;border-color:var(--ac)!important}
.scx-x{font-size:20px!important;line-height:1;color:var(--dim)!important;padding:2px 8px!important}
.scx-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid var(--ln)}
.scx-bar .lbl{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.5px;color:var(--dim);text-transform:uppercase;margin-right:2px}
.scx-chip{border:1px solid var(--ln);border-radius:999px;padding:4px 10px;font:700 11px ui-monospace,Menlo,monospace;color:var(--dim);white-space:nowrap}
.scx-chip:hover{color:var(--ink)}
.scx-chip.on{color:#04131a;background:var(--ac);border-color:var(--ac)}
.scx-chip .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:0}
.scx-chip.cat.off{opacity:.4}
.scx-sep{width:1px;height:20px;background:var(--ln);margin:0 6px}
.scx-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto}
.scx-kbw{flex:none;padding:14px 16px 6px;overflow-x:auto}
.scx-kb{position:relative;margin:0 auto}
.scx-k{position:absolute;border-radius:7px;background:linear-gradient(#1a2a33,#132027);border:1px solid rgba(160,205,220,.14);border-bottom-width:3px;
  display:flex;flex-direction:column;align-items:flex-start;padding:.28em .4em;overflow:hidden;text-align:left;cursor:pointer;transition:transform .06s,box-shadow .12s,opacity .12s}
.scx-k:hover{border-color:rgba(160,205,220,.4)}
.scx-k .lg{font:600 .95em ui-monospace,Menlo,monospace;color:var(--dim);white-space:nowrap;line-height:1.1}
.scx-k .bl{margin-top:auto;width:100%;display:flex;flex-direction:column;gap:1px;min-height:0;overflow:hidden}
.scx-k .b{font-size:.92em;line-height:1.15;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.scx-k .b i{font-style:normal;color:var(--kc);font-weight:700;margin-right:2px}
.scx-k .more{font:700 .8em ui-monospace,Menlo,monospace;color:var(--dim)}
.scx-k.has{background:linear-gradient(color-mix(in srgb,var(--kc) 26%,#152229),color-mix(in srgb,var(--kc) 14%,#0f1a20));border-color:color-mix(in srgb,var(--kc) 55%,transparent)}
.scx-k.has .lg{color:color-mix(in srgb,var(--kc) 70%,#fff)}
.scx-k .cs{position:absolute;top:.35em;right:.35em;display:flex;gap:2px}
.scx-k .cs span{width:.55em;height:.55em;border-radius:50%}
.scx-k.mod{background:linear-gradient(#202d34,#18242a)}
.scx-k.mod .lg{color:var(--ink);font-weight:700}
.scx-k.mod.on{background:var(--ac);border-color:var(--ac)}.scx-k.mod.on .lg{color:#04131a}
.scx-k.dim{opacity:.22}
.scx-k.sel{box-shadow:0 0 0 2px #fff,0 0 22px rgba(57,199,223,.5);z-index:2}
.scx-k.press{transform:translateY(2px);box-shadow:0 0 0 2px var(--ac),0 0 26px rgba(57,199,223,.7)}
.scx-padbg,.scx-kbbg{position:absolute;border-radius:14px}
.scx-padbg{background:#07090b;border:1px solid #1f262b}
.scx-kbbg{background:rgba(220,235,240,.035);border:1px solid rgba(160,205,220,.10)}
.scx-k .cap{position:absolute;top:.3em;right:.45em;font-size:.95em;color:var(--dim);opacity:.75}
.scx-k.pad .lg{display:flex;gap:.4em;align-items:baseline;width:100%}
.scx-k .snd{margin-left:auto;font:700 .82em ui-monospace,Menlo,monospace;color:var(--ac);background:rgba(57,199,223,.12);border-radius:4px;padding:0 .3em}
.scx-k .snd.g{color:#e2b04a;background:rgba(226,176,74,.12)}
.scx-k.bare{background:radial-gradient(circle at 50% 50%,rgba(200,40,40,.45) 0 22%,#120c0c 24%);border-color:#2a1515;opacity:.55}
.scx-k.bare.has{opacity:1;background:linear-gradient(color-mix(in srgb,var(--kc) 22%,#151010),color-mix(in srgb,var(--kc) 10%,#0f0b0b));border-color:rgba(200,60,60,.45)}
.scx-k.bare:hover{opacity:.9}
.scx-sock{position:absolute;border-radius:7px;border:1px dashed rgba(160,205,220,.12)}
.scx-k.knob{border-radius:50%!important;background:radial-gradient(circle at 40% 35%,#3a4247,#0c0f11 70%)!important;align-items:center;justify-content:center}
.scx-knob{position:absolute;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3a4247,#0c0f11 70%);border:1px solid #2b3338;box-shadow:inset 0 -3px 6px rgba(0,0,0,.6)}
.scx-xl{position:absolute;display:flex;align-items:center;justify-content:flex-end;padding-right:.8em;font:700 .9em ui-monospace,Menlo,monospace;color:var(--dim);letter-spacing:1px}
.scx-k.xk{border-style:dashed}
.scx-padset{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 10px}
.scx-padset input{background:var(--p2);border:1px solid var(--ln);border-radius:8px;padding:6px 10px;color:var(--ink);font:600 13px ui-monospace,Menlo,monospace;width:220px}
.scx-padset .rec.on{color:#04131a!important;background:#e8683c!important;border-color:#e8683c!important}
.scx-hint{text-align:center;font:600 11px ui-monospace,Menlo,monospace;color:var(--dim);padding:2px 16px 10px}
.scx-det{flex:1;min-height:150px;margin:0 16px 16px;border:1px solid var(--ln);border-radius:12px;background:var(--p);padding:12px 14px}
.scx-det h4{margin:0 0 8px;font:800 12px ui-monospace,Menlo,monospace;letter-spacing:1.5px;text-transform:uppercase;color:var(--ac)}
.scx-det .e{color:var(--dim);font:600 12px ui-monospace,Menlo,monospace}
.scx-row{display:grid;grid-template-columns:minmax(150px,max-content) 1fr auto auto auto;gap:10px;align-items:center;padding:6px 2px;border-bottom:1px solid var(--ln)}
.scx-row:last-child{border-bottom:0}
.scx-row .ks{display:flex;gap:3px;flex-wrap:wrap;align-items:center}
.scx-row .ac{min-width:0}
.scx-row .nt{color:var(--dim);font-size:12px}
.scx-row .ct{font:700 10px ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:999px;border:1px solid;white-space:nowrap}
.scx-row .ib{color:var(--dim);font-size:15px;padding:2px 6px;border-radius:6px}
.scx-row .ib:hover{color:var(--ink);background:var(--p2)}
.scx kbd{display:inline-block;background:var(--p2);border:1px solid var(--ln);border-bottom-width:2px;border-radius:6px;padding:1px 7px;font:600 12px ui-monospace,Menlo,monospace;color:var(--ink);white-space:nowrap;line-height:1.5}
.scx .kp{color:var(--dim);font-size:11px}
.scx-list{padding:12px 16px 18px;columns:3 400px;column-gap:22px}
.scx-grp{break-inside:avoid;margin-bottom:16px;border:1px solid var(--ln);border-radius:12px;background:var(--p);padding:8px 12px}
.scx-grp h5{margin:4px 0 4px;font:800 11px ui-monospace,Menlo,monospace;letter-spacing:1.5px;text-transform:uppercase}
.scx-grp .scx-row{grid-template-columns:minmax(110px,max-content) 1fr auto auto auto;gap:8px}
.scx-empty{color:var(--dim);font:600 12px ui-monospace,Menlo,monospace;padding:24px;text-align:center}
.scx-ed{padding:16px;max-width:620px;margin:0 auto;width:100%}
.scx-ed h4{margin:0 0 10px;font:800 12px ui-monospace,Menlo,monospace;letter-spacing:1.5px;text-transform:uppercase;color:var(--ac)}
.scx-ed label{display:block;font:700 10px ui-monospace,Menlo,monospace;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim);margin:10px 0 4px}
.scx-ed input{width:100%;background:var(--p2);border:1px solid var(--ln);border-radius:8px;padding:8px 10px;color:var(--ink);font:inherit}
.scx-ed .prev{margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;min-height:24px}
.scx-ed .acts{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.scx-ed .acts .sp{flex:1}
.scx-ed .del{color:#e8683c!important;border-color:rgba(232,104,60,.5)!important}
.scx-ed .rec{margin-left:6px}
.scx-ed .rec.on{color:#04131a!important;background:#e8683c!important;border-color:#e8683c!important}
.scx-note{font:600 11px ui-monospace,Menlo,monospace;color:var(--dim);margin-left:auto}
@media (max-width:700px){.scx{height:96vh;border-radius:12px}.scx-row{grid-template-columns:1fr auto auto}.scx-row .ks{grid-column:1/-1}.scx-row .ct{display:none}}
`;
function injectCSS(){ if(document.getElementById('scx-css')) return; const s=document.createElement('style'); s.id='scx-css'; s.textContent=CSS; document.head.appendChild(s); }

const kbdHTML=keys=>String(keys||'').split(/\s+\/\s+/).map(alt=>esc(alt).split('+').map(x=>x.trim()).filter(Boolean).map(x=>'<kbd>'+x+'</kbd>').join('<span class="kp">+</span>')).join(' <span class="kp">/</span> ');

// ---------- modal ----------
let root=null, padRec='', held=new Set(), pressed='', onKey=null, onKeyUp=null, onRes=null;
function close(){ if(!root) return; root.remove(); root=null; removeEventListener('keydown',onKey,true); removeEventListener('keyup',onKeyUp,true); removeEventListener('resize',onRes); removeEventListener('blur',clearHeld); }
function clearHeld(){ if(held.size){ held.clear(); if(root&&st.tab==='kb') drawKB(); } }

function index(){
  // key id -> [{s, mods, layer, seq, qual}]
  const map={}; const q=(root&&root.querySelector('.scx-q').value||'').trim().toLowerCase();
  shortcuts.forEach(s=>{
    if(st.cats.length&&!st.cats.includes(s.cat||'Other')) return;
    const hit=!q||[s.keys,s.action,s.cat,s.notes].join(' ').toLowerCase().includes(q);
    parse(s.keys).forEach(p=>p.keys.forEach(id=>{ (map[id]=map[id]||[]).push({s,mods:p.mods,layer:layerOf(p.mods),seq:p.seq,qual:p.qual,hit}); }));
  });
  return {map,q};
}
function viewLayer(){ if(held.size) return MODS.filter(m=>held.has(m)).join('+'); return st.mode==='exact'?MODS.filter(m=>st.mods.includes(m)).join('+'):null; }

function bindingsFor(key,map,L,q){
  // returns {bs, mod, send}
  if(key.pad){
    if(key.kind==='empty') return {bs:[],mod:'',send:null};
    const sd=padSend(key.id); if(!sd) return {bs:[],mod:'',send:null};
    if(sd.mod) return {bs:[],mod:sd.mod,send:sd};
    const want=L===null?layerOf(sd.mods):layerOf(new Set([...sd.mods,...(L?L.split('+'):[])]));
    let bs=(map[sd.key]||[]).filter(b=>b.layer===want); if(q) bs=bs.filter(b=>b.hit);
    return {bs,mod:'',send:sd};
  }
  let bs=map[key.id]||[]; if(L!==null) bs=bs.filter(b=>b.layer===L); if(q) bs=bs.filter(b=>b.hit);
  return {bs,mod:KEYMOD[key.id]||'',send:null};
}
function sendLabel(sd){ return sd?(glyphs(sd.mods)+(sd.key?lab(sd.key):'')).trim():''; }
function drawKB(){
  const body=root.querySelector('.scx-body');
  if(!body.querySelector('.scx-kb')) body.innerHTML='<div class="scx-kbw"><div class="scx-kb"></div></div><div class="scx-hint">Hold ⌘ ⌃ ⌥ ⇧ (or Caps Lock = ⇪ hyper) to see that layer · click a key for details · click a pad key to set what it sends · press any key to find it</div><div class="scx-det"></div>';
  const wrap=body.querySelector('.scx-kbw'), kb=body.querySelector('.scx-kb');
  const {map,q}=index(), L=viewLayer();
  // keys with shortcuts that aren't on the board or sent by a pad key
  const padKeys=new Set(K.filter(x=>x.pad).map(x=>{ const sd=padSend(x.id); return sd&&sd.key; }).filter(Boolean));
  const extra=Object.keys(map).filter(id=>!BOARD.has(id)&&!padKeys.has(id)).sort((a,b)=>(+a.slice(1)||0)-(+b.slice(1)||0)||a.localeCompare(b));
  const keys=K.concat(extra.map((id,i)=>({id,lab:lab(id),x:MX+i*1.1,y:KH0+0.35,w:1,h:1,extra:1})));
  const KH=KH0+(extra.length?1.35:0);
  const avail=wrap.clientWidth-32, u=Math.max(36,Math.min(80,avail/KW)), gap=Math.max(3,u*.07);
  kb.style.width=(KW*u)+'px'; kb.style.height=(KH*u*VY)+'px'; kb.style.fontSize=Math.max(8.5,u*.165)+'px';
  const activeMods=held.size?[...held]:(st.mode==='exact'?st.mods:[]);
  let h='<div class="scx-padbg" style="left:'+(-0.18*u)+'px;top:'+(-0.18*u*VY)+'px;width:'+(5.36*u-gap)+'px;height:'+((KH0+0.36)*u*VY-gap)+'px"></div>'+
        '<div class="scx-kbbg" style="left:'+((MX-0.18)*u)+'px;top:'+(-0.18*u*VY)+'px;width:'+(16.36*u-gap)+'px;height:'+((KH0+0.36)*u*VY-gap)+'px"></div>';
  if(extra.length) h+='<div class="scx-xl" style="left:'+(0)+'px;top:'+((KH0+0.35)*u*VY)+'px;width:'+(5*u)+'px;height:'+(u*VY-gap)+'px">not on your board ›</div>';
  keys.forEach(key=>{
    const pos='left:'+(key.x*u)+'px;top:'+(key.y*u*VY)+'px;width:'+(key.w*u-gap)+'px;height:'+(key.h*u*VY-gap)+'px';
    if(key.kind==='empty'){ h+='<div class="scx-sock" style="'+pos+'"></div>'; return; }
    
    const {bs,mod,send}=bindingsFor(key,map,L,q);
    const cats=[...new Set(bs.map(b=>b.s.cat||'Other'))];
    const kc=cats.length?catColor(cats[0]):'#39c7df';
    const cls=['scx-k']; if(key.pad) cls.push('pad'); if(key.kind==='bare') cls.push('bare'); if(key.kind==='knob') cls.push('knob'); if(key.extra) cls.push('xk');
    if(mod){cls.push('mod'); if(activeMods.includes(mod)) cls.push('on');}
    if(bs.length) cls.push('has'); else if(!mod&&(q||L!==null||key.kind==='bare')) cls.push('dim');
    if(st.sel===key.id) cls.push('sel');
    if(pressed&&(pressed===key.id||(send&&!send.mods.size&&send.key===pressed))) cls.push('press');
    const max=key.h>1?5:(key.w>=2?3:2);
    const lines=bs.slice(0,max).map(b=>'<div class="b" style="--kc:'+catColor(b.s.cat||'Other')+'">'+(L===null&&b.layer&&!key.pad?'<i>'+glyphs(b.mods)+'</i>':'')+esc(b.s.action)+(b.qual?' <span style="color:var(--dim)">('+esc(b.qual)+')</span>':'')+'</div>').join('');
    const top=key.pad?(esc(key.lab)+(send?'<span class="snd'+(padGuess(key.id)?' g':'')+'">'+esc(sendLabel(send))+'</span>':'')):esc(key.lab);
    h+='<button type="button" class="'+cls.join(' ')+'" data-k="'+key.id+'" style="--kc:'+kc+';'+pos+'" title="'+esc(key.pad?(key.main?'Key':'Pad key')+(send?' → sends '+sendLabel(send):' — click to set'):lab(key.id))+'">'+
      '<span class="lg">'+top+'</span>'+(key.cap?'<span class="cap">'+esc(key.cap)+'</span>':'')+(cats.length>1?'<span class="cs">'+cats.map(c=>'<span style="background:'+catColor(c)+'"></span>').join('')+'</span>':'')+
      '<span class="bl">'+lines+(bs.length>max?'<span class="more">+'+(bs.length-max)+' more</span>':'')+'</span></button>';
  });
  kb.innerHTML=h;
  drawDetail(map,L);
  drawBar();
}
function rowHTML(s,extra){
  const c=catColor(s.cat||'Other');
  return '<div class="scx-row" data-sid="'+esc(s.id||s.keys+'|'+s.action)+'"><div class="ks">'+kbdHTML(s.keys)+'</div>'+
    '<div class="ac">'+esc(s.action)+(s.notes?' <span class="nt">· '+esc(s.notes)+'</span>':'')+(extra||'')+'</div>'+
    '<span class="ct" style="color:'+c+';border-color:'+c+'55">'+esc(s.cat||'Other')+'</span>'+
    '<button type="button" class="ib" data-fav title="Favorite">'+(s.fav?'★':'☆')+'</button><button type="button" class="ib" data-edit title="Edit">✎</button></div>';
}
function drawDetail(map,L){
  const det=root.querySelector('.scx-det'); if(!det) return;
  if(!st.sel){
    // no key picked: show what's in the current layer
    const lay=L; const seen=new Set(), rows=[];
    if(lay!==null){ Object.keys(map).forEach(id=>map[id].forEach(b=>{ if(b.layer===lay&&!seen.has(b.s)){seen.add(b.s);rows.push(b.s);} })); }
    const title=lay===null?'Pick a key':(lay?MODS.filter(m=>lay.split('+').includes(m)).map(m=>GLYPH[m]+' '+MODNAME[m]).join(' + '):'Plain keys (no modifier)')+' · '+rows.length;
    det.innerHTML='<h4>'+esc(title)+'</h4>'+(lay===null?'<div class="e">Click any key, or use the layer chips above. Every shortcut is also in the ☰ LIST tab.</div>':
      (rows.length?rows.sort((a,b)=>a.sort-b.sort).map(s=>rowHTML(s)).join(''):'<div class="e">Nothing on this layer yet.</div>'));
    return;
  }
  const pk=K.find(x=>x.id===st.sel&&x.pad);
  const kn=pk&&pk.main?'Key':'Pad key';
  if(pk){
    const sd=padSend(pk.id), str=padSendStr(pk.id);
    let rows=[]; if(sd&&sd.key){ const lay=layerOf(sd.mods); rows=(map[sd.key]||[]).filter(b=>b.layer===lay); }
    det.innerHTML='<h4>'+kn+(pk.lab?' “'+esc(pk.lab)+'”':' (no cap)')+(sd?' · sends '+esc(sendLabel(sd)):'')+'</h4>'+
      '<div class="scx-padset"><span class="e">Sends</span><input id="scxPad" value="'+esc(str)+'" placeholder="e.g. F15, Cmd+Ctrl+Q, Shift" autocomplete="off">'+
      '<button type="button" class="scx-btn rec" id="scxPadRec">● RECORD</button><button type="button" class="scx-btn go" id="scxPadSave">SET</button>'+
      (pk.id in st.pad?'<button type="button" class="scx-btn" id="scxPadReset">RESET</button>':'')+
      '<span class="e">'+((pk.id in st.pad)?'your override':(pk.main?'K3 Pro':'K0 Max')+' · Keychron Launcher, Layer 0')+'</span>'+'</div>'+
      (sd&&sd.mod?'<div class="e">Acts as the '+esc(MODNAME[sd.mod])+' modifier.</div>':rows.length?rows.map(b=>rowHTML(b.s)).join(''):(sd?'<div class="e">No shortcut on '+esc(sendLabel(sd))+' yet. <button type="button" class="scx-btn" data-addkey>＋ ADD</button></div>':'<div class="e">Not set. Type what this key sends (as programmed in the pad’s software), or press RECORD then the pad key.</div>'));
    const inp=det.querySelector('#scxPad'), recB=det.querySelector('#scxPadRec');
    const set=v=>{ st.pad[pk.id]=v.trim(); keep(); draw(); };
    det.querySelector('#scxPadSave').onclick=()=>set(inp.value);
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); set(inp.value); } });
    if(det.querySelector('#scxPadReset')) det.querySelector('#scxPadReset').onclick=()=>{ delete st.pad[pk.id]; keep(); draw(); };
    recB.onclick=()=>{ padRec=pk.id; recB.classList.add('on'); recB.textContent='● PRESS THE PAD KEY…'; };
    return;
  }
  const bs=(map[st.sel]||[]); const seen=new Set(), rows=[];
  bs.forEach(b=>{ if(!seen.has(b.s)){ seen.add(b.s); rows.push(b); } });
  rows.sort((a,b)=>a.layer.length-b.layer.length||a.s.sort-b.s.sort);
  det.innerHTML='<h4>'+esc(lab(st.sel))+' · '+rows.length+' shortcut'+(rows.length===1?'':'s')+' <button type="button" class="scx-btn" data-addkey style="margin-left:10px">＋ Add on this key</button></h4>'+
    (rows.length?rows.map(b=>rowHTML(b.s)).join(''):'<div class="e">Nothing mapped to this key.</div>');
}
function drawList(){
  const body=root.querySelector('.scx-body'); const q=root.querySelector('.scx-q').value.trim().toLowerCase();
  const list=shortcuts.filter(s=>(!st.cats.length||st.cats.includes(s.cat||'Other'))&&(!q||[s.keys,s.action,s.cat,s.notes].join(' ').toLowerCase().includes(q)));
  if(!list.length){ body.innerHTML='<div class="scx-empty">'+(shortcuts.length?'No match.':'No shortcuts yet — tap ＋ ADD.')+'</div>'; drawBar(); return; }
  let h='<div class="scx-list">';
  const favs=list.filter(s=>s.fav).sort((a,b)=>a.sort-b.sort);
  if(!q&&favs.length) h+='<div class="scx-grp"><h5 style="color:#e2b04a">★ Favorites</h5>'+favs.map(s=>rowHTML(s)).join('')+'</div>';
  allCats().forEach(c=>{ const g=list.filter(s=>(s.cat||'Other')===c).sort((a,b)=>a.sort-b.sort); if(!g.length) return;
    h+='<div class="scx-grp"><h5 style="color:'+catColor(c)+'">'+esc(c)+' · '+g.length+'</h5>'+g.map(s=>rowHTML(s)).join('')+'</div>'; });
  body.innerHTML=h+'</div>'; drawBar();
}
function drawBar(){
  const bar=root.querySelector('.scx-bar'); const kb=st.tab==='kb';
  const exact=st.mode==='exact';
  let h='';
  if(kb){
    h+='<span class="lbl">Layer</span><button type="button" class="scx-chip'+(!exact&&!held.size?' on':'')+'" data-layer="all">ALL</button>'+
      '<button type="button" class="scx-chip'+(exact&&!st.mods.length&&!held.size?' on':'')+'" data-layer="plain">PLAIN</button>'+
      MODS.map(m=>'<button type="button" class="scx-chip'+((held.size?held.has(m):exact&&st.mods.includes(m))?' on':'')+'" data-mod="'+m+'">'+GLYPH[m]+' '+MODNAME[m].toUpperCase()+'</button>').join('')+'<span class="scx-sep"></span>';
  }
  h+='<span class="lbl">Show</span>'+allCats().map(c=>{ const n=shortcuts.filter(s=>(s.cat||'Other')===c).length; const off=st.cats.length&&!st.cats.includes(c);
    return '<button type="button" class="scx-chip cat'+(off?' off':'')+'" data-cat="'+esc(c)+'"><span class="dot" style="background:'+catColor(c)+'"></span>'+esc(c)+' · '+n+'</button>'; }).join('');
  const c=cfg(); h+='<span class="scx-note">'+(c.apiKey?shortcuts.length+' shortcuts · live':'snapshot · edits stay on this device')+'</span>';
  bar.innerHTML=h;
}
function draw(){ if(!root) return; root.querySelectorAll('.scx-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===st.tab)); if(st.tab==='kb') drawKB(); else drawList(); }

function findS(sid){ return shortcuts.find(s=>(s.id||s.keys+'|'+s.action)===sid); }
function openEdit(s,preset){
  s=s||{cat:preset&&preset.cat||'My Macros',keys:preset&&preset.keys||'',action:'',notes:''};
  const body=root.querySelector('.scx-body');
  body.innerHTML='<div class="scx-ed"><h4>'+(s.id||shortcuts.includes(s)?'Edit':'New')+' shortcut</h4>'+
    '<label>Keys <span style="text-transform:none;letter-spacing:0">— use + between keys (Ctrl+Shift+Enter); comma for a sequence (Alt+E,S,V); “ / ” for alternatives</span></label>'+
    '<div style="display:flex;gap:6px"><input id="scxK" value="'+esc(s.keys)+'" autocomplete="off"><button type="button" class="scx-btn rec" id="scxRec" title="Press the combo on your keyboard">● RECORD</button></div><div class="prev" id="scxPrev"></div>'+
    '<label>Action</label><input id="scxA" value="'+esc(s.action)+'" autocomplete="off">'+
    '<label>Category</label><input id="scxC" list="scxCL" value="'+esc(s.cat)+'" autocomplete="off"><datalist id="scxCL">'+allCats().map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist>'+
    '<label>Notes (optional)</label><input id="scxN" value="'+esc(s.notes)+'" autocomplete="off">'+
    '<div class="acts">'+(shortcuts.includes(s)?'<button type="button" class="scx-btn del" id="scxDel">DELETE</button>':'')+'<span class="sp"></span><button type="button" class="scx-btn" id="scxCancel">CANCEL</button><button type="button" class="scx-btn go" id="scxSave">SAVE</button></div></div>';
  root.querySelector('.scx-bar').style.display='none';
  const $=id=>body.querySelector('#'+id);
  const prev=()=>{ const p=parse($('scxK').value); $('scxPrev').innerHTML=p.length?p.map(x=>'<kbd>'+esc((glyphs(x.mods)+' '+x.keys.map(k=>lab(k)).join(' · ')).trim())+'</kbd>'+(x.seq?'<span class="kp"> then '+esc(x.seq)+'</span>':'')).join(' <span class="kp">/</span> '):'<span class="kp">—</span>'; };
  $('scxK').addEventListener('input',prev); prev();
  let rec=false; const recB=$('scxRec');
  recB.onclick=()=>{ rec=!rec; recB.classList.toggle('on',rec); recB.textContent=rec?'● PRESS KEYS…':'● RECORD'; };
  body._rec=e=>{ if(!rec) return false; const id=CODE[e.code]; if(!id||KEYMOD[id]) return true;
    const m=[]; if(e.metaKey&&e.ctrlKey&&e.altKey&&e.shiftKey) m.push('Caps Lock'); else { if(e.metaKey)m.push('Cmd'); if(e.ctrlKey)m.push('Ctrl'); if(e.altKey)m.push('Alt'); if(e.shiftKey)m.push('Shift'); }
    const nm=recName(id);
    $('scxK').value=m.concat([nm]).join('+'); prev(); rec=false; recB.classList.remove('on'); recB.textContent='● RECORD'; return true; };
  const back=()=>{ root.querySelector('.scx-bar').style.display=''; body.innerHTML=''; body._rec=null; draw(); };
  $('scxCancel').onclick=back;
  if($('scxDel')) $('scxDel').onclick=()=>{ if($('scxDel').dataset.sure!=='1'){ $('scxDel').dataset.sure='1'; $('scxDel').textContent='TAP AGAIN TO DELETE'; return; }
    del(s.id); shortcuts=shortcuts.filter(x=>x!==s); cache(); back(); };
  $('scxSave').onclick=()=>{
    const f={Keys:$('scxK').value.trim(),Action:$('scxA').value.trim(),Category:$('scxC').value.trim()||'Other',Notes:$('scxN').value.trim()};
    if(!f.Keys&&!f.Action){ back(); return; }
    if(shortcuts.includes(s)){ Object.assign(s,{keys:f.Keys,action:f.Action,cat:f.Category,notes:f.Notes}); if(s.id) save(f,s.id); cache(); back(); return; }
    f.Sort=Math.max(0,...shortcuts.filter(x=>x.cat===f.Category).map(x=>x.sort||0))+1;
    const ns={id:'',keys:f.Keys,action:f.Action,cat:f.Category,notes:f.Notes,fav:false,sort:f.Sort,source:''};
    shortcuts.push(ns); cache(); back();
    save(f).then(r=>{ if(r){ ns.id=r.id; cache(); } });
  };
  setTimeout(()=>{ const i=$(preset&&preset.keys?'scxA':'scxK'); if(i) i.focus(); },30);
}

function recName(id){ const n={Backspace:'Delete',Return:'Enter',Space:'Space',DelFwd:'Del',PgUp:'PgUp',PgDn:'PgDn',Up:'Up',Down:'Down',Left:'Left',Right:'Right',Esc:'Esc',Tab:'Tab',Home:'Home',End:'End',PrtSc:'PrtSc',Fn:'Fn'}[id]; return n||(id.startsWith('Num')?'Num'+id.slice(3):id); }
// event.code -> key id
const CODE={Escape:'Esc',Backquote:'`',Minus:'-',Equal:'=',Backspace:'Backspace',Tab:'Tab',BracketLeft:'[',BracketRight:']',Backslash:'\\',CapsLock:'Caps',Semicolon:';',Quote:"'",Enter:'Return',
  ShiftLeft:'ShiftL',ShiftRight:'ShiftR',Comma:',',Period:'.',Slash:'/',ControlLeft:'CtrlL',ControlRight:'CtrlR',AltLeft:'AltL',AltRight:'AltR',MetaLeft:'CmdL',MetaRight:'CmdR',OSLeft:'CmdL',OSRight:'CmdR',Space:'Space',
  ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Home:'Home',End:'End',PageUp:'PgUp',PageDown:'PgDn',Delete:'DelFwd',Insert:'Ins',Help:'Ins',Fn:'Fn',PrintScreen:'PrtSc',
  NumLock:'NumClear',NumpadEqual:'Num=',NumpadDivide:'Num/',NumpadMultiply:'Num*',NumpadSubtract:'Num-',NumpadAdd:'Num+',NumpadEnter:'NumEnter',NumpadDecimal:'Num.'};
for(let i=0;i<26;i++){ const c=String.fromCharCode(65+i); CODE['Key'+c]=c; }
for(let i=0;i<10;i++){ CODE['Digit'+i]=String(i); CODE['Numpad'+i]='Num'+i; }
for(let i=1;i<=19;i++) CODE['F'+i]='F'+i;

function open(){
  if(root){ root.querySelector('.scx-q').focus(); return; }
  injectCSS(); if(innerWidth<700) st.tab='list';
  root=document.createElement('div'); root.className='scx-bd sc-modal';
  root.innerHTML='<div class="scx" role="dialog" aria-label="Shortcuts"><div class="scx-hd"><span class="scx-ttl">⌨️ Shortcuts</span>'+
    '<div class="scx-tabs"><button type="button" data-tab="kb">⌨ KEYBOARD</button><button type="button" data-tab="list">☰ LIST</button></div>'+
    '<input class="scx-q" type="search" placeholder="Search keys or action…" autocomplete="off">'+
    '<button type="button" class="scx-btn go" data-add>＋ ADD</button><button type="button" class="scx-btn scx-x" data-close title="Close (esc)">×</button></div>'+
    '<div class="scx-bar"></div><div class="scx-body"></div></div>';
  document.body.appendChild(root);
  const q=root.querySelector('.scx-q');
  q.addEventListener('input',()=>{ if(st.tab==='kb'){ st.sel=''; } draw(); });
  q.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(q.value){ q.value=''; draw(); e.stopPropagation(); e.preventDefault(); } else { q.blur(); } } });
  root.addEventListener('click',e=>{
    const t=e.target; let b;
    if(t===root){ close(); return; }
    if(t.closest('[data-close]')){ close(); return; }
    if((b=t.closest('[data-tab]'))){ st.tab=b.dataset.tab; keep(); root.querySelector('.scx-body').innerHTML=''; draw(); return; }
    if(t.closest('[data-add]')){ openEdit(null,st.tab==='kb'&&st.sel?{keys:keysFor(st.sel)}:null); return; }
    if(t.closest('[data-addkey]')){ openEdit(null,{keys:keysFor(st.sel)}); return; }
    if((b=t.closest('[data-layer]'))){ held.clear(); if(b.dataset.layer==='all'){ st.mode='all'; } else { st.mode='exact'; st.mods=[]; } keep(); draw(); return; }
    if((b=t.closest('[data-mod]'))){ toggleMod(b.dataset.mod); return; }
    if((b=t.closest('[data-cat]'))){ const c=b.dataset.cat, all=allCats();
      if(e.altKey||e.metaKey){ st.cats=[c]; } else { let on=st.cats.length?st.cats.slice():all.slice(); on=on.includes(c)?on.filter(x=>x!==c):on.concat([c]); st.cats=on.length===all.length||!on.length?[]:on; }
      keep(); draw(); return; }
    if((b=t.closest('.scx-k'))){ const id=b.dataset.k; if(KEYMOD[id]){ toggleMod(KEYMOD[id]); return; } if(e.altKey&&/^P\d\d$/.test(id)){ const sd=padSend(id); if(sd&&sd.mod){ toggleMod(sd.mod); return; } } st.sel=st.sel===id?'':id; draw(); return; }
    if((b=t.closest('[data-fav]'))){ const s=findS(b.closest('[data-sid]').dataset.sid); if(!s) return; s.fav=!s.fav; cache(); if(s.id) save({Fav:s.fav},s.id); draw(); return; }
    if((b=t.closest('[data-edit]'))){ const s=findS(b.closest('[data-sid]').dataset.sid); if(s) openEdit(s); return; }
  });
  root.addEventListener('dblclick',e=>{ const r=e.target.closest('.scx-row'); if(r&&!e.target.closest('button')){ const s=findS(r.dataset.sid); if(s) openEdit(s); } });
  onKey=e=>{
    if(!root) return;
    const body=root.querySelector('.scx-body');
    if(body._rec&&body._rec(e)){ e.preventDefault(); e.stopPropagation(); return; }
    if(padRec){ const id=CODE[e.code]; if(e.key==='Escape'){ padRec=''; draw(); e.preventDefault(); e.stopPropagation(); return; }
      if(id){ e.preventDefault(); e.stopPropagation(); const m=[]; if(e.metaKey&&e.ctrlKey&&e.altKey&&e.shiftKey&&!KEYMOD[id]) m.push('Caps Lock'); else { if(e.metaKey&&id!=='CmdL'&&id!=='CmdR')m.push('Cmd'); if(e.ctrlKey&&id!=='CtrlR')m.push('Ctrl'); if(e.altKey&&id!=='AltL')m.push('Alt'); if(e.shiftKey&&!/^Shift/.test(id))m.push('Shift'); }
        const nm=KEYMOD[id]?KEYMOD[id]:recName(id); st.pad[padRec]=m.concat([nm]).join('+'); padRec=''; keep(); draw(); } return; }
    const tag=(e.target.tagName||'').toLowerCase();
    if(e.key==='Escape'&&tag!=='input'){ e.preventDefault(); e.stopPropagation(); if(st.sel&&st.tab==='kb'){ st.sel=''; draw(); } else close(); return; }
    if(tag==='input'||tag==='textarea') { e.stopPropagation(); return; }
    e.stopPropagation();
    if(st.tab!=='kb') { if(e.key==='/'){ e.preventDefault(); root.querySelector('.scx-q').focus(); } return; }
    const id=CODE[e.code];
    const h=new Set(); if(e.metaKey&&e.ctrlKey&&e.altKey&&e.shiftKey) h.add('Caps'); else { if(e.metaKey)h.add('Cmd'); if(e.ctrlKey)h.add('Ctrl'); if(e.altKey)h.add('Alt'); if(e.shiftKey)h.add('Shift'); }
    held=h;
    if(id&&!KEYMOD[id]&&id!=='Caps'){ e.preventDefault(); pressed=id; st.sel=id; setTimeout(()=>{ if(pressed===id){ pressed=''; if(root&&st.tab==='kb') drawKB(); } },220); }
    drawKB();
  };
  onKeyUp=e=>{ if(!root||st.tab!=='kb') return; const tag=(e.target.tagName||'').toLowerCase(); if(tag==='input') return;
    const h=new Set(); if(e.metaKey&&e.ctrlKey&&e.altKey&&e.shiftKey) h.add('Caps'); else { if(e.metaKey)h.add('Cmd'); if(e.ctrlKey)h.add('Ctrl'); if(e.altKey)h.add('Alt'); if(e.shiftKey)h.add('Shift'); }
    if(e.key==='Meta') h.delete('Cmd'); if(e.key==='Control') h.delete('Ctrl'); if(e.key==='Alt') h.delete('Alt'); if(e.key==='Shift') h.delete('Shift');
    if(h.size!==held.size||[...h].some(x=>!held.has(x))){ held=h; drawKB(); } };
  onRes=()=>{ if(root&&st.tab==='kb') drawKB(); };
  addEventListener('keydown',onKey,true); addEventListener('keyup',onKeyUp,true); addEventListener('resize',onRes); addEventListener('blur',clearHeld);
  draw();
  load().then(()=>{ if(root&&!root.querySelector('.scx-ed')) draw(); });
  if(st.tab==='list') setTimeout(()=>q.focus(),40);
}
function toggleMod(m){
  held.clear();
  if(st.mode!=='exact'){ st.mode='exact'; st.mods=[]; }
  if(m==='Caps') st.mods=st.mods.includes('Caps')?[]:['Caps'];
  else { st.mods=st.mods.filter(x=>x!=='Caps'); st.mods=st.mods.includes(m)?st.mods.filter(x=>x!==m):st.mods.concat([m]); }
  keep(); draw();
}
function keysFor(id){
  const pk=K.find(x=>x.id===id&&x.pad); if(pk){ return padSendStr(id); }
  const L=st.mode==='exact'?st.mods:[];
  return L.map(m=>m==='Caps'?'Caps Lock':m).concat([recName(id)]).join('+');
}
window.Shortcuts={open,close,load,parse};
})();
