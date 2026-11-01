/* gmail-live.js — live Gmail inbox panel v3
   Requires Google Identity Services:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   Public API:  window.GL = { mount(host, cfg) }
*/
(function () {
'use strict';

var SCOPE   = 'https://www.googleapis.com/auth/gmail.modify';
var BASE    = 'https://www.googleapis.com/gmail/v1/users/me/';
var TOK_KEY = 'gl.v3.tok'; // localStorage — persists across tab closes

// ── Auth state ─────────────────────────────────────────────────────────────────
var _cfg       = null;
var _gisClient = null;
var _token     = null;
var _exp       = 0;
var _pendingCB = null;
var _authed    = false;

// Restore from localStorage so sign-in persists until token expires (~1 hr)
(function restoreToken() {
  try {
    var s = localStorage.getItem(TOK_KEY);
    if (s) {
      var p = JSON.parse(s);
      if (p.exp > Date.now() + 120000) { _token = p.tok; _exp = p.exp; _authed = true; }
    }
  } catch(e) {}
})();

// ── Panel state ────────────────────────────────────────────────────────────────
var _threads  = [];
var _nextPage = null;
var _total    = null;
var _loading  = false;
var _error    = null;
var _expanded = {};   // senderKey → bool (true = open; default collapsed for groups)
var _host     = null;
var _listEl   = null;

// ── Auth ───────────────────────────────────────────────────────────────────────

function saveToken() {
  try { localStorage.setItem(TOK_KEY, JSON.stringify({ tok: _token, exp: _exp })); } catch(e) {}
}

function clearToken() {
  try { localStorage.removeItem(TOK_KEY); } catch(e) {}
}

function ensureGISClient() {
  if (_gisClient) return;
  _gisClient = google.accounts.oauth2.initTokenClient({
    client_id: _cfg.gmailClientId,
    scope: SCOPE,
    callback: function (r) {
      if (r && r.access_token) {
        _token = r.access_token;
        _exp   = Date.now() + (Number(r.expires_in || 3540) - 60) * 1000;
        _authed = true;
        saveToken();
      }
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(_token || null); }
    },
    error_callback: function () {
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(null); }
    }
  });
}

function signIn() {
  return new Promise(function (resolve) {
    ensureGISClient();
    _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: 'select_account' });
  });
}

function silentRefresh() {
  if (_token && Date.now() < _exp) return Promise.resolve(_token);
  if (!_gisClient) return Promise.resolve(null);
  return new Promise(function (resolve) {
    _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: 'none' });
  });
}

