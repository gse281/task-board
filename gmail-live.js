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
var _linkBackend = '';
(function readSetupLink() {
  var m = location.hash.match(/gb=([^|&]+)\|([0-9a-f]{48})/);
  if (!m) return;
  try {
    _linkBackend = decodeURIComponent(m[1]);
    var c = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); c.gmailBackend = _linkBackend;
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
    _error = d.error === 'denied' ? 'Backend key mismatch — redo setup' : (d.error || 'Backend error');
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
  if ((r.status === 403 || r.status === 429) && (opts._tries || 0) < 4) {
    var n = (opts._tries || 0) + 1;
    await new Promise(function(res){ setTimeout(res, 800 * Math.pow(2, n - 1) + Math.random() * 400); });
    return gfetch(path, Object.assign({}, opts, { _tries: n }));
  }
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

function htmlDecode(s) {
  return (s||'').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
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
  if (reset) { _threads = []; _nextPage = null; _total = null; }
  redraw();
  try {
    var list = await apiListThreads(_nextPage);
    _nextPage = list.nextPageToken || null;
    if (reset || _total == null) {
      try { _total = (await gfetch('labels/INBOX')).threadsTotal; } catch(e) { _total = list.resultSizeEstimate || 0; }
    }
    var fetched = await pool(list.threads || [], 8, function(t){ return apiGetThread(t.id); });
    _threads = _threads.concat(fetched.map(parseThread));
  } catch(e) {
    _error = (e.code === 'auth') ? 'auth' : (e.message || 'Error');
  }
  _loading = false;
  redraw();
  // Auto-load next page
  if (_nextPage && !_error) {
    setTimeout(function(){ loadPage(false); }, 300);
  }
}

// ── CSS — matches scan (emailrun.js) palette exactly ──────────────────────────

var _cssAdded = false;
function addCss() {
  if (_cssAdded) return; _cssAdded = true;
  var s = document.createElement('style');
  s.textContent = `
.glv{padding:0 14px 30px;font:14px/1.4 -apple-system,system-ui,sans-serif;color:#e7f3f6;background:#070d11;min-height:100%}
/* sticky bar */
.glv-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;background:linear-gradient(#070d11 85%,rgba(7,13,17,0))}
.glv-chips{display:flex;gap:5px;flex-wrap:wrap}
.glv-chip{text-decoration:none;color:#e7f3f6;border:1px solid rgba(57,199,223,.3);border-radius:999px;padding:2px 10px;font:600 11.5px ui-monospace,Menlo,monospace;cursor:default}
.glv-chip b{color:#39c7df}
.glv-st{flex:1;min-width:140px;color:#8aa6af;font-size:12.5px}
.glv-run{color:#39c7df;font-weight:700}
/* buttons */
.glv-btn{height:28px;border-radius:8px;border:1px solid rgba(57,199,223,.3);background:rgba(57,199,223,.07);color:#e7f3f6;font:700 11px ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px;white-space:nowrap}
.glv-btn:hover{background:rgba(57,199,223,.15)}
.glv-btn:disabled{opacity:.45;cursor:default}
.glv-btn.ok{background:#30D158;border-color:#30D158;color:#07141a}
/* section header */
.glv-sec{margin-bottom:6px}
.glv-sh{display:flex;align-items:center;gap:7px;padding:6px 2px 5px;cursor:pointer;user-select:none}
.glv-sh:hover .glv-sn{color:#c8e6f0}
.glv-sl{display:inline-block;width:20px;height:20px;border-radius:6px;text-align:center;line-height:20px;font:800 12px ui-monospace,Menlo,monospace;background:rgba(57,199,223,.15);color:#39c7df;flex-shrink:0}
.glv-sn{font-size:13.5px;font-weight:800;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.glv-rf{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.glv-rw{flex:none;color:#64838d;font-size:11px}
.glv-rs{margin-top:2px;color:#bfe3ec;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.glv-row.unr .glv-rs{font-weight:600;color:#daeeff}
.glv-rsnip{margin-top:1px;color:#64838d;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* star */
.glv-star{flex:none;background:none;border:0;cursor:pointer;color:#2a4a5a;font-size:14px;line-height:1;padding:0 2px;user-select:none}
.glv-star.on{color:#f5c518}
.glv-star:hover{color:#f5c518}
/* row actions */
.glv-ck{height:20px;padding:0 7px;font-size:11px;flex:none;height:22px;border-radius:6px;border:1px solid rgba(57,199,223,.2);background:transparent;color:#8aa6af;font:700 10px ui-monospace,Menlo,monospace;cursor:pointer;opacity:0}
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
`;
  document.head.appendChild(s);
}

// ── Avatar letter + color ──────────────────────────────────────────────────────

var COLORS = ['#1a5a7a','#2a6a4a','#5a3a7a','#7a3a2a','#1a4a7a','#3a6a2a','#7a2a4a','#1a7a6a'];
function avatarColor(key) {
  var n = 0; for (var i = 0; i < key.length; i++) n = (n*31 + key.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
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
    apiModify(t.id, was ? {removeLabelIds:['STARRED']} : {addLabelIds:['STARRED']})
      .catch(function(){ t.starred = was; star.className='glv-star'+(t.starred?' on':''); star.textContent=t.starred?'★':'☆'; });
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
  h.appendChild(arch);

  div.appendChild(h);

  var body = document.createElement('div'); body.className = 'glv-rs';
  body.textContent = showSender ? t.subject : (t.snippet || '');
  div.appendChild(body);

  if (showSender && t.snippet) {
    var snip = document.createElement('div'); snip.className = 'glv-rsnip'; snip.textContent = t.snippet;
    div.appendChild(snip);
  }

  div.addEventListener('click', function(){ window.open('https://mail.google.com/mail/u/0/#inbox/'+t.id,'gm-pane'); });
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
  var groups = groupThreads(_threads);

  groups.forEach(function(g){ frag.appendChild(makeSection(g)); });

  if (_loading) {
    var n = _threads.length, est = _total || 0;
    var pct = est > 0 ? Math.round(n / est * 100) : 0;
    var spin = document.createElement('div'); spin.className = 'glv-spin';
    spin.textContent = n ? ('Loading… ' + n + (est?' of ~'+est:'') + (pct?' ('+pct+'%)':'')) : 'Loading inbox…';
    frag.appendChild(spin);
  } else if (_threads.length === 0 && !_error) {
    var empty = document.createElement('div'); empty.className = 'glv-empty';
    empty.textContent = 'Inbox zero 🎉';
    frag.appendChild(empty);
  }

  listEl.replaceChildren(frag);
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
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'glv';

  // Sticky bar
  var bar = document.createElement('div'); bar.className = 'glv-bar';

  var refreshBtn = document.createElement('button'); refreshBtn.className = 'glv-btn';
  refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.addEventListener('click', function() { _expanded = {}; loadPage(true); });
  bar.appendChild(refreshBtn);

  if (backendUrl()) {
    var devBtn = document.createElement('button'); devBtn.className = 'glv-btn';
    devBtn.textContent = '📱 Link for other devices';
    devBtn.title = 'Open this link once on your phone/other computer to connect it';
    devBtn.addEventListener('click', function() {
      var link = location.origin + location.pathname + '#gb=' + encodeURIComponent(backendUrl()) + '|' + backendKey();
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
  var unreadCount = _threads.filter(function(t){ return t.unread; }).length;
  if (unreadCount) {
    var c2 = document.createElement('span'); c2.className = 'glv-chip';
    c2.innerHTML = '<b>' + unreadCount + '</b> unread';
    chips.appendChild(c2);
  }
  bar.appendChild(chips);

  var st = document.createElement('div'); st.className = 'glv-st';
  if (_loading) {
    st.innerHTML = '<span class="glv-run">Loading ' + _threads.length + (_total?' of ~'+_total:'') + ' emails…</span>';
  } else if (_error && _error !== 'auth') {
    st.innerHTML = '<span style="color:#e5533a">' + _error + '</span> ';
    var rb = document.createElement('button'); rb.className = 'glv-btn'; rb.textContent = 'Retry';
    rb.addEventListener('click', function(){ loadPage(true); });
    st.appendChild(rb);
  } else if (_threads.length) {
    var groups = groupThreads(_threads);
    st.textContent = groups.length + ' senders · ' + _threads.length + ' loaded';
  }
  bar.appendChild(st);

  var list = document.createElement('div'); list.className = 'glv-list'; list.style.marginTop = '0';
  _listEl = list;

  wrap.append(bar, list);
  host.appendChild(wrap);
  rebuildList(list);
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

window.GL = { mount: mount };
})();
