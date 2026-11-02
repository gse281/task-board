/* gmail-live.js — live Gmail inbox panel v4
   Requires Google Identity Services:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   Public API:  window.GL = { mount(host, cfg) }
*/
(function () {
'use strict';

var SCOPE   = 'https://www.googleapis.com/auth/gmail.modify';
var BASE    = 'https://www.googleapis.com/gmail/v1/users/me/';
var TOK_KEY = 'gl.v4.tok';

// ── Auth state ─────────────────────────────────────────────────────────────────
var _cfg       = null;
var _gisClient = null;
var _token     = null;
var _exp       = 0;
var _pendingCB = null;
var _authed    = false;

(function restoreToken() {
  try {
    var s = localStorage.getItem(TOK_KEY);
    if (s) { var p = JSON.parse(s); if (p.exp > Date.now() + 60000) { _token = p.tok; _exp = p.exp; _authed = true; } }
  } catch(e) {}
})();

// ── Panel state ────────────────────────────────────────────────────────────────
var _threads  = [];
var _nextPage = null;
var _total    = null;
var _loading  = false;
var _error    = null;
var _expanded = {};
var _bodies   = {};
var _notes    = {};   // threadId → { rid, note } (Airtable EmailNotes)
var _editing  = null, _draft = '';
var _host     = null;
var _listEl   = null;

// ── Auth ───────────────────────────────────────────────────────────────────────

function saveToken() {
  try { localStorage.setItem(TOK_KEY, JSON.stringify({ tok: _token, exp: _exp })); } catch(e) {}
}
function clearToken() { try { localStorage.removeItem(TOK_KEY); } catch(e) {} }

function ensureGISClient() {
  if (_gisClient) return;
  _gisClient = google.accounts.oauth2.initTokenClient({
    client_id: _cfg.gmailClientId,
    scope: SCOPE,
    callback: function (r) {
      if (r && r.access_token) {
        _token = r.access_token;
        _exp   = Date.now() + (Number(r.expires_in || 3540) - 60) * 1000;
        _authed = true; saveToken();
      }
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(_token || null); }
    },
    error_callback: function () {
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(null); }
    }
  });
}

// ── Backend mode: a Google Apps Script web app (cfg.gmailBackend) hands out access
//    tokens, so the page never signs in. Key lives only in this browser (BK_KEY).

var BK_KEY = 'gl.v5.bkey';

function backendUrl() {
  var u = (_cfg && _cfg.gmailBackend || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) ? u : '';
}
function backendKey() { try { return localStorage.getItem(BK_KEY) || ''; } catch(e) { return ''; } }
function newKey() {
  var b = new Uint8Array(24); crypto.getRandomValues(b);
  var k = Array.from(b, function(x){ return x.toString(16).padStart(2, '0'); }).join('');
  try { localStorage.setItem(BK_KEY, k); } catch(e) {}
  return k;
}

function saveBackend(url, key) {
  _cfg.gmailBackend = url;
  try {
    var c = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); c.gmailBackend = url; delete c.gmailWorker;
    localStorage.setItem('tb.cfg', JSON.stringify(c));
    if (key) localStorage.setItem(BK_KEY, key);
  } catch(e) {}
}

// Other devices: open email.html#gb=<url>|<key> once.
var _linkBackend = '', _linkApiKey = '';
(function readSetupLink() {
  var m = location.hash.match(/gb=([^|&]+)\|([0-9a-f]{48})/);
  if (!m) return;
  try {
    _linkBackend = decodeURIComponent(m[1]);
    var c = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); c.gmailBackend = _linkBackend;
    var at = location.hash.match(/[&#]at=([^&]+)/);
    if (at && !c.apiKey) { c.apiKey = decodeURIComponent(at[1]); _linkApiKey = c.apiKey; }
    localStorage.setItem('tb.cfg', JSON.stringify(c)); localStorage.setItem(BK_KEY, m[2]);
  } catch(e) {}
  history.replaceState(null, '', location.pathname + location.search);
})();

function takeAccess(d) {
  _token = d.access_token;
  _exp   = Date.now() + (Number(d.expires_in || 900) - 60) * 1000;
  _authed = true; saveToken();
  return _token;
}

// text/plain body keeps it a "simple" CORS request (Apps Script can't answer preflights).
async function backendToken() {
  if (!backendUrl() || !backendKey()) return null;
  try {
    var r = await fetch(backendUrl(), { method: 'POST', body: JSON.stringify({ k: backendKey() }) });
    var d = await r.json();
    if (d.access_token) return takeAccess(d);
    _error = d.error === 'denied' ? 'Key mismatch: the live script has a different key (this browser\'s starts ' + backendKey().slice(0,6) + '). In Apps Script: check KEY matches, ⌘S, then Deploy → New deployment (not Manage) and paste the NEW /exec URL here.' : (d.error || 'Backend error');
  } catch (e) { _error = 'Backend unreachable'; }
  return null;
}

function signIn() {
  return new Promise(function (resolve) {
    ensureGISClient(); _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: 'select_account' });
  });
}

function silentRefresh() {
  if (_token && Date.now() < _exp) return Promise.resolve(_token);
  if (backendUrl()) return backendToken();
  if (!_gisClient) return Promise.resolve(null);
  return new Promise(function (resolve) {
    _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: 'none' });
  });
}

async function getToken() {
  if (_token && Date.now() < _exp) return _token;
  if (!_authed && !backendUrl()) return null;
  return silentRefresh();
}

// ── Gmail API ──────────────────────────────────────────────────────────────────