async function getToken() {
  if (_token && Date.now() < _exp) return _token;
  if (!_authed) return null;
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
  if (r.status === 401) { _token = null; clearToken(); throw Object.assign(new Error('auth'), { code: 'auth' }); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function apiListThreads(pageToken) {
  var qs = 'threads?maxResults=50&labelIds=INBOX';
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
  return (s || '').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
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

async function loadMore(reset) {
  if (_loading) return;
  _loading = true; _error = null;
  if (reset) { _threads = []; _nextPage = null; _total = null; }
  redraw();
  try {
    var list = await apiListThreads(_nextPage);
    _nextPage = list.nextPageToken || null;
    _total = list.resultSizeEstimate || 0;
    var fetched = await Promise.all((list.threads || []).map(function(t){ return apiGetThread(t.id); }));
    _threads = _threads.concat(fetched.map(parseThread));
  } catch(e) {
    _error = (e.code === 'auth') ? 'auth' : (e.message || 'Error');
  }
  _loading = false;
  redraw();
}

// ── CSS ────────────────────────────────────────────────────────────────────────

var _cssAdded = false;
function addCss() {
  if (_cssAdded) return; _cssAdded = true;
  var s = document.createElement('style');
  s.textContent = `
.gl{display:flex;flex-direction:column;height:100%;font:13px/1.45 -apple-system,system-ui,sans-serif;color:#d4eaf2;background:#070d11}

/* toolbar */
.gl-bar{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid #0f2030;flex-shrink:0;background:#08121c;max-width:720px;width:100%}
.gl-btn{background:#0e2030;border:1px solid #1a3548;color:#6a99ad;font-size:12px;padding:4px 11px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap}
.gl-btn:hover{background:#132c42;color:#a8d4e4}
.gl-btn.p{background:#0d3d56;border-color:#1a6882;color:#39c7df}
.gl-btn.p:hover{background:#0e4d6b}
.gl-ct{font-size:11px;color:#2e5a70;flex:1}
.gl-err{font-size:12px;color:#e07070}
.gl-err-bar{display:flex;align-items:center;gap:6px;flex:1}

/* list area */
.gl-list{flex:1;overflow-y:auto;padding:6px 0 16px;max-width:720px;width:100%}

/* ── SENDER GROUP CARD ── */
.gl-card{
  margin: 0 10px 5px;
  background: #0c1d2c;
  border: 1px solid #16303f;
  border-radius: 6px;
  overflow: hidden;
}
.gl-card:hover{border-color:#1e4060}

/* group header row */
.gl-card-hdr{
  display:flex;align-items:center;gap:9px;
  padding:9px 12px;
  cursor:pointer;user-select:none;
  background:#0f2030;
}
.gl-card-hdr:hover{background:#122534}

/* avatar circle */
.gl-av{
  width:28px;height:28px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;color:#fff;flex-shrink:0;
}

/* sender name */
.gl-sname{font-size:13px;font-weight:600;color:#c4e0ed;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* badges / actions */
.gl-scount{
  font-size:11px;font-weight:600;color:#39c7df;
  background:#092030;border:1px solid #1a4a60;
  border-radius:10px;padding:1px 8px;flex-shrink:0;
}
.gl-sdate{font-size:11px;color:#2e5a70;flex-shrink:0;min-width:44px;text-align:right}
.gl-sarch{
  font-size:11px;padding:2px 9px;
  background:#07182a;border:1px solid #1a3a50;
  color:#3a8aac;border-radius:3px;cursor:pointer;
  font-family:inherit;flex-shrink:0;white-space:nowrap;
  opacity:0;transition:opacity .12s;
}
.gl-card-hdr:hover .gl-sarch{opacity:1}
.gl-sarch:hover{background:#0d3d56;border-color:#1a6882;color:#39c7df;opacity:1}
.gl-xi{font-size:11px;color:#2e5a70;flex-shrink:0;width:12px;text-align:center}

/* ── SINGLE-EMAIL ROW (no group header) ── */
.gl-srow{
  display:flex;align-items:center;gap:9px;
  margin: 0 10px 5px;
  padding:9px 12px;
  background:#0c1d2c;
  border:1px solid #16303f;
  border-radius:6px;
  cursor:pointer;
}
.gl-srow:hover{background:#0e2235;border-color:#1e4060}

.gl-srow-mid{flex:1;min-width:0}
.gl-srow-sender{font-size:11px;color:#3a7a9a;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gl-srow-subj{font-size:13px;color:#b0d0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.gl-srow.unr .gl-srow-subj{font-weight:600;color:#daeeff}
.gl-srow-snip{font-size:11px;color:#254a5a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:1.3}
.gl-srow-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.gl-srow-dt{font-size:11px;color:#2e5a70;white-space:nowrap}
.gl-srow-ab{
  font-size:11px;padding:2px 7px;
  background:none;border:1px solid #162530;
  color:#2e5a70;border-radius:3px;cursor:pointer;
  font-family:inherit;opacity:0;transition:opacity .12s;
}
.gl-srow:hover .gl-srow-ab{opacity:1}
.gl-srow-ab:hover{background:#0d3d56;border-color:#1a6882;color:#39c7df;opacity:1}

/* ── THREAD ROWS inside expanded group ── */
.gl-trow{
  display:flex;align-items:flex-start;gap:8px;
  padding:7px 12px 7px 48px;
  border-top:1px solid #0f2030;
  cursor:pointer;
  background:#091824;
}
.gl-trow:hover{background:#0c2030}
.gl-tb{flex:1;min-width:0}
.gl-subj{font-size:13px;color:#98c0d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.gl-trow.unr .gl-subj{font-weight:600;color:#d0eaff}
.gl-snip{font-size:11px;color:#1e3e50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.gl-star{font-size:13px;cursor:pointer;color:#1e3a4a;flex-shrink:0;margin-top:1px;line-height:1;user-select:none}
.gl-star.on{color:#f0c040}
.gl-trow-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.gl-dt{font-size:11px;color:#2e5a70;white-space:nowrap}
.gl-mc{font-size:10px;color:#3a6a7a;background:#091820;border-radius:8px;padding:1px 5px}
.gl-ab{
  font-size:11px;padding:1px 6px;
  background:none;border:1px solid #12263a;
  color:#2e5a70;border-radius:3px;cursor:pointer;
  font-family:inherit;opacity:0;transition:opacity .12s;
}
.gl-trow:hover .gl-ab{opacity:1}
.gl-ab:hover{background:#0d3d56;border-color:#1a6882;color:#39c7df;opacity:1}

/* more / empty / spinner */
.gl-spin{padding:28px;text-align:center;color:#2e5a70;font-size:12px}
.gl-more{padding:8px 10px;flex-shrink:0}
.gl-empty{padding:28px;text-align:center;color:#2e5a70;font-size:13px}

/* setup / connect */
.gl-setup{padding:24px;max-width:500px}
.gl-setup h3{margin:0 0 12px;font-size:15px;color:#c8e6f0;font-weight:600}
.gl-setup p{font-size:12px;color:#4a7a8a;margin:0 0 10px;line-height:1.6}
.gl-setup code{color:#6a9aaa;background:#091820;padding:1px 5px;border-radius:3px;font-size:11px}
.gl-setup a{color:#39c7df}
.gl-setup input{width:100%;background:#091820;border:1px solid #1e3a4a;color:#e7f3f6;padding:7px 10px;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:4px}
.gl-setup input:focus{outline:none;border-color:#39c7df}
.gl-connect{padding:40px 20px;text-align:center}
.gl-connect p{font-size:12px;color:#2e5a70;margin:10px 0 0}
`;
  document.head.appendChild(s);
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

var COLORS = ['#1a5a7a','#2a6a4a','#5a3a7a','#7a3a2a','#1a4a7a','#3a6a2a','#7a2a4a','#1a7a6a'];
function avatarColor(key) {
  var n = 0;
  for (var i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
}
function avatarLetter(label) { return (label||'?').charAt(0).toUpperCase(); }

// ── Grouping ───────────────────────────────────────────────────────────────────

function groupThreads(arr) {
  var map = {}, order = [];
  for (var i = 0; i < arr.length; i++) {
    var t = arr[i], k = t.senderName.toLowerCase();
    if (!map[k]) { map[k] = { key: k, label: t.senderName, threads: [], latest: t.date }; order.push(k); }
    map[k].threads.push(t);
    if (t.date > map[k].latest) map[k].latest = t.date;
  }
  var groups = order.map(function(k){ return map[k]; });
  groups.forEach(function(g){ g.threads.sort(function(a,b){ return b.date - a.date; }); });
  groups.sort(function(a,b){ return b.latest - a.latest; });
  return groups;
}

// ── DOM builders ──────────────────────────────────────────────────────────────

// Thread row inside an expanded group
function makeThreadRow(t) {
  var div = document.createElement('div');
  div.className = 'gl-trow' + (t.unread ? ' unr' : '');

  var star = document.createElement('span');
  star.className = 'gl-star' + (t.starred ? ' on' : '');
  star.textContent = t.starred ? '★' : '☆';
  star.addEventListener('click', function(e) {
    e.stopPropagation();
    var was = t.starred; t.starred = !was;
    star.className = 'gl-star' + (t.starred ? ' on' : '');
    star.textContent = t.starred ? '★' : '☆';
    apiModify(t.id, was ? {removeLabelIds:['STARRED']} : {addLabelIds:['STARRED']})
      .catch(function(){ t.starred = was; star.className='gl-star'+(t.starred?' on':''); star.textContent=t.starred?'★':'☆'; });
  });

  var tb = document.createElement('div'); tb.className = 'gl-tb';
  var subj = document.createElement('div'); subj.className = 'gl-subj'; subj.textContent = t.subject;
  tb.appendChild(subj);
  if (t.snippet) {
    var snip = document.createElement('div'); snip.className = 'gl-snip'; snip.textContent = t.snippet;
    tb.appendChild(snip);
  }

  var meta = document.createElement('div'); meta.className = 'gl-trow-meta';
  var dt = document.createElement('span'); dt.className = 'gl-dt'; dt.textContent = fmtDate(t.date);
  meta.appendChild(dt);
  if (t.msgCount > 1) {
    var mc = document.createElement('span'); mc.className = 'gl-mc'; mc.textContent = t.msgCount + ' msgs';
    meta.appendChild(mc);
  }
  var ab = document.createElement('button'); ab.className = 'gl-ab'; ab.textContent = 'Archive';
  ab.addEventListener('click', function(e) {
    e.stopPropagation(); ab.textContent = '…'; ab.disabled = true;
    apiModify(t.id, {removeLabelIds:['INBOX']}).then(function(){
      _threads = _threads.filter(function(x){ return x.id !== t.id; });
      rebuildList(_listEl);
    }).catch(function(){ ab.textContent = '!'; ab.disabled = false; });
  });
  meta.appendChild(ab);

  div.append(star, tb, meta);
  div.addEventListener('click', function(){ window.open('https://mail.google.com/mail/u/0/#inbox/'+t.id,'gm-pane'); });
  return div;
}

// Single-email row (sender only has 1 email — appears directly, no group header)
function makeSingleRow(g) {
  var t = g.threads[0];
  var div = document.createElement('div');
  div.className = 'gl-srow' + (t.unread ? ' unr' : '');

  var av = document.createElement('div'); av.className = 'gl-av';
  av.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;background:' + avatarColor(g.key);
  av.textContent = avatarLetter(g.label);

  var mid = document.createElement('div'); mid.className = 'gl-srow-mid';
  var sender = document.createElement('div'); sender.className = 'gl-srow-sender'; sender.textContent = g.label;
  var subj = document.createElement('div'); subj.className = 'gl-srow-subj'; subj.textContent = t.subject;
  mid.append(sender, subj);
  if (t.snippet) {
    var snip = document.createElement('div'); snip.className = 'gl-srow-snip'; snip.textContent = t.snippet;
    mid.appendChild(snip);
  }

  var meta = document.createElement('div'); meta.className = 'gl-srow-meta';
  var dt = document.createElement('span'); dt.className = 'gl-srow-dt'; dt.textContent = fmtDate(t.date);
  meta.appendChild(dt);
  var ab = document.createElement('button'); ab.className = 'gl-srow-ab'; ab.textContent = 'Archive';
  ab.addEventListener('click', function(e) {
    e.stopPropagation(); ab.textContent = '…'; ab.disabled = true;
    apiModify(t.id, {removeLabelIds:['INBOX']}).then(function(){
      _threads = _threads.filter(function(x){ return x.id !== t.id; });
      rebuildList(_listEl);
    }).catch(function(){ ab.textContent = '!'; ab.disabled = false; });
  });
  meta.appendChild(ab);

  div.append(av, mid, meta);
  div.addEventListener('click', function(){ window.open('https://mail.google.com/mail/u/0/#inbox/'+t.id,'gm-pane'); });
  return div;
}

// Multi-email group card (collapsible, defaults to CLOSED)
function makeGroupCard(g) {
  var isOpen = _expanded[g.key] === true; // default: collapsed
  var wrap = document.createElement('div'); wrap.className = 'gl-card';

  // Header
  var hdrEl = document.createElement('div'); hdrEl.className = 'gl-card-hdr';

  var av = document.createElement('div'); av.className = 'gl-av';
  av.style.background = avatarColor(g.key);
  av.textContent = avatarLetter(g.label);

  var sname = document.createElement('span'); sname.className = 'gl-sname'; sname.textContent = g.label;

  var scount = document.createElement('span'); scount.className = 'gl-scount';
  scount.textContent = g.threads.length + (g.threads.length === 1 ? ' email' : ' emails');

  var sdate = document.createElement('span'); sdate.className = 'gl-sdate'; sdate.textContent = fmtDate(g.latest);

  var sarch = document.createElement('button'); sarch.className = 'gl-sarch'; sarch.textContent = 'Archive all';
  sarch.addEventListener('click', function(e) {
    e.stopPropagation(); sarch.textContent = '…'; sarch.disabled = true;
    Promise.all(g.threads.map(function(t){ return apiModify(t.id,{removeLabelIds:['INBOX']}); }))
      .then(function(){
        var ids = g.threads.map(function(t){ return t.id; });
        _threads = _threads.filter(function(t){ return ids.indexOf(t.id) < 0; });
        rebuildList(_listEl);
      }).catch(function(){ sarch.textContent = 'Error'; sarch.disabled = false; });
  });

  var xi = document.createElement('span'); xi.className = 'gl-xi';
  xi.textContent = isOpen ? '▾' : '▸';

  hdrEl.append(av, sname, scount, sdate, sarch, xi);
  hdrEl.addEventListener('click', function(e) {
    if (e.target === sarch || sarch.contains(e.target)) return;
    _expanded[g.key] = !isOpen;
    rebuildList(_listEl);
  });
  wrap.appendChild(hdrEl);

  if (isOpen) {
    g.threads.forEach(function(t){ wrap.appendChild(makeThreadRow(t)); });
  }

  return wrap;
}

// ── Rebuild list ───────────────────────────────────────────────────────────────

function rebuildList(listEl) {
  if (!listEl) return;
  _listEl = listEl;
  var frag = document.createDocumentFragment();
  var groups = groupThreads(_threads);

  groups.forEach(function(g) {
    frag.appendChild(g.threads.length > 1 ? makeGroupCard(g) : makeSingleRow(g));
  });

  if (_loading) {
    var spin = document.createElement('div'); spin.className = 'gl-spin';
    spin.textContent = _threads.length ? 'Loading more…' : 'Loading inbox…';
    frag.appendChild(spin);
  } else if (_threads.length === 0 && !_error) {
    var empty = document.createElement('div'); empty.className = 'gl-empty';
    empty.textContent = 'Inbox zero 🎉';
    frag.appendChild(empty);
  }

  listEl.replaceChildren(frag);
}

// ── Screen builders ────────────────────────────────────────────────────────────

function buildSetupScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';
  var d = document.createElement('div'); d.className = 'gl-setup';
  d.innerHTML = [
    '<h3>📥 Live Gmail</h3>',
    '<p>Paste your Google OAuth 2.0 Client ID to connect.</p>',
    '<p>Need one? <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud → Credentials</a>',
    ' → Create OAuth client → <strong>Web application</strong>',
    ' → Authorized JS origin: <code>https://gse281.github.io</code></p>',
    '<label style="display:block;font-size:11px;color:#4a7a8a;margin-bottom:5px">OAuth Client ID</label>',
    '<input id="gl-cid" type="text" placeholder="….apps.googleusercontent.com">',
    '<button id="gl-cid-save" class="gl-btn p" style="margin-top:10px;font-size:13px;padding:6px 16px">Save & Connect</button>',
    '<p style="color:#1e3a4a;font-size:11px;margin-top:14px">Make sure you are listed as a test user under OAuth consent screen → Audience.</p>'
  ].join('');
  wrap.appendChild(d);
  host.appendChild(wrap);
  wrap.querySelector('#gl-cid-save').addEventListener('click', function() {
    var cid = wrap.querySelector('#gl-cid').value.trim();
    if (!cid) return;
    _cfg.gmailClientId = cid;
    try { var c = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); c.gmailClientId = cid; localStorage.setItem('tb.cfg', JSON.stringify(c)); } catch(e) {}
    _gisClient = null; _authed = false;
    mount(host, _cfg);
  });
}

function buildConnectScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';
  var d = document.createElement('div'); d.className = 'gl-connect';
  var btn = document.createElement('button');
  btn.className = 'gl-btn p'; btn.textContent = '  Sign in with Google';
  btn.style.cssText = 'font-size:14px;padding:9px 22px';
  btn.addEventListener('click', function() {
    btn.textContent = 'Opening…'; btn.disabled = true;
    signIn().then(function(tok) {
      if (tok) loadMore(true);
      else { btn.textContent = '  Sign in with Google'; btn.disabled = false; }
    });
  });
  var note = document.createElement('p');
  note.textContent = 'Stays signed in for ~1 hour · no re-login needed on refresh';
  d.append(btn, note);
  wrap.appendChild(d);
  host.appendChild(wrap);
}

function buildPanel(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';

  // Toolbar
  var bar = document.createElement('div'); bar.className = 'gl-bar';

  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'gl-btn'; refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.addEventListener('click', function() { _expanded = {}; loadMore(true); });
  bar.appendChild(refreshBtn);

  // Expand-all / Collapse-all
  var expandBtn = document.createElement('button');
  expandBtn.className = 'gl-btn'; expandBtn.textContent = '↕ Expand all';
  expandBtn.addEventListener('click', function() {
    var groups = groupThreads(_threads);
    var anyOpen = groups.some(function(g){ return g.threads.length > 1 && _expanded[g.key] === true; });
    groups.forEach(function(g){ if (g.threads.length > 1) _expanded[g.key] = !anyOpen; });
    expandBtn.textContent = anyOpen ? '↕ Expand all' : '↕ Collapse all';
    rebuildList(_listEl);
  });
  bar.appendChild(expandBtn);

  if (_total != null) {
    var ct = document.createElement('span'); ct.className = 'gl-ct';
    var groups = groupThreads(_threads);
    ct.textContent = groups.length + ' senders · ' + _threads.length + ' of ~' + _total + ' emails';
    bar.appendChild(ct);
  }

  if (_error && _error !== 'auth') {
    var eb = document.createElement('div'); eb.className = 'gl-err-bar';
    var espan = document.createElement('span'); espan.className = 'gl-err'; espan.textContent = _error;
    var rb = document.createElement('button'); rb.className = 'gl-btn'; rb.textContent = 'Retry';
    rb.addEventListener('click', function(){ loadMore(true); });
    eb.append(espan, rb);
    bar.appendChild(eb);
  }

  var list = document.createElement('div'); list.className = 'gl-list';
  _listEl = list;

  wrap.append(bar, list);

  if (_nextPage && !_loading) {
    var mr = document.createElement('div'); mr.className = 'gl-more';
    var mb = document.createElement('button'); mb.className = 'gl-btn'; mb.textContent = 'Load 50 more…';
    mb.style.width = '100%';
    mb.addEventListener('click', function(){ loadMore(false); });
    mr.appendChild(mb); wrap.appendChild(mr);
  }

  host.appendChild(wrap);
  rebuildList(list);
}

// ── Redraw ─────────────────────────────────────────────────────────────────────

function redraw() {
  if (!_host) return;
  if (!_cfg.gmailClientId) { buildSetupScreen(_host); return; }
  if (_error === 'auth')   { buildConnectScreen(_host); return; }
  if (!_authed && _threads.length === 0 && !_loading) { buildConnectScreen(_host); return; }
  buildPanel(_host);
}

// ── Mount ──────────────────────────────────────────────────────────────────────

function mount(host, cfg) {
  addCss();
  _cfg  = cfg;
  _host = host;

  if (!cfg.gmailClientId) { buildSetupScreen(host); return; }

  // Cached token → straight to loading
  if (_authed && _token && Date.now() < _exp) {
    host.innerHTML = '<div class="gl"><div class="gl-spin">Loading inbox…</div></div>';
    loadMore(true);
    return;
  }

  host.innerHTML = '<div class="gl"><div class="gl-spin">Connecting…</div></div>';

  (function waitGIS() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      return setTimeout(waitGIS, 150);
    }
    ensureGISClient();
    // Try silent refresh — works automatically if browser still has an active Google session
    silentRefresh().then(function(tok) {
      if (tok) { _authed = true; loadMore(true); }
      else buildConnectScreen(host);
    });
  })();
}

window.GL = { mount: mount };
})();
