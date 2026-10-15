/* photos.js — 📷 photos & screenshots on tasks (Airtable Items.Photos attachment field), shared by iPhone, grid and Focus.
   Upload: Airtable content API uploadAttachment (base64, ≤5 MB) after downscaling to ~1600 px JPEG.
   window.Photos = { pick(), fromClipboard(), prep(file), upload(recId,file), add(t,files,onDone), thumbsHTML(list), wireThumbs(root,list), view(list,i), dropZone(el,fn), imagesFrom(ev), FIELD } */
(function(){
const FIELD='fldKuNkhvpbKLXWPj', MAX=1600;
const E=()=>window.TE||{key:()=>'',base:()=>'appdDTNBbVrp6hVOv'};
const say=m=>{ try{ if(typeof window.toast==='function') window.toast(m); }catch(e){} };
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// iOS shows Photo Library / Take Photo / Choose File for this input
function pick(multiple){ return new Promise(res=>{ const i=document.createElement('input'); i.type='file'; i.accept='image/*'; if(multiple!==false) i.multiple=true; i.style.cssText='position:fixed;left:-9999px;opacity:0';
  document.body.appendChild(i); i.onchange=()=>{ res([...i.files]); i.remove(); }; i.click(); setTimeout(()=>{ if(i.isConnected&&!i.files.length){} },60000); }); }
async function fromClipboard(){ try{ if(!navigator.clipboard||!navigator.clipboard.read) throw 0; const items=await navigator.clipboard.read(); const out=[];
    for(const it of items){ const ty=it.types.find(t=>t.startsWith('image/')); if(ty){ const b=await it.getType(ty); out.push(new File([b],'pasted.'+(ty.split('/')[1]||'png'),{type:ty})); } }
    if(!out.length) say('No image on the clipboard — take a screenshot, tap it, Copy, then Paste here'); return out; }
  catch(e){ say('Paste: allow clipboard access, or use 📷 → Photo Library'); return []; } }
function imagesFrom(ev){ const dt=ev.clipboardData||ev.dataTransfer; if(!dt) return []; const out=[]; [...(dt.items||[])].forEach(it=>{ if(it.kind==='file'&&/^image\//.test(it.type)){ const f=it.getAsFile(); if(f) out.push(f); } });
  if(!out.length&&dt.files) [...dt.files].forEach(f=>{ if(/^image\//.test(f.type)) out.push(f); }); return out; }
function loadImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const im=new Image(); im.onload=()=>{ res(im); setTimeout(()=>URL.revokeObjectURL(u),1000); }; im.onerror=rej; im.src=u; }); }
async function prep(file){ let im; try{ im=await loadImg(file); }catch(e){ throw 'not an image'; }
  const s=Math.min(1,MAX/Math.max(im.naturalWidth,im.naturalHeight)); const w=Math.round(im.naturalWidth*s), h=Math.round(im.naturalHeight*s);
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(im,0,0,w,h);
  let q=0.82, url=c.toDataURL('image/jpeg',q); while(url.length*0.75>4.6e6&&q>0.4){ q-=0.12; url=c.toDataURL('image/jpeg',q); }
  const d=new Date(), stamp=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');
  return {contentType:'image/jpeg',file:url.split(',')[1],filename:(/screenshot/i.test(file.name)?'screenshot_':'photo_')+stamp+'.jpg',preview:url}; }
async function upload(recId,file){ if(!/^rec/.test(recId||'')) throw 'task not saved yet'; const k=E().key(); if(!k) throw 'connect Airtable first';
  const p=await prep(file);
  const r=await fetch('https://content.airtable.com/v0/'+E().base()+'/'+recId+'/'+FIELD+'/uploadAttachment',{method:'POST',headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify({contentType:p.contentType,file:p.file,filename:p.filename})});
  if(!r.ok){ let m=r.status; try{ const j=await r.json(); m+=' '+((j.error&&(j.error.message||j.error.type))||''); }catch(e){} throw m; }
  const d=await r.json(); const f=d.fields||{}; return f[FIELD]||f.Photos||null; }
// add files to task t (t.photos updated); onDone(list) after each upload
async function add(t,files,onDone){ files=(files||[]).filter(f=>f&&/^image\//.test(f.type||'image/'));
  if(!files.length) return; for(const f of files){ say('📷 Uploading…'); try{ const L=await upload(t.id,f); if(L) t.photos=L; else (t.photos=t.photos||[]).push({id:'tmp',url:'',filename:f.name}); say('📷 Photo added'); onDone&&onDone(t.photos); }
    catch(e){ say('⚠︎ Photo not saved ('+e+')'); } } }
const thumb=a=>(a.thumbnails&&(a.thumbnails.large||a.thumbnails.small)||{}).url||a.url;
function thumbsHTML(list){ list=list||[]; if(!list.length) return ''; return '<div class="ph-row">'+list.map((a,i)=>'<button class="ph-th" data-phi="'+i+'" aria-label="View photo"><img src="'+esc((a.thumbnails&&a.thumbnails.small||{}).url||thumb(a))+'" alt="" loading="lazy"></button>').join('')+'</div>'; }
function wireThumbs(root,list){ root.querySelectorAll('[data-phi]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); view(list,+b.dataset.phi); }); }
function view(list,i){ css(); let k=i||0; const v=document.createElement('div'); v.className='ph-view';
  const draw=()=>{ const a=list[k]; v.innerHTML='<img src="'+esc(a.url)+'" alt=""><div class="ph-bar"><span>'+(k+1)+' / '+list.length+'</span><a href="'+esc(a.url)+'" target="_blank" rel="noopener">Open ↗</a><button data-x aria-label="Close">✕</button></div>'+(list.length>1?'<button class="ph-nav l" data-p>‹</button><button class="ph-nav r" data-n>›</button>':'');
    v.querySelector('[data-x]').onclick=close; const p=v.querySelector('[data-p]'), n=v.querySelector('[data-n]'); if(p) p.onclick=e=>{ e.stopPropagation(); k=(k-1+list.length)%list.length; draw(); }; if(n) n.onclick=e=>{ e.stopPropagation(); k=(k+1)%list.length; draw(); }; };
  const close=()=>{ v.remove(); document.removeEventListener('keydown',kd); }; const kd=e=>{ if(e.key==='Escape') close(); if(e.key==='ArrowRight'&&list.length>1){ k=(k+1)%list.length; draw(); } if(e.key==='ArrowLeft'&&list.length>1){ k=(k-1+list.length)%list.length; draw(); } };
  document.addEventListener('keydown',kd); v.addEventListener('click',e=>{ if(e.target===v||e.target.tagName==='IMG') close(); });
  let x0=null,y0=0; v.addEventListener('touchstart',e=>{ x0=e.touches[0].clientX; y0=e.touches[0].clientY; },{passive:true});
  v.addEventListener('touchend',e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0; x0=null; if(dy>90&&Math.abs(dy)>Math.abs(dx)) close(); else if(Math.abs(dx)>60&&list.length>1){ k=(k+(dx<0?1:-1)+list.length)%list.length; draw(); } });
  draw(); document.body.appendChild(v); }
// desktop: drop / paste images onto an element
function dropZone(el,fn){ if(!el||el._phz) return; el._phz=1; css();
  el.addEventListener('dragover',e=>{ if([...(e.dataTransfer&&e.dataTransfer.items||[])].some(i=>i.kind==='file')){ e.preventDefault(); el.classList.add('ph-over'); } });
  el.addEventListener('dragleave',e=>{ if(!el.contains(e.relatedTarget)) el.classList.remove('ph-over'); });
  el.addEventListener('drop',e=>{ const f=imagesFrom(e); el.classList.remove('ph-over'); if(f.length){ e.preventDefault(); e.stopPropagation(); fn(f,e); } }); }
const CSS=`.ph-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.ph-th{width:64px;height:64px;padding:0;border-radius:10px;overflow:hidden;border:1px solid rgba(57,199,223,.3);background:#06161c;cursor:zoom-in;flex:none}
.ph-th img{width:100%;height:100%;object-fit:cover;display:block}
.ph-view{position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.94);display:flex;align-items:center;justify-content:center}
.ph-view img{max-width:100vw;max-height:100vh;max-height:100dvh;object-fit:contain;touch-action:pinch-zoom}
.ph-bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:14px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,0));color:#cfe3e8;font:600 13px -apple-system,system-ui,sans-serif}
.ph-bar a{color:#39c7df;text-decoration:none;margin-left:auto}.ph-bar button{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.4);color:#fff;font-size:16px}
.ph-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:64px;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:28px;border-radius:10px}.ph-nav.l{left:8px}.ph-nav.r{right:8px}
.ph-over{outline:2px dashed #39c7df!important;outline-offset:-4px;background-color:rgba(57,199,223,.08)!important}
.ph-btns{display:flex;gap:6px;flex-wrap:wrap}`;
let cssDone=false; function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); }
// ✨ Extract tasks from a screenshot item → ClaudeQueue (the runner downloads the attachment and reads it)
const EXTRACT="Read this screenshot and create the right task(s), with project/lead, and check for duplicates. The image is in this item's Photos attachment field (Airtable attachment URL): download it to /tmp with curl and view it with the Read tool. Create each task as a new Item (Status Open, Section incoming, Source \"Claude\", Project/SBLead set, one-line NextStep); skip anything that duplicates an open item (say which). Then rename this screenshot item to a short summary and mark it Done (keep the photo). Anything that would message someone: draft it for approval.";
async function extract(t){ const k=E().key(); if(!k) throw 'connect Airtable';
  const r=await fetch('https://api.airtable.com/v0/'+E().base()+'/tbliwVVKs3wdNRehV',{method:'POST',headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify({typecast:true,records:[{fields:{Summary:'Claude → '+String(t.name||'Screenshot').slice(0,60),ItemId:t.id,Item:[t.id],Instruction:EXTRACT,Status:'Queued',QueuedAt:new Date().toISOString()}}]})});
  if(!r.ok) throw r.status; const d=await r.json(); if(window.CQ) (d.records||[]).forEach(x=>CQ.mark(Object.assign({id:x.id},x.fields))); return true; }
const shotTitle=()=>'Screenshot '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
window.Photos={extract,shotTitle,FIELD,pick,fromClipboard,imagesFrom,prep,upload,add,thumbsHTML,wireThumbs,view,dropZone,css};
})();
