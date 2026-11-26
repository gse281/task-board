/* nav.js — the page links in the top-right corner. Same links, same order, same look on every page.
   Put <span data-tbnav="email"></span> where the links go (value = this page's id) and load this file,
   or call TBNav.mount(el, 'email') when the bar is built in JS.
   Page ids: dashboard · focus · focus2 · run · meetings · email · aios.  To add a page: one line in PAGES. */
(function(){
'use strict';
var PAGES = [
  ['dashboard', '⌂', 'Dashboard', 'dashboard.html',      'Dashboard — the full board'],
  ['focus',     '◎', 'Focus',     'radial.html?focus=1', 'Focus — the home screen'],
  ['focus2',    '◉', 'Focus 2',   'focus2.html',         'Focus 2 — AM/PM calls'],
  ['run',       '▸', 'Run',       'run.html',            'Run — one task at a time, one key each'],
  ['meetings',  '◷', 'Meetings',  'meet/',               'Meetings only — now / next with one-tap Join'],
  ['email',     '✉', 'Email',     'email.html',          'Email — live Gmail + scan'],
  ['aios',      '◈', 'AIOS',      'aios.html',           'AIOS map — your Claude setup']
];
// Every link starts from the folder this file is served from, so it works from a sub-folder page (meet/)
// and from a copy of a page that runs off the task-board site (Focus 2).
var me = (document.currentScript && document.currentScript.src || '').split('?')[0];
var ROOT = me.replace(/[^\/]*$/, '');

var CSS = '.tbnav{display:flex;align-items:center;flex:none;margin-left:auto;gap:2px;pointer-events:auto;-webkit-user-select:none;user-select:none}' +
  '.tbnav a{display:flex;align-items:center;gap:5px;padding:7px 10px;border:0;border-radius:8px;background:none;box-shadow:none;' +
    'font:700 12px/1.2 ui-monospace,Menlo,monospace;letter-spacing:0;text-transform:none;color:#8aa6af;text-decoration:none;white-space:nowrap}' +
  '.tbnav a:hover,.tbnav a:focus-visible{color:#c8e6f0;background:rgba(57,199,223,.1);outline:none}' +
  '.tbnav a.cur{color:#39c7df;background:rgba(57,199,223,.12);cursor:default}' +
  '.tbnav .tbn-i{font-size:14px;line-height:1}' +
  '@media(max-width:1100px){.tbnav .tbn-l{display:none}.tbnav a{padding:9px 10px}.tbnav .tbn-i{font-size:18px}}' +
  // Slim dark scrollbars, the same on every page. (Don't set scrollbar-width on an element: Chrome then drops these and draws its wide native bar.)
  '::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}' +
  '::-webkit-scrollbar-thumb{background:rgba(57,199,223,.2);border-radius:6px}::-webkit-scrollbar-thumb:hover{background:rgba(57,199,223,.45)}' +
  '@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:rgba(57,199,223,.3) transparent}}';
var cssDone = false;
function css(){ if (cssDone) return; cssDone = true; var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

function mount(el, cur){
  if (!el) return null;
  css();
  el.classList.add('tbnav'); el.setAttribute('role', 'navigation'); el.setAttribute('aria-label', 'Pages');
  el.textContent = '';
  PAGES.forEach(function(p){
    var a = document.createElement('a');
    a.href = ROOT + p[3]; a.title = p[4]; a.dataset.page = p[0];
    if (p[0] === cur) { a.className = 'cur'; a.setAttribute('aria-current', 'page'); }
    var i = document.createElement('span'); i.className = 'tbn-i'; i.textContent = p[1];
    var l = document.createElement('span'); l.className = 'tbn-l'; l.textContent = p[2];
    a.append(i, l); el.appendChild(a);
  });
  return el;
}
function auto(){ Array.prototype.forEach.call(document.querySelectorAll('[data-tbnav]'), function(el){ if (!el.firstChild) mount(el, el.getAttribute('data-tbnav')); }); }

window.TBNav = { mount: mount, pages: PAGES };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