async function gfetch(path, opts) {
  opts = opts || {};
  var tok = await getToken();
  if (!tok) throw Object.assign(new Error('auth'), { code: 'auth' });
  var r = await fetch(BASE + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, opts.headers || {})
  }));
  if (r.status === 401) {
    _token = null; clearToken();
    // Backend mode: an expired access token just means fetch a fresh one once.
    if (backendUrl() && !opts._retried) return gfetch(path, Object.assign({}, opts, { _retried: true }));
    throw Object.assign(new Error('auth'), { code: 'auth' });
  }
  // Rate limit (403/429): back off and retry, up to 4 times.
  if ((r.status === 403 || r.status === 429) && (opts._tries || 0) < 2) {
    var n = (opts._tries || 0) + 1;
    await new Promise(function(res){ setTimeout(res, 800 * Math.pow(2, n - 1) + Math.random() * 400); });
    return gfetch(path, Object.assign({}, opts, { _tries: n }));
  }
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error('busy'), { code: 'busy' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Run fn over items, at most `limit` at a time (Gmail rate-limits bursts).
async function pool(items, limit, fn) {
  var out = new Array(items.length), i = 0;
  async function worker() { while (i < items.length) { var k = i++; out[k] = await fn(items[k]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function apiListThreads(pageToken) {
  var qs = 'threads?maxResults=100&labelIds=INBOX';
  if (pageToken) qs += '&pageToken=' + encodeURIComponent(pageToken);
  return gfetch(qs);
}

async function apiGetThread(id) {
  return gfetch('threads/' + id + '?format=METADATA&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
}

// Plain text of the newest message (for the ▸ more preview).
async function apiBody(id) {
  var t = await gfetch('threads/' + id + '?format=FULL');
  var m = (t.messages || [])[t.messages.length - 1] || {};
  function dec(d) { try { return decodeURIComponent(escape(atob(d.replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { return ''; } }
  function find(p, type) {
    if (!p) return '';
    if (p.mimeType === type && p.body && p.body.data) return dec(p.body.data);
    for (var i = 0; p.parts && i < p.parts.length; i++) { var x = find(p.parts[i], type); if (x) return x; }
    return '';
  }
  var txt = find(m.payload, 'text/plain');
  if (!txt) {
    var h = find(m.payload, 'text/html');
    var el = document.createElement('div'); el.innerHTML = h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');
    txt = el.textContent || '';
  }
  return txt.replace(/\r/g, '').replace(/^>.*$/gm, '').replace(/[ \t\u00a0\u200c]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function apiModify(id, body) {
  return gfetch('threads/' + id + '/modify', { method: 'POST', body: JSON.stringify(body) });
}

// ── Parsing ────────────────────────────────────────────────────────────────────

function hdr(msg, name) {
  var hs = (msg.payload && msg.payload.headers) || [];
  var n = name.toLowerCase();
  for (var i = 0; i < hs.length; i++) if (hs[i].name.toLowerCase() === n) return hs[i].value;
  return '';
}

function parseSender(from) {
  var nm = from.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  var name = nm ? nm[1].trim().replace(/^["'\s]+|["'\s]+$/g, '') : from.replace(/<[^>]+>/, '').trim() || from;
  var em = (from.match(/<([^>]+)>/) || [])[1] || from;
  return { name: name || em, email: em };
}

// Key facts (amounts, dates, due/failed/fraud…) highlighted in summaries.
function hlText(t) {
  var s = String(t || '').replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  s = s.replace(/^★([^·]*)/, '<mark class="hl star">★$1</mark>');
  return s.replace(/(\$[\d,]+(?:\.\d+)?[KkMm]?|\b(?:due|overdue|expires?|expired|deadline|matures?|past due|declined|failed|fraud|urgent|final notice|danger|by (?:today|tomorrow|Mon|Tue|Wed|Thu|Fri|Sun)\w*)\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)/gi,'<mark class="hl">$1</mark>');
}

function htmlDecode(s) {
  return (s||'').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

var CACHE_KEY = 'gl.cache';
var _cache = {}; try { _cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) {}
function fromCache(d) { var t = Object.assign({}, d); t.date = new Date(d.date); return t; }
function saveCache() {
  var ks = Object.keys(_cache);
  if (ks.length > 1500) ks.slice(0, ks.length - 1500).forEach(function(k){ delete _cache[k]; });
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(_cache)); } catch (e) { _cache = {}; try { localStorage.removeItem(CACHE_KEY); } catch (x) {} }
}

function parseThread(t) {
  var msgs = t.messages || [];
  var first = msgs[0] || {};
  var s = parseSender(hdr(first, 'From'));
  var dateStr = hdr(first, 'Date');
  return {
    id:          t.id,
    subject:     hdr(first, 'Subject') || '(no subject)',
    snippet:     htmlDecode(first.snippet || ''),
    senderName:  s.name,
    senderEmail: s.email,
    date:        dateStr ? new Date(dateStr) : new Date(),
    labels:      msgs.reduce(function(a, m){ return a.concat(m.labelIds || []); }, []),
    starred:     (first.labelIds || []).indexOf('STARRED') >= 0,
    unread:      (first.labelIds || []).indexOf('UNREAD') >= 0,
    msgCount:    msgs.length
  };
}

function fmtDate(d) {
  var now = new Date(), diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth()+1) + '/' + d.getDate();
  return (d.getMonth()+1) + '/' + d.getDate() + '/' + (d.getFullYear()%100);
}

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadPage(reset) {
  if (_loading) return;
  _loading = true; _error = null;
  if (reset) { _threads = []; _nextPage = null; _total = null; loadRules().then(function(){ rebuildList(_listEl); }).catch(function(){}); }
  redraw();
  try {
    var startTok = _nextPage;
    var list = await apiListThreads(_nextPage);
    _nextPage = list.nextPageToken || null;
    if (reset || _total == null) {
      try { _total = (await gfetch('labels/INBOX')).threadsTotal; } catch(e) { _total = list.resultSizeEstimate || 0; }
    }
    // Threads unchanged since last visit (same historyId) come from the cache — no Gmail call.
    // The rest are fetched 20 at a time and drawn after each chunk.
    var ids = list.threads || [], need = [], have = {};
    _threads.forEach(function(t){ have[t.id] = 1; });
    ids.forEach(function(x){
      var c = _cache[x.id];
      if (c && x.historyId && c.h === x.historyId) { if (!have[x.id]) { _threads.push(fromCache(c.d)); have[x.id] = 1; } }
      else need.push(x);
    });
    redraw();
    for (var c = 0; c < need.length; c += 20) {
      var fetched = await pool(need.slice(c, c + 20), 4, function(t){ return apiGetThread(t.id).catch(function(e){ if (e.code === 'auth' || e.code === 'busy') throw e; return null; }); });
      fetched.forEach(function(raw, k){
        if (!raw) return; var t = parseThread(raw), id = need[c + k].id;
        _cache[id] = { h: need[c + k].historyId, d: t };
        if (!have[t.id]) { _threads.push(t); have[t.id] = 1; }
      });
      saveCache(); redraw();
    }
  } catch(e) {
    _error = (e.code === 'auth') ? 'auth' : e.code === 'busy' ? 'busy' : (e.message || 'Error');
    if (_error === 'busy') _nextPage = typeof startTok === 'undefined' ? _nextPage : startTok;  // redo this page (cached threads are free)
  }
  _loading = false;
  redraw();
  // Keep loading until the whole inbox is in. Gmail "busy" (per-minute quota) → wait 60s, continue.
  if (_error === 'busy' || (_nextPage && !_error)) {
    setTimeout(function(){ loadPage(false); }, _error === 'busy' ? 60000 : 300);
  }
}

// ── CSS — matches scan (emailrun.js) palette exactly ──────────────────────────

var _cssAdded = false;
function addCss() {
  if (_cssAdded) return; _cssAdded = true;
  var s = document.createElement('style');
  s.textContent = `
.glv{max-width:1800px;margin:0 auto;box-sizing:border-box;padding:0 14px 30px;font:16px/1.45 -apple-system,system-ui,sans-serif;color:#e7f3f6;background:#070d11;min-height:100%}
/* sticky bar */
.glv-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;background:linear-gradient(#070d11 85%,rgba(7,13,17,0))}
.glv-chips{display:flex;gap:5px;flex-wrap:wrap}
.glv-chip{text-decoration:none;color:#e7f3f6;border:1px solid rgba(57,199,223,.3);border-radius:999px;padding:3px 11px;font:600 13px ui-monospace,Menlo,monospace;cursor:default}
.glv-chip b{color:#39c7df}
.glv-st{flex:1;min-width:140px;color:#8aa6af;font-size:14px}
.glv-run{color:#39c7df;font-weight:700}
/* buttons */
.glv-btn{height:28px;border-radius:8px;border:1px solid rgba(57,199,223,.3);background:rgba(57,199,223,.07);color:#e7f3f6;font:700 12.5px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px;white-space:nowrap}
.glv-btn:hover{background:rgba(57,199,223,.15)}
.glv-btn:disabled{opacity:.45;cursor:default}
.glv-btn.ok{background:#30D158;border-color:#30D158;color:#07141a}
/* section header */
.glv-sec{margin-bottom:6px}
.glv-sh{display:flex;align-items:center;gap:7px;padding:6px 2px 5px;cursor:pointer;user-select:none}
.glv-sh:hover .glv-sn{color:#c8e6f0}
.glv-sl{display:inline-block;width:20px;height:20px;border-radius:6px;text-align:center;line-height:20px;font:800 12px ui-monospace,Menlo,monospace;background:rgba(57,199,223,.15);color:#39c7df;flex-shrink:0}
.glv-sn{font-size:15.5px;font-weight:800;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.glv-sc{color:#07141a;background:#39c7df;border-radius:999px;padding:0 7px;font-size:11px;font-weight:800;font-style:normal;flex-shrink:0}
.glv-xi{color:#64838d;font-size:11px;flex-shrink:0}
.glv-arch{height:22px;border-radius:6px;border:1px solid rgba(57,199,223,.3);background:transparent;color:#8aa6af;font:700 10px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 8px;flex-shrink:0;opacity:0}
.glv-sh:hover .glv-arch{opacity:1}
.glv-arch:hover{background:rgba(57,199,223,.15);color:#39c7df;opacity:1}
/* rows list */
.glv-list{display:flex;flex-direction:column;gap:3px;margin-bottom:6px}
/* individual row */
.glv-row{break-inside:avoid;border:1px solid rgba(57,199,223,.12);border-radius:9px;padding:6px 9px;cursor:pointer;background:rgba(14,24,30,.5)}
.glv-row:hover{background:rgba(20,36,42,.8);border-color:rgba(57,199,223,.22)}
.glv-row.unr{border-color:rgba(57,199,223,.2)}
.glv-rh{display:flex;align-items:baseline;gap:6px;min-width:0}
.glv-rf{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15.5px}
.glv-rw{flex:none;color:#64838d;font-size:13px}
.glv-rs{margin-top:2px;color:#bfe3ec;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.glv-row.unr .glv-rs{font-weight:600;color:#daeeff}
.glv-rsnip{margin-top:2px;color:#7f9ea8;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* star */
.glv-star{flex:none;background:none;border:0;cursor:pointer;color:#3a5a6a;font-size:18px;line-height:1;padding:0 2px;user-select:none}
.glv-star.on{color:#f5c518}
.glv-star:hover{color:#f5c518}
/* row actions */
.glv-ck{height:20px;padding:0 7px;font-size:11px;flex:none;height:22px;border-radius:6px;border:1px solid rgba(57,199,223,.2);background:transparent;color:#8aa6af;font:700 11.5px ui-monospace,Menlo,monospace;cursor:pointer;opacity:0}
.glv-row:hover .glv-ck{opacity:1}
.glv-ck:hover{background:rgba(57,199,223,.12);color:#39c7df;opacity:1}
.glv-mc{flex:none;color:#64838d;font-size:10px;background:rgba(20,36,42,.9);border-radius:6px;padding:0 5px}
/* spinner / empty */
.glv-spin{padding:24px;text-align:center;color:#8aa6af;font-size:12.5px}
.glv-empty{padding:24px;text-align:center;color:#8aa6af;font-size:13px}
/* setup / connect */
.glv-setup{padding:22px;max-width:500px}
.glv-setup h3{margin:0 0 12px;font-size:15px;color:#c8e6f0;font-weight:600}
.glv-setup p{font-size:12px;color:#8aa6af;margin:0 0 10px;line-height:1.6}
.glv-setup code{color:#8aa6af;background:#06141a;padding:1px 5px;border-radius:3px;font-size:11px}
.glv-setup a{color:#39c7df}
.glv-setup input,.glv-connect input{width:100%;background:#06141a;border:1px solid rgba(57,199,223,.3);color:#e7f3f6;padding:7px 10px;border-radius:8px;font-size:12px;font-family:inherit;margin-bottom:4px}
.glv-setup input:focus,.glv-connect input:focus{outline:none;border-color:#39c7df}
.glv-connect{padding:40px 20px;text-align:center}
.glv-be{margin:22px auto 0;max-width:560px;text-align:left;font-size:12px;color:#8aa6af;border-top:1px solid #1a2a32;padding-top:16px}
.glv-be b{color:#c8e6f0}.glv-be a{color:#39c7df}.glv-be ol{padding-left:18px;margin:8px 0 12px}.glv-be li{margin:5px 0}
.glv-be .glv-btn{height:22px;padding:0 8px;font-size:11px}.glv-be #glv-bk-save{height:30px;margin-top:6px}
#glv-bk-msg{margin-top:8px;color:#e5a53a}
.glv-connect p{font-size:12px;color:#8aa6af;margin:10px 0 0}
.glv-cols{display:flex;gap:16px;align-items:flex-start}.glv-col{flex:1;min-width:0}
.glv-bk{break-inside:avoid-column;margin-bottom:12px}
.glv-bh{display:flex;align-items:center;gap:7px;padding:4px 2px 6px;cursor:pointer;user-select:none;break-after:avoid}
.glv-bh h2{margin:0;font-size:16px;font-weight:800;flex:1}
.glv-B .glv-sl{background:#e5533a;color:#fff}.glv-D .glv-sl{background:#e0a458;color:#07141a}.glv-A .glv-sl,.glv-N .glv-sl{color:#8aa6af}
.glv-B .glv-row{border-color:rgba(229,83,58,.35)}.glv-D .glv-row{border-color:rgba(224,164,88,.35)}
.glv-aa{height:26px;padding:0 9px;font-size:12px}
.glv-pj{break-after:avoid;font:800 12px ui-monospace,Menlo,monospace;letter-spacing:1.2px;text-transform:uppercase;color:#64838d;margin:6px 2px 0}
.glv-pj i{font-style:normal;color:#39c7df;margin-left:3px}
.glv-rsnip.sum{color:#9fc3cc;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.glv-adv{margin-top:2px;color:#e0a458;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.glv-ck.on{opacity:1;color:#e0a458;border-color:rgba(224,164,88,.5)}
.glv-more{background:none;border:0;padding:3px 0 0;color:#39c7df;font:600 12.5px -apple-system,system-ui,sans-serif;cursor:pointer}
.glv-body{margin-top:4px;padding:8px 10px;border-radius:8px;background:#06141a;color:#c8dde3;font-size:14px;white-space:pre-wrap;max-height:320px;overflow:auto;cursor:text}
.glv-note{margin-top:5px;padding:6px 9px;border-radius:8px;background:rgba(224,164,88,.12);border:1px solid rgba(224,164,88,.35);color:#f0c98e;font-size:14.5px;white-space:pre-wrap;cursor:text}
.glv-note.add{background:none;border-style:dashed;color:#8a7a5e;font-size:13px}
.glv-note-in{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:7px 9px;border-radius:8px;background:#06141a;border:1px solid #e0a458;color:#e7f3f6;font:15px/1.4 -apple-system,system-ui,sans-serif;resize:vertical}
.glv-rsnip mark.hl.star,.er-s mark.hl.star{background:rgba(224,164,88,.32);color:#ffe0a8}
.glv-rsnip mark.hl{background:rgba(224,164,88,.2);color:#ffd28a;border-radius:3px;padding:0 2px;font-weight:700}
.glv-gm{margin-left:12px;color:#64838d;font-size:12.5px;text-decoration:none}.glv-gm:hover{color:#39c7df}
.glv-chip.bk{cursor:pointer}.glv-chip.cB b{color:#e5533a}.glv-chip.cD b{color:#e0a458}
@media (hover:none){.glv-ck,.glv-arch{opacity:1}}
@media (max-width:600px){
  .glv{padding:0 10px calc(24px + env(safe-area-inset-bottom))}
  .glv-cols{flex-direction:column;gap:0}.glv-col{width:100%}
  .glv-bar{padding-top:max(8px, env(safe-area-inset-top))}
  .glv-row{padding:9px 11px;border-radius:11px}
  .glv-rf{font-size:17px}.glv-rs{font-size:16px}.glv-rsnip{font-size:14.5px}.glv-rw{font-size:13px}.glv-adv{font-size:14.5px}
  .glv-star{font-size:20px;padding:0 4px}
  .glv-ck{height:30px;padding:0 10px;font-size:11px}
  .glv-btn{height:34px}
  .glv-bh h2{font-size:17px}
  .glv-st{flex-basis:100%;order:9}
}
`;
  document.head.appendChild(s);
}

// ── Avatar letter + color ──────────────────────────────────────────────────────

var SH_URL = 'https://mail.superhuman.com/rbenjamini@gmail.com/thread/';
var IS_PHONE = /iPhone|iPod|Android/.test(navigator.userAgent);
var COLORS = ['#1a5a7a','#2a6a4a','#5a3a7a','#7a3a2a','#1a4a7a','#3a6a2a','#7a2a4a','#1a7a6a'];
function avatarColor(key) {
  var n = 0; for (var i = 0; i < key.length; i++) n = (n*31 + key.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
}

// ── Scan buckets ───────────────────────────────────────────────────────────────
// Same A–E buckets as the Scan tab (emailrun.js). A thread the Email run already
// sorted keeps its bucket/project/summary; others borrow the sender's last
// project, and starred → D, your always-archive senders / Gmail promotions → A, the rest → New.

var BUCKETS = [
  ['D', '⭐ Starred · action'], ['C', '✍️ Reply'], ['B', "⚠️ Don't miss"],
  ['N', '📥 Older — not sorted'],  ['E', '📄 Everything else'], ['A', '🗄 Archive']
];
var _scan = { byThread: {}, bySender: {}, loaded: false };

async function loadScan() {
  var key = window.TE && TE.key && TE.key(); if (!key || _scan.loaded) return;
  _scan.byThread = {}; _scan.bySender = {};
  var base = (TE.base && TE.base()) || 'appdDTNBbVrp6hVOv', off = '', recs = [];
  var flds = ['ThreadId','FromEmail','Bucket','Project','Summary','Advice','RunAt'].map(function(f){ return 'fields%5B%5D=' + f; }).join('&');
  try {
    do {
      var r = await fetch('https://api.airtable.com/v0/' + base + '/tblIl26oggXP4WtvE?pageSize=100&' + flds + (off ? '&offset=' + off : ''),
                          { headers: { Authorization: 'Bearer ' + key } });
      if (!r.ok) break;
      var d = await r.json(); recs = recs.concat(d.records || []); off = d.offset || '';
    } while (off);
  } catch (e) { return; }
  recs.map(function(r){ return r.fields; }).sort(function(a, b){ return String(a.RunAt||'').localeCompare(String(b.RunAt||'')); })
    .forEach(function(f){
      var b = f.Bucket && typeof f.Bucket === 'object' ? f.Bucket.name : f.Bucket;
      var rec = { bucket: String(b || '').charAt(0), project: f.Project || '', summary: f.Summary || '', advice: f.Advice || '' };
      if (f.ThreadId) _scan.byThread[f.ThreadId] = rec;
      if (f.FromEmail) _scan.bySender[String(f.FromEmail).toLowerCase()] = rec;
    });
  _scan.loaded = true;
  loadNotes();
}

// ── To-do notes on starred emails (Airtable EmailNotes, so every device sees them) ──
var NOTES_TBL = 'tbl90HorcK1relti7';
function atUrl(rest) { return 'https://api.airtable.com/v0/' + ((TE.base && TE.base()) || 'appdDTNBbVrp6hVOv') + '/' + NOTES_TBL + (rest || ''); }
function atHdr() { return { Authorization: 'Bearer ' + TE.key(), 'Content-Type': 'application/json' }; }
async function loadNotes() {
  var off = '';
  try {
    do {
      var r = await fetch(atUrl('?pageSize=100' + (off ? '&offset=' + off : '')), { headers: atHdr() });
      if (!r.ok) return;
      var d = await r.json(); off = d.offset || '';
      (d.records || []).forEach(function(x){ if (x.fields.ThreadId) _notes[x.fields.ThreadId] = { rid: x.id, note: x.fields.Note || '' }; });
    } while (off);
  } catch (e) { return; }
  rebuildList(_listEl);
}
async function saveNote(t, text) {
  text = text.trim(); var cur = _notes[t.id];
  if (!window.TE || !TE.key || !TE.key()) throw new Error('no Airtable key');
  if (!text) {
    if (cur) await fetch(atUrl('/' + cur.rid), { method: 'DELETE', headers: atHdr() });
    delete _notes[t.id]; return;
  }
  var fields = { ThreadId: t.id, Note: text, Subject: t.subject, From: t.senderName + ' <' + t.senderEmail + '>' };
  var r = await fetch(atUrl(cur ? '/' + cur.rid : ''), { method: cur ? 'PATCH' : 'POST', headers: atHdr(), body: JSON.stringify({ fields: fields }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var d = await r.json(); _notes[t.id] = { rid: d.id, note: text };
}

// "Keep" = skip this thread in Archive all (this browser only).
var KEEP_KEY = 'gl.keep';
var _keep = {}; try { _keep = JSON.parse(localStorage.getItem(KEEP_KEY) || '{}'); } catch (e) {}
function toggleKeep(t) { if (_keep[t.id]) delete _keep[t.id]; else _keep[t.id] = 1; try { localStorage.setItem(KEEP_KEY, JSON.stringify(_keep)); } catch (e) {} }

// Always-archive senders live in Gmail as the label "ER/Always archive", so every
// device (and Superhuman) sees the same rules. Cache: threadId → sender email.
var RULE_LABEL = 'ER/Always archive', RULE_KEY = 'gl.rules';
var _rule = { id: '', byThread: {}, senders: {} };
try { _rule.byThread = JSON.parse(localStorage.getItem(RULE_KEY) || '{}'); } catch (e) {}
function ruleSenders() {
  _rule.senders = {};
  Object.keys(_rule.byThread).forEach(function(k){ _rule.senders[_rule.byThread[k]] = 1; });
  try { localStorage.setItem(RULE_KEY, JSON.stringify(_rule.byThread)); } catch (e) {}
}
ruleSenders();
async function ruleLabelId(create) {
  if (_rule.id) return _rule.id;
  var ls = (await gfetch('labels')).labels || [];
  var l = ls.filter(function(x){ return x.name === RULE_LABEL; })[0];
  if (!l && create) l = await gfetch('labels', { method: 'POST', body: JSON.stringify({ name: RULE_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) });
  return (_rule.id = l ? l.id : '');
}
async function loadRules() {
  var id = await ruleLabelId(false); if (!id) return;
  var ids = [], pt = '';
  do {
    var r = await gfetch('threads?maxResults=500&labelIds=' + id + (pt ? '&pageToken=' + pt : ''));
    ids = ids.concat((r.threads || []).map(function(t){ return t.id; })); pt = r.nextPageToken || '';
  } while (pt);
  var fresh = {}, need = [];
  ids.forEach(function(k){ if (_rule.byThread[k]) fresh[k] = _rule.byThread[k]; else need.push(k); });
  await pool(need, 5, function(k){
    return gfetch('threads/' + k + '?format=METADATA&metadataHeaders=From').then(function(t){
      fresh[k] = parseSender(hdr((t.messages || [])[0] || {}, 'From')).email.toLowerCase();
    }).catch(function(){});
  });
  _rule.byThread = fresh; ruleSenders();
}
async function setAlways(t, on) {
  var em = (t.senderEmail || '').toLowerCase(), id = await ruleLabelId(true);
  if (on) {
    await apiModify(t.id, { addLabelIds: [id] }); _rule.byThread[t.id] = em;
  } else {
    var ks = Object.keys(_rule.byThread).filter(function(k){ return _rule.byThread[k] === em; });
    await pool(ks, 5, function(k){ return apiModify(k, { removeLabelIds: [id] }).catch(function(){}); });
    ks.forEach(function(k){ delete _rule.byThread[k]; });
  }
  ruleSenders();
}

function classify(t) {
  var r = _scan.byThread[t.id], snd = _scan.bySender[(t.senderEmail || '').toLowerCase()];
  var project = (r && r.project) || (snd ? snd.project : '');
  if (t.starred) return { b: 'D', project: project, summary: r && r.summary, advice: r && r.advice };
  if (_rule.senders[(t.senderEmail || '').toLowerCase()]) return { b: 'A', project: project, summary: r && r.summary, always: true };
  if (r && r.bucket) return { b: r.bucket, project: r.project, summary: r.summary, advice: r.advice, sorted: true };
  if (snd && (snd.bucket === 'A' || snd.bucket === 'E')) return { b: snd.bucket, project: project, guess: true };
  if (t.labels.some(function(l){ return /^CATEGORY_(PROMOTIONS|SOCIAL|FORUMS)$/.test(l); })) return { b: 'A', project: project, guess: true };
  return { b: 'N', project: project };
}

// Queue a Scan request (same as Scan tab's "Run now"); the Email run picks it up at 8a / 12p.
var _sortQueued = false;
function queueSort(btn) {
  btn.textContent = '…'; btn.disabled = true;
  var now = new Date().toISOString();
  fetch('https://api.airtable.com/v0/' + ((TE.base && TE.base()) || 'appdDTNBbVrp6hVOv') + '/tblpkdXhqbqN1XFDd', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TE.key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { Name: 'Email run ' + new Date().toLocaleString(), Kind: 'Scan', Status: 'Requested', RequestedAt: now }, typecast: true })
  }).then(function(r){ if (!r.ok) throw 0; _sortQueued = true; rebuildList(_listEl); })
    .catch(function(){ btn.textContent = 'Failed — tap again'; btn.disabled = false; });
}

function archiveThreads(list, btn) {
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  return pool(list, 8, function(t){ return apiModify(t.id, { removeLabelIds: ['INBOX'] }); }).then(function(){
    var ids = list.map(function(t){ return t.id; });
    _threads = _threads.filter(function(t){ return ids.indexOf(t.id) < 0; });
    if (_total) _total = Math.max(0, _total - ids.length);
    rebuildList(_listEl);
  }).catch(function(){ if (btn) { btn.textContent = 'Error'; btn.disabled = false; } });
}

// ── Grouping ───────────────────────────────────────────────────────────────────

function groupThreads(arr) {
  var map = {}, order = [];
  for (var i = 0; i < arr.length; i++) {
    var t = arr[i], k = t.senderName.toLowerCase();
    if (!map[k]) { map[k] = { key: k, label: t.senderName, threads: [], latest: t.date, hasUnread: false }; order.push(k); }
    map[k].threads.push(t);
    if (t.date > map[k].latest) map[k].latest = t.date;
    if (t.unread) map[k].hasUnread = true;
  }
  var groups = order.map(function(k){ return map[k]; });
  groups.forEach(function(g){ g.threads.sort(function(a,b){ return b.date - a.date; }); });
  // Sort: unread groups first, then by most recent
  groups.sort(function(a,b){
    if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
    return b.latest - a.latest;
  });
  return groups;
}

// ── DOM: single thread row ─────────────────────────────────────────────────────

function makeRow(t, showSender) {
  var div = document.createElement('div');
  div.className = 'glv-row' + (t.unread ? ' unr' : '');

  var h = document.createElement('div'); h.className = 'glv-rh';

  var star = document.createElement('button'); star.className = 'glv-star' + (t.starred ? ' on' : '');
  star.textContent = t.starred ? '★' : '☆';
  star.addEventListener('click', function(e) {
    e.stopPropagation(); var was = t.starred; t.starred = !was;
    star.className = 'glv-star' + (t.starred ? ' on' : '');
    star.textContent = t.starred ? '★' : '☆';
    rebuildList(_listEl);
    apiModify(t.id, was ? {removeLabelIds:['STARRED']} : {addLabelIds:['STARRED']})
      .catch(function(){ t.starred = was; rebuildList(_listEl); });
  });

  var from = document.createElement('span'); from.className = 'glv-rf';
  from.textContent = showSender ? t.senderName : t.subject;
  from.title = t.senderEmail;

  var when = document.createElement('span'); when.className = 'glv-rw'; when.textContent = fmtDate(t.date);

  if (t.msgCount > 1) {
    var mc = document.createElement('span'); mc.className = 'glv-mc'; mc.textContent = t.msgCount;
    h.append(star, from, mc, when);
  } else {
    h.append(star, from, when);
  }

  var arch = document.createElement('button'); arch.className = 'glv-ck'; arch.textContent = 'Archive';
  arch.addEventListener('click', function(e) {
    e.stopPropagation(); arch.textContent = '…'; arch.disabled = true;
    apiModify(t.id, {removeLabelIds:['INBOX']}).then(function(){
      _threads = _threads.filter(function(x){ return x.id !== t.id; });
      rebuildList(_listEl);
    }).catch(function(){ arch.textContent = '!'; arch.disabled = false; });
  });
  var c = t._c || {};
  if (c.b === 'A' || c.b === 'E' || c.b === 'N') {
    var kp = document.createElement('button'); kp.className = 'glv-ck' + (_keep[t.id] ? ' on' : '');
    kp.textContent = _keep[t.id] ? '📌 Kept' : 'Keep';
    kp.title = 'Keep = skip this one when you press Archive all';
    kp.addEventListener('click', function(e){ e.stopPropagation(); toggleKeep(t); rebuildList(_listEl); });
    h.appendChild(kp);
  }
  var al = document.createElement('button'); al.className = 'glv-ck' + (c.always ? ' on' : '');
  al.textContent = c.always ? '✕ Always-archive' : 'Always archive';
  al.title = c.always ? 'Stop putting this sender in Archive' : 'Put this sender in Archive from now on (Gmail label "' + RULE_LABEL + '")';
  al.addEventListener('click', function(e){
    e.stopPropagation(); al.textContent = '…'; al.disabled = true;
    setAlways(t, !c.always).then(function(){ rebuildList(_listEl); }).catch(function(){ al.textContent = '!'; al.disabled = false; });
  });
  h.append(al, arch);

  div.appendChild(h);

  var body = document.createElement('div'); body.className = 'glv-rs';
  body.textContent = showSender ? t.subject : (t.snippet || '');
  div.appendChild(body);

  if (c.summary) {
    var sm = document.createElement('div'); sm.className = 'glv-rsnip sum'; sm.innerHTML = hlText(c.summary);
    div.appendChild(sm);
  }
  if (showSender && t.snippet) {
    var snip = document.createElement('div'); snip.className = 'glv-rsnip'; snip.textContent = t.snippet;
    div.appendChild(snip);
  }
  if (c.advice) {
    var adv = document.createElement('div'); adv.className = 'glv-adv'; adv.textContent = '→ ' + c.advice;
    div.appendChild(adv);
  }

  // Starred → a to-do note you type (saved to Airtable).
  if (c.b === 'D') {
    var nt = _notes[t.id];
    if (_editing === t.id) {
      var ta = document.createElement('textarea'); ta.className = 'glv-note-in'; ta.rows = 2;
      ta.placeholder = 'To-do for this email… (Enter = save, Esc = cancel)';
      ta.value = _draft;
      ta.addEventListener('click', function(e){ e.stopPropagation(); });
      ta.addEventListener('input', function(){ _draft = ta.value; });
      ta.addEventListener('keydown', function(e){
        if (e.key === 'Escape') { _editing = null; rebuildList(_listEl); }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      });
      ta.addEventListener('blur', commit);
      function commit() {
        if (_editing !== t.id) return;
        var v = ta.value; _editing = null; ta.disabled = true;
        saveNote(t, v).then(function(){ rebuildList(_listEl); })
          .catch(function(){ _editing = t.id; _draft = v; rebuildList(_listEl); alert('Note not saved (Airtable). Try again.'); });
      }
      div.appendChild(ta);
      setTimeout(function(){ if (document.activeElement !== ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 0);
    } else {
      var nb = document.createElement('div'); nb.className = 'glv-note' + (nt ? '' : ' add');
      nb.textContent = nt ? '📝 ' + nt.note : '＋ add to-do note';
      nb.addEventListener('click', function(e){ e.stopPropagation(); _editing = t.id; _draft = nt ? nt.note : ''; rebuildList(_listEl); });
      div.appendChild(nb);
    }
  }

  // ▸ more: the email's own text, right here.
  var mo = document.createElement('button'); mo.className = 'glv-more'; mo.textContent = _bodies[t.id] ? '▾ less' : '▸ more';
  div.appendChild(mo);
  if (_bodies[t.id]) {
    var bd = document.createElement('div'); bd.className = 'glv-body'; bd.textContent = _bodies[t.id];
    bd.addEventListener('click', function(e){ e.stopPropagation(); });
    div.appendChild(bd);
  }
  mo.addEventListener('click', function(e){
    e.stopPropagation();
    if (_bodies[t.id]) { delete _bodies[t.id]; rebuildList(_listEl); return; }
    mo.textContent = '…';
    apiBody(t.id).then(function(txt){ _bodies[t.id] = (txt || '(no text)').slice(0, 1500); rebuildList(_listEl); })
      .catch(function(){ mo.textContent = '▸ more (failed, tap again)'; });
  });

  // Click → Superhuman (same thread id as Gmail). ✉️ = open in Gmail instead.
  var gm = document.createElement('a'); gm.className = 'glv-gm'; gm.textContent = '✉️ Gmail'; gm.title = 'Open in Gmail';
  gm.href = 'https://mail.google.com/mail/u/0/#inbox/' + t.id; gm.target = '_blank'; gm.rel = 'noopener';
  gm.addEventListener('click', function(e){ e.stopPropagation(); });
  mo.after(gm);
  div.title = 'Open in Superhuman';
  div.addEventListener('click', function(){ window.open(SH_URL + t.id, IS_PHONE ? '_blank' : 'sh-pane'); });
  return div;
}

// ── DOM: sender section ────────────────────────────────────────────────────────

function makeSection(g) {
  var isOpen  = _expanded[g.key] === true;
  var isMulti = g.threads.length > 1;
  var sec = document.createElement('div'); sec.className = 'glv-sec';

  if (isMulti) {
    // Collapsible header
    var sh = document.createElement('div'); sh.className = 'glv-sh';

    var sl = document.createElement('span'); sl.className = 'glv-sl';
    sl.style.background = avatarColor(g.key);
    sl.textContent = g.label.charAt(0).toUpperCase();

    var sn = document.createElement('span'); sn.className = 'glv-sn'; sn.textContent = g.label;
    var sc = document.createElement('i'); sc.className = 'glv-sc'; sc.textContent = g.threads.length;
    var xi = document.createElement('span'); xi.className = 'glv-xi'; xi.textContent = isOpen ? '▾' : '▸';

    var arch = document.createElement('button'); arch.className = 'glv-arch'; arch.textContent = 'Archive all';
    arch.addEventListener('click', function(e) {
      e.stopPropagation(); arch.textContent = '…'; arch.disabled = true;
      Promise.all(g.threads.map(function(t){ return apiModify(t.id,{removeLabelIds:['INBOX']}); }))
        .then(function(){
          var ids = g.threads.map(function(t){ return t.id; });
          _threads = _threads.filter(function(t){ return ids.indexOf(t.id) < 0; });
          rebuildList(_listEl);
        }).catch(function(){ arch.textContent = 'Err'; arch.disabled = false; });
    });

    sh.append(sl, sn, sc, arch, xi);
    sh.addEventListener('click', function(e) {
      if (e.target === arch || arch.contains(e.target)) return;
      _expanded[g.key] = !isOpen; rebuildList(_listEl);
    });
    sec.appendChild(sh);

    if (isOpen) {
      var list = document.createElement('div'); list.className = 'glv-list';
      g.threads.forEach(function(t){ list.appendChild(makeRow(t, false)); });
      sec.appendChild(list);
    }
  } else {
    // Single thread — flat row showing sender name
    sec.appendChild(makeRow(g.threads[0], true));
  }

  return sec;
}

// ── Rebuild list ───────────────────────────────────────────────────────────────

function rebuildList(listEl) {
  if (!listEl) return;
  _listEl = listEl;
  var frag = document.createDocumentFragment();
  var by = {};
  _threads.forEach(function(t){ t._c = classify(t); (by[t._c.b] = by[t._c.b] || []).push(t); });

  // Fixed columns so archiving a row never reflows sections across columns.
  var cols = document.createElement('div'); cols.className = 'glv-cols';
  // Wide screens: 3 columns (D | C B Older | E A); else 2 (D C B | Older E A); phones stack.
  var three = (listEl.clientWidth || window.innerWidth) >= 1300;
  var colA = document.createElement('div'), colB = document.createElement('div'), colC = document.createElement('div');
  colA.className = colB.className = colC.className = 'glv-col';
  cols.append(colA, colB); if (three) cols.appendChild(colC);
  function colFor(L) { return three ? (L === 'D' ? colA : 'CBN'.indexOf(L) >= 0 ? colB : colC) : ('DCB'.indexOf(L) >= 0 ? colA : colB); }
  BUCKETS.forEach(function(bk){
    var L = bk[0], its = by[L]; if (!its || !its.length) return;
    its.sort(function(a, b){ return b.date - a.date; });
    var sec = document.createElement('section'); sec.className = 'glv-bk glv-' + L; sec.id = 'glv-' + L;
    var open = _expanded['bk-' + L] !== undefined ? _expanded['bk-' + L] : L !== 'A';
    var sh = document.createElement('div'); sh.className = 'glv-bh';
    sh.innerHTML = '<span class="glv-sl">' + (L === 'N' ? '•' : L) + '</span><h2></h2><i class="glv-sc">' + its.length + '</i><span class="glv-xi">' + (open ? '▾' : '▸') + '</span>';
    sh.querySelector('h2').textContent = bk[1];
    if (L === 'A' || L === 'E' || L === 'N') {
      var go = its.filter(function(t){ return !_keep[t.id]; }), kept = its.length - go.length;
      var all = document.createElement('button'); all.className = 'glv-btn glv-aa';
      all.textContent = 'Archive ' + (kept ? go.length + ' (' + kept + ' kept)' : 'all ' + go.length);
      all.disabled = !go.length;
      all.addEventListener('click', function(e){ e.stopPropagation();
        if (confirm('Archive ' + go.length + ' in "' + bk[1] + '"?' + (kept ? ' (' + kept + ' kept stay)' : ''))) archiveThreads(go, all); });
      sh.insertBefore(all, sh.querySelector('.glv-xi'));
    }
    if (L === 'N' && window.TE && TE.key && TE.key()) {
      var srt = document.createElement('button'); srt.className = 'glv-btn glv-aa ok';
      srt.textContent = _sortQueued ? '⏳ Queued — sorts at 8a / 12p' : '✉ Sort these';
      srt.disabled = !!_sortQueued;
      srt.title = 'Queue an Email run. It sorts up to 100 of these per run (newest first).';
      srt.addEventListener('click', function(e){ e.stopPropagation(); queueSort(srt); });
      sh.insertBefore(srt, sh.querySelector('.glv-xi'));
    }
    sh.addEventListener('click', function(){ _expanded['bk-' + L] = !open; rebuildList(_listEl); });
    sec.appendChild(sh);
    if (open) {
      var list = document.createElement('div'); list.className = 'glv-list';
      if (L === 'N') {
        groupThreads(its).forEach(function(g){ list.appendChild(makeSection(g)); });
      } else {
        var g = {};
        its.forEach(function(t){ var k = t._c.project || 'Other'; (g[k] = g[k] || []).push(t); });
        Object.keys(g).sort(function(a, b){ return (a === 'Other') - (b === 'Other') || g[b].length - g[a].length || a.localeCompare(b); })
          .forEach(function(k){
            var ph = document.createElement('div'); ph.className = 'glv-pj'; ph.textContent = k + ' ';
            var pi = document.createElement('i'); pi.textContent = g[k].length; ph.appendChild(pi);
            list.appendChild(ph);
            g[k].forEach(function(t){ list.appendChild(makeRow(t, true)); });
          });
      }
      sec.appendChild(list);
    }
    colFor(L).appendChild(sec);
  });
  frag.appendChild(cols);

  if (_loading) {
    var n = _threads.length, est = _total || 0;
    var pct = est > 0 ? Math.round(n / est * 100) : 0;
    var spin = document.createElement('div'); spin.className = 'glv-spin';
    spin.textContent = n ? ('Loading… ' + n + (est?' of '+est:'') + (pct?' ('+pct+'%)':'')) : 'Loading inbox…';
    frag.appendChild(spin);
  } else if (_threads.length === 0 && !_error) {
    var empty = document.createElement('div'); empty.className = 'glv-empty';
    empty.textContent = 'Inbox zero 🎉';
    frag.appendChild(empty);
  }

  var sc = listEl.closest('.pg-panel') || document.scrollingElement, y = sc.scrollTop;
  listEl.replaceChildren(frag);
  sc.scrollTop = y;
}

// ── Screens ────────────────────────────────────────────────────────────────────

function buildSetupScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'glv';
  var d = document.createElement('div'); d.className = 'glv-setup';
  d.innerHTML = [
    '<h3>Live Gmail</h3>',
    '<p>Paste your Google OAuth 2.0 Client ID to connect.</p>',
    '<p>Need one? <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud → Credentials</a>',
    ' → Create OAuth client → Web application',
    ' → Authorized JS origin: <code>https://gse281.github.io</code></p>',
    '<label style="display:block;font-size:11px;color:#8aa6af;margin-bottom:5px">OAuth Client ID</label>',
    '<input id="glv-cid" type="text" placeholder="….apps.googleusercontent.com">',
    '<button id="glv-cid-save" class="glv-btn ok" style="margin-top:10px">Save & Connect</button>',
    '<p style="color:#2a4a5a;font-size:11px;margin-top:14px">Add yourself under OAuth consent screen → Audience as a test user.</p>'
  ].join('');
  wrap.appendChild(d); host.appendChild(wrap);
  wrap.querySelector('#glv-cid-save').addEventListener('click', function() {
    var cid = wrap.querySelector('#glv-cid').value.trim(); if (!cid) return;
    _cfg.gmailClientId = cid;
    try { var c = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); c.gmailClientId = cid; localStorage.setItem('tb.cfg', JSON.stringify(c)); } catch(e) {}
    _gisClient = null; _authed = false; mount(host, _cfg);
  });
}

function buildConnectScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'glv';
  var d = document.createElement('div'); d.className = 'glv-connect';
  var btn = document.createElement('button'); btn.className = 'glv-btn ok';
  btn.style.cssText = 'font-size:14px;padding:0 24px;height:38px';
  btn.textContent = 'Sign in with Google';
  btn.addEventListener('click', function() {
    btn.textContent = 'Opening…'; btn.disabled = true;
    signIn().then(function(tok) {
      if (tok) loadPage(true);
      else { btn.textContent = 'Sign in with Google'; btn.disabled = false; }
    });
  });
  var note = document.createElement('p');
  note.textContent = 'Sign-in lasts ~1 hour. To stay signed in for good, set up the backend below (once).';

  // Stay-signed-in setup: a tiny Apps Script web app in your own Google account.
  var key = backendKey() || newKey();
  var code = "var KEY = '" + key + "';\n" +
    "function doPost(e) {\n" +
    "  var b = {}; try { b = JSON.parse(e.postData.contents); } catch (x) {}\n" +
    "  var out = b.k === KEY ? { access_token: ScriptApp.getOAuthToken(), expires_in: 900 } : { error: 'denied' };\n" +
    "  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);\n" +
    "}\n";
  var manifest = JSON.stringify({
    timeZone: 'America/New_York', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER',
    oauthScopes: [SCOPE],
    dependencies: { enabledAdvancedServices: [{ userSymbol: 'Gmail', serviceId: 'gmail', version: 'v1' }] },
    webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
  }, null, 2);

  var be = document.createElement('div'); be.className = 'glv-be';
  be.innerHTML = [
    '<b>Stay signed in — one-time setup (~3 min)</b>',
    '<ol>',
    '<li>Open <a href="https://script.google.com/home/projects/create" target="_blank">script.google.com → New project</a>.</li>',
    '<li>Select all the code there, delete it, then <button class="glv-btn" data-copy="code">Copy code</button> and paste.</li>',
    '<li>⚙︎ Project Settings → tick <i>Show "appsscript.json"</i>. Back in Editor open <code>appsscript.json</code>, select all, ',
    '<button class="glv-btn" data-copy="manifest">Copy settings</button> and paste. Save (⌘S).</li>',
    '<li>Deploy → New deployment → ⚙︎ type <b>Web app</b> → Execute as <b>Me</b>, Who has access <b>Anyone</b> → Deploy.</li>',
    '<li>Authorize access → pick your account → <i>Advanced</i> → <i>Go to … (unsafe)</i> → Allow. It\'s your own script.</li>',
    '<li>Copy the <b>Web app URL</b> (ends in <code>/exec</code>) and paste here:</li>',
    '</ol>',
    '<input id="glv-bk" type="text" placeholder="https://script.google.com/macros/s/…/exec"> ',
    '<button id="glv-bk-save" class="glv-btn ok">Save & connect</button>',
    '<div id="glv-bk-msg"></div>'
  ].join('');
  be.querySelector('#glv-bk').value = (_cfg && _cfg.gmailBackend) || '';
  if (_error && _error !== 'auth') be.querySelector('#glv-bk-msg').textContent = _error;
  be.querySelectorAll('[data-copy]').forEach(function(b) {
    b.addEventListener('click', function() {
      navigator.clipboard.writeText(b.dataset.copy === 'code' ? code : manifest);
      var t = b.textContent; b.textContent = '✓ Copied'; setTimeout(function(){ b.textContent = t; }, 1500);
    });
  });
  be.querySelector('#glv-bk-save').addEventListener('click', function() {
    var u = be.querySelector('#glv-bk').value.trim();
    var msg = be.querySelector('#glv-bk-msg');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
      msg.textContent = 'That is not a Web app URL. It starts with https://script.google.com/macros/s/ and ends with /exec.';
      return;
    }
    saveBackend(u, key); _token = null; _authed = false; _error = null; clearToken();
    msg.textContent = 'Connecting…';
    backendToken().then(function(tok) {
      if (tok) loadPage(true); else msg.textContent = _error || 'Could not connect';
    });
  });

  d.append(btn, note, be); wrap.appendChild(d); host.appendChild(wrap);
}

function buildPanel(host) {
  var sc = host.closest('.pg-panel') || document.scrollingElement, y0 = sc.scrollTop;
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'glv';

  // Sticky bar
  var bar = document.createElement('div'); bar.className = 'glv-bar';

  var refreshBtn = document.createElement('button'); refreshBtn.className = 'glv-btn';
  refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.addEventListener('click', function() { _expanded = {}; _scan.loaded = false; loadScan().then(function(){ rebuildList(_listEl); }); loadPage(true); });
  bar.appendChild(refreshBtn);

  if (backendUrl()) {
    var devBtn = document.createElement('button'); devBtn.className = 'glv-btn';
    devBtn.textContent = '📱 Link for other devices';
    devBtn.title = 'Open this link once on your phone/other computer to connect it. It holds your keys — only send it to yourself.';
    devBtn.addEventListener('click', function() {
      var at = window.TE && TE.key && TE.key();
      var link = location.origin + location.pathname + '#gb=' + encodeURIComponent(backendUrl()) + '|' + backendKey() +
                 (at ? '&at=' + encodeURIComponent(at) : '');
      navigator.clipboard.writeText(link); devBtn.textContent = '✓ Copied — open it on the other device';
      setTimeout(function(){ devBtn.textContent = '📱 Link for other devices'; }, 2500);
    });
    bar.appendChild(devBtn);
  }

  // Chips: total + unread count
  var chips = document.createElement('div'); chips.className = 'glv-chips';
  if (_total != null) {
    var c1 = document.createElement('span'); c1.className = 'glv-chip';
    c1.innerHTML = '📥 <b>' + _total + '</b> in inbox';
    chips.appendChild(c1);
  }
  var counts = {};
  _threads.forEach(function(t){ var b = (t._c || classify(t)).b; counts[b] = (counts[b] || 0) + 1; });
  BUCKETS.forEach(function(bk){
    if (!counts[bk[0]]) return;
    var c = document.createElement('a'); c.className = 'glv-chip bk c' + bk[0]; c.href = '#glv-' + bk[0];
    c.innerHTML = '<b>' + (bk[0] === 'N' ? 'Older' : bk[0]) + '</b> ' + counts[bk[0]];
    c.title = bk[1];
    chips.appendChild(c);
  });
  bar.appendChild(chips);

  var st = document.createElement('div'); st.className = 'glv-st';
  if (_loading) {
    st.innerHTML = '<span class="glv-run">Loading… ' + _threads.length + (_total?' of '+_total:'') + ' loaded</span>';
  } else if (_error === 'busy') {
    st.innerHTML = '<span class="glv-run">' + _threads.length + ' of ' + (_total || '?') + ' loaded · Gmail per-minute limit hit, continuing in 1 min (next time it\'s instant — cached)</span>';
  } else if (_error && _error !== 'auth') {
    st.innerHTML = '<span style="color:#e5533a">' + _error + '</span> ';
    var rb = document.createElement('button'); rb.className = 'glv-btn'; rb.textContent = 'Retry';
    rb.addEventListener('click', function(){ loadPage(true); });
    st.appendChild(rb);
  } else if (_threads.length) {
    st.textContent = _threads.length + ' of ' + (_total || _threads.length) + ' loaded' + (_scan.loaded ? '' : ' · sorting by sender only (no Airtable key)') + ' ';
    if (_nextPage) {
      var lm = document.createElement('button'); lm.className = 'glv-btn'; lm.textContent = 'Load more';
      lm.addEventListener('click', function(){ loadPage(false); });
      st.appendChild(lm);
    }
  }
  bar.appendChild(st);

  var list = document.createElement('div'); list.className = 'glv-list'; list.style.marginTop = '0';
  _listEl = list;

  wrap.append(bar, list);
  host.appendChild(wrap);
  rebuildList(list);
  sc.scrollTop = y0;
}

// ── Redraw ─────────────────────────────────────────────────────────────────────

function redraw() {
  if (!_host) return;
  if (!_cfg || !_cfg.gmailClientId) { buildSetupScreen(_host); return; }
  if (_error === 'auth')            { buildConnectScreen(_host); return; }
  if (!_authed && !_loading)        { buildConnectScreen(_host); return; }
  buildPanel(_host);
}

// ── Mount ──────────────────────────────────────────────────────────────────────

function mount(host, cfg) {
  addCss(); _cfg = cfg; _host = host;
  if (_linkBackend) cfg.gmailBackend = _linkBackend;
  if (_linkApiKey && !cfg.apiKey) cfg.apiKey = _linkApiKey;
  loadScan().then(function(){ if (_scan.loaded && _listEl) redraw(); });

  if (!cfg.gmailClientId) { buildSetupScreen(host); return; }

  if (_authed && _token && Date.now() < _exp) {
    loadPage(true); return;
  }

  host.innerHTML = '<div class="glv"><div class="glv-spin">Connecting…</div></div>';

  // Backend mode: no Google popup at all.
  if (backendUrl()) {
    backendToken().then(function(tok) {
      if (tok) loadPage(true);
      else buildConnectScreen(host);
    });
    return;
  }

  (function waitGIS() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      return setTimeout(waitGIS, 150);
    }
    ensureGISClient();
    silentRefresh().then(function(tok) {
      if (tok) { _authed = true; loadPage(true); }
      else buildConnectScreen(host);
    });
  })();
}

var _rz; window.addEventListener('resize', function(){ clearTimeout(_rz); _rz = setTimeout(function(){ rebuildList(_listEl); }, 200); });
window.GL = { mount: mount };
})();
