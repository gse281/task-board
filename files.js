/* files.js — 📂 Files in Use (Airtable "Files in Use" table). Click a row → rmbopen:// → Finder on the Mac (helper: rmbopen.app).
     window.Files = { init({key,base}), load(force), list(), rowHTML(f), wire(root,{toast}), onChange(fn) } */
(function(){
const T='tblra1KRzF833tTIk';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cfg={key:()=>'',base:()=>'appdDTNBbVrp6hVOv'}, rows=[], subs=[], at=0, busy=null;
const api=(path,opt)=>fetch('https://api.airtable.com/v0/'+cfg.base()+'/'+T+(path||''),Object.assign({headers:{Authorization:'Bearer '+cfg.key(),'Content-Type':'application/json'}},opt||{})).then(r=>r.ok?r.json():Promise.reject(r.status));
const fire=()=>subs.forEach(f=>{ try{ f(rows); }catch(e){} });
function init(o){ if(o&&o.key) cfg.key=o.key; if(o&&o.base) cfg.base=o.base; load(true); setInterval(()=>load(), 120000); }
async function load(force){ if(!cfg.key()) return rows; if(busy) return busy; if(!force&&Date.now()-at<60000) return rows;
  busy=(async()=>{ let out=[],off,g=0; do{ const d=await api('?pageSize=100'+(off?'&offset='+off:'')); out=out.concat((d.records||[]).map(r=>Object.assign({id:r.id},r.fields))); off=d.offset; }while(off&&++g<10);
    const old=JSON.stringify(rows); rows=out; at=Date.now(); if(JSON.stringify(rows)!==old) fire(); return rows; })().catch(()=>rows).finally(()=>{ busy=null; }); return busy; }
const list=()=>rows.filter(f=>!f.Done&&f.Path).sort((a,b)=>String(b.Added||'').localeCompare(String(a.Added||''))||String(a.Name||'').localeCompare(String(b.Name||'')));
const finderURL=p=>'rmbopen://open?p='+encodeURIComponent(p);
const webURL=(p,kind)=>'https://www.dropbox.com/'+(kind==='Folder'?'work':'preview')+p.split('/').map(encodeURIComponent).join('/')+(kind==='Folder'?'':'?role=work');
function rowHTML(f){ const icon=f.Kind==='Folder'?'📁':'📄';
  return `<div class="fqrow fi-row" data-file="${f.id}"><a class="fqi" href="${esc(finderURL(f.Path))}" title="Open in Finder" style="text-decoration:none;color:inherit"><b>${icon} ${esc(f.Name||f.Path.split('/').pop())}</b><span>${esc([f.Project,f.Note].filter(Boolean).join(' · ')||f.Path)}</span></a>
    <button class="cardbtn" data-fidone title="Remove from list">✕</button></div>`; }
function wire(root,o){ o=o||{}; root.querySelectorAll('[data-fidone]').forEach(b=>b.onclick=async e=>{ e.stopPropagation(); const id=b.closest('[data-file]').dataset.file; const r=rows.find(x=>x.id===id); if(r) r.Done=true; fire();
  try{ await api('/'+id,{method:'PATCH',body:JSON.stringify({fields:{Done:true}})}); o.toast&&o.toast('Removed from Files in Use'); }catch(err){ if(r) r.Done=false; fire(); o.toast&&o.toast('⚠︎ Not saved ('+err+')'); } }); }
window.Files={init,load,list,rowHTML,wire,onChange:fn=>subs.push(fn),finderURL,webURL};
})();
