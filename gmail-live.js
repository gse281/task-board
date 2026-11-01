/* gmail-live.js — live Gmail inbox panel v2
   Requires Google Identity Services:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   Public API:  window.GL = { mount(host, cfg) }
   cfg:         { gmailClientId }
*/
(function () {
'use strict';

var SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
var BASE  = 'https://www.googleapis.com/gmail/v1/users/me/';
var TOK_KEY = 'gl.v2.tok'; // sessionStorage key

// ── Auth state ────────────────────────────────────────────────────────────────
var _cfg       = null;
var _gisClient = null;
var _token     = null;
var _exp       = 0;
var _pendingCB = null;
var _authed    = false;

// Restore token from sessionStorage so page refresh doesn't re-prompt
(function restoreToken() {
  try {
    var s = sessionStorage.getItem(TOK_KEY);
    if (s) {
      var p = JSON.parse(s);
      if (p.exp > Date.now() + 120000) { _token = p.tok; _exp = p.exp; _authed = true; }
    }
  } catch(e) {}
})();

// ── Panel state ───────────────────────────────────────────────────────────────
var _threads  = [];
var _nextPage = null;
var _total    = null;
var _loading  = false;
var _error    = null;
var _expanded = {};   // senderKey → bool
var _listEl   = null; // the scrolling list element, kept for rebuilds
var _draw     = null; // () → void

// ── Auth ──────────────────────────────────────────────────────────────────────

function saveToken() {
  try { sessionStorage.setItem(TOK_KEY, JSON.stringify({ tok: _token, exp: _exp })); } catch(e) {}
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

// ── Gmail API ─────────────────────────────────────────────────────────────────

async function gfetch(path, opts) {
  opts = opts || {};
  var tok = await getToken();
  if (!tok) throw Object.assign(new Error('auth'), { code: 'auth' });
  var r = await fetch(BASE + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, opts.headers || {})
  }));
  if (r.status === 401) { _token = null; throw Object.assign(new Error('auth'), { code: 'auth' }); }
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

// ── Parsing ───────────────────────────────────────────────────────────────────

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

function parseThread(t) {
  var msgs = t.messages || [];
  var first = msgs[0] || {}, last = msgs[msgs.length - 1] || first;
  var s = parseSender(hdr(first, 'From'));
  var dateStr = hdr(first, 'Date');
  return {
    id:          t.id,
    subject:     hdr(first, 'Subject') || '(no subject)',
    snippet:     (first.snippet || '').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>'),
    senderName:  s.name,
    senderEmail: s.email,
    date:        dateStr ? new Date(dateStr) : new Date(),
    starred:     (last.labelIds || []).indexOf('STARRED') >= 0,
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

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadMore(reset) {
  if (_loading) return;
  _loading = true; _error = null;
  if (reset) { _threads = []; _nextPage = null; _total = null; }
  _draw && _draw();
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
  _draw && _draw();
}

// ── CSS ───────────────────────────────────────────────────────────────────────

var _cssAdded = false;
function addCss() {
  if (_cssAdded) return; _cssAdded = true;
  var s = document.createElement('style');
  s.textContent = `
.gl{display:flex;flex-direction:column;height:100%;font:13px/1.45 -apple-system,system-ui,sans-serif;color:#e7f3f6;background:#070d11}

/* toolbar */
.gl-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #132030;flex-shrink:0;background:#07111a}
.gl-btn{background:#0e2233;border:1px solid #1e3a4a;color:#8aa6af;font-size:12px;padding:4px 11px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap}
.gl-btn:hover{background:#142d42;color:#c8e6f0}
.gl-btn.p{background:#0d3d56;border-color:#1a6882;color:#39c7df}
.gl-btn.p:hover{background:#0e4d6b}
.gl-ct{font-size:11px;color:#4a6a7a}
.gl-err{font-size:12px;color:#e07070;flex:1}

/* scrolling list */
.gl-list{flex:1;overflow-y:auto}

/* sender card */
.gl-card{border-bottom:2px solid #0c1d28;margin-bottom:0}
.gl-card-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px 6px;cursor:pointer;user-select:none;background:#07111a;border-bottom:1px solid #111e28}
.gl-card-hdr:hover{background:#0a1825}
.gl-av{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:0}
.gl-sname{font-size:13px;font-weight:600;color:#d8eef6;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gl-scount{font-size:11px;color:#39c7df;background:#0d2e40;border-radius:10px;padding:1px 7px;flex-shrink:0}
.gl-sdate{font-size:11px;color:#4a6a7a;flex-shrink:0}
.gl-xi{font-size:10px;color:#4a6a7a;flex-shrink:0}
.gl-sarch{font-size:11px;padding:2px 8px;background:#0d3d56;border:1px solid #1a6882;color:#39c7df;border-radius:3px;cursor:pointer;font-family:inherit;flex-shrink:0;white-space:nowrap}
.gl-sarch:hover{background:#0e4d6b}

/* thread row inside a card */
.gl-trow{display:flex;align-items:flex-start;gap:7px;padding:6px 12px 6px 46px;border-bottom:1px solid #0a1820;cursor:pointer;min-width:0}
.gl-trow:hover{background:#0b1d2a}
.gl-trow.sing{padding-left:12px}

/* star */
.gl-star{font-size:13px;cursor:pointer;color:#253d4a;flex-shrink:0;margin-top:1px;line-height:1}
.gl-star.on{color:#f0c040}
.gl-star:hover{color:#c8a030}

/* text block */
.gl-tb{flex:1;min-width:0}
.gl-subj{font-size:13px;color:#b8d8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.gl-trow.unr .gl-subj{font-weight:600;color:#e8f6ff}
.gl-snip{font-size:11px;color:#3a5a6a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:1.3}

/* meta (date + actions) */
.gl-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.gl-dt{font-size:11px;color:#4a6a7a;white-space:nowrap}
.gl-mc{font-size:10px;color:#8aa6af;background:#101e28;border-radius:8px;padding:0 5px;white-space:nowrap}
.gl-ab{font-size:11px;padding:1px 6px;background:none;border:1px solid #1a2e3a;color:#4a6a7a;border-radius:3px;cursor:pointer;font-family:inherit;opacity:0}
.gl-trow:hover .gl-ab{opacity:1}
.gl-ab:hover{background:#0d3d56;border-color:#1a6882;color:#39c7df;opacity:1}

/* misc */
.gl-spin{padding:28px;text-align:center;color:#4a6a7a;font-size:12px}
.gl-more{padding:10px;text-align:center;border-top:1px solid #132030;flex-shrink:0}
.gl-empty{padding:28px;text-align:center;color:#4a6a7a;font-size:13px}
.gl-setup{padding:22px;max-width:500px}
.gl-setup h3{margin:0 0 12px;font-size:15px;color:#c8e6f0;font-weight:600}
.gl-setup p{font-size:12px;color:#8aa6af;margin:0 0 10px;line-height:1.6}
.gl-setup code{color:#8aa6af;background:#0b1c26;padding:1px 5px;border-radius:3px;font-size:11px}
.gl-setup a{color:#39c7df}
.gl-setup input{width:100%;background:#0b1c26;border:1px solid #1e3a4a;color:#e7f3f6;padding:7px 10px;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:2px}
.gl-setup input:focus{outline:none;border-color:#39c7df}
.gl-connect{padding:40px 20px;text-align:center}
.gl-connect p{font-size:12px;color:#4a6a7a;margin:10px 0 0}
`;
  document.head.appendChild(s);
}

// ── Avatar color ──────────────────────────────────────────────────────────────

var COLORS = ['#1a6882','#2a5a3a','#5a3a6a','#6a3a2a','#2a4a6a','#3a5a2a','#6a2a4a','#2a6a5a'];
function avatarColor(key) {
  var n = 0;
  for (var i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) & 0xffff;
  return COLORS[n % COLORS.length];
}

// ── Groups ────────────────────────────────────────────────────────────────────

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

// ── DOM: thread row ───────────────────────────────────────────────────────────

function makeThreadRow(t, indented) {
  var div = document.createElement('div');
  div.className = 'gl-trow' + (t.unread ? ' unr' : '') + (indented ? '' : ' sing');

  // star
  var star = document.createElement('span');
  star.className = 'gl-star' + (t.starred ? ' on' : '');
  star.textContent = t.starred ? '★' : '☆';
  star.addEventListener('click', function(e) {
    e.stopPropagation();
    var was = t.starred; t.starred = !was;
    star.className = 'gl-star' + (t.starred ? ' on' : '');
    star.textContent = t.starred ? '★' : '☆';
    apiModify(t.id, was ? {removeLabelIds:['STARRED']} : {addLabelIds:['STARRED']})
      .catch(function(){ t.starred = was; star.className = 'gl-star'+(t.starred?' on':''); star.textContent = t.starred?'★':'☆'; });
  });

  // text block: subject + snippet
  var tb = document.createElement('div'); tb.className = 'gl-tb';
  var subj = document.createElement('div'); subj.className = 'gl-subj'; subj.textContent = t.subject;
  tb.appendChild(subj);
  if (t.snippet) {
    var snip = document.createElement('div'); snip.className = 'gl-snip'; snip.textContent = t.snippet;
    tb.appendChild(snip);
  }

  // meta: date, msg count, archive
  var meta = document.createElement('div'); meta.className = 'gl-meta';
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

// ── DOM: sender card ──────────────────────────────────────────────────────────

function makeCard(g) {
  var isMulti = g.threads.length > 1;
  var isOpen  = _expanded[g.key] !== false;
  var wrap = document.createElement('div'); wrap.className = 'gl-card';

  if (isMulti) {
    // Header
    var hdr = document.createElement('div'); hdr.className = 'gl-card-hdr';

    var av = document.createElement('div'); av.className = 'gl-av';
    av.style.background = avatarColor(g.key);
    av.textContent = g.label.charAt(0).toUpperCase();

    var sname = document.createElement('span'); sname.className = 'gl-sname'; sname.textContent = g.label;
    var scount = document.createElement('span'); scount.className = 'gl-scount'; scount.textContent = g.threads.length;
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

    var xi = document.createElement('span'); xi.className = 'gl-xi'; xi.textContent = isOpen ? '▾' : '▸';

    hdr.append(av, sname, scount, sdate, sarch, xi);
    hdr.addEventListener('click', function(e) {
      if (e.target === sarch || sarch.contains(e.target)) return;
      _expanded[g.key] = !isOpen;
      rebuildList(_listEl);
    });
    wrap.appendChild(hdr);

    if (isOpen) {
      g.threads.forEach(function(t){ wrap.appendChild(makeThreadRow(t, true)); });
    }
  } else {
    // Single-thread: show as one card row with sender name visible
    var row = makeThreadRow(g.threads[0], false);
    // Prepend sender avatar for standalone cards
    var av2 = document.createElement('div'); av2.className = 'gl-av';
    av2.style.background = avatarColor(g.key);
    av2.style.width = '22px'; av2.style.height = '22px'; av2.style.fontSize = '10px'; av2.style.marginTop = '1px';
    av2.textContent = g.label.charAt(0).toUpperCase();

    var senderSpan = document.createElement('div');
    senderSpan.style.cssText = 'font-size:11px;color:#4a6a7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    senderSpan.textContent = g.label;

    // Wrap avatar + sender name into a left column
    var lc = document.createElement('div');
    lc.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:34px;padding-top:1px';
    lc.append(av2);

    // Insert left column before star (first child of row)
    row.insertBefore(lc, row.firstChild);
    row.style.paddingLeft = '12px';
    wrap.appendChild(row);
  }

  return wrap;
}

// ── DOM: list rebuild ─────────────────────────────────────────────────────────

function rebuildList(listEl) {
  if (!listEl) return;
  _listEl = listEl;
  var frag = document.createDocumentFragment();
  var groups = groupThreads(_threads);

  groups.forEach(function(g){ frag.appendChild(makeCard(g)); });

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

// ── Screens ───────────────────────────────────────────────────────────────────

function buildSetupScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';
  var d = document.createElement('div'); d.className = 'gl-setup';
  d.innerHTML = [
    '<h3>📥 Live Gmail</h3>',
    '<p>Paste your Google OAuth 2.0 Client ID to connect directly to your inbox.</p>',
    '<p>Need one? <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud → Credentials</a>',
    ' → Create OAuth client → <strong>Web application</strong>',
    ' → Authorized JS origin: <code>https://gse281.github.io</code></p>',
    '<label style="display:block;font-size:11px;color:#8aa6af;margin-bottom:5px">OAuth Client ID</label>',
    '<input id="gl-cid" type="text" placeholder="….apps.googleusercontent.com">',
    '<br>',
    '<button id="gl-cid-save" class="gl-btn p" style="margin-top:12px;font-size:13px;padding:6px 16px">Save & Connect</button>',
    '<p style="color:#253d4a;font-size:11px;margin-top:14px">Add yourself as a test user under OAuth consent screen → Audience.</p>'
  ].join('');
  wrap.appendChild(d);
  host.appendChild(wrap);
  wrap.querySelector('#gl-cid-save').addEventListener('click', function() {
    var cid = wrap.querySelector('#gl-cid').value.trim();
    if (!cid) return;
    _cfg.gmailClientId = cid;
    try { var s = JSON.parse(localStorage.getItem('tb.cfg')||'{}'); s.gmailClientId = cid; localStorage.setItem('tb.cfg', JSON.stringify(s)); } catch(e) {}
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
  btn.style.cssText = 'font-size:14px;padding:8px 20px';
  btn.addEventListener('click', function() {
    btn.textContent = 'Opening…'; btn.disabled = true;
    signIn().then(function(tok) {
      if (tok) loadMore(true);
      else { btn.textContent = '  Sign in with Google'; btn.disabled = false; }
    });
  });
  var note = document.createElement('p'); note.textContent = 'Opens a Google sign-in popup · stays signed in for 1 hour';
  d.append(btn, note);
  wrap.appendChild(d);
  host.appendChild(wrap);
}

function buildPanel(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';

  var bar = document.createElement('div'); bar.className = 'gl-bar';
  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'gl-btn'; refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.addEventListener('click', function() { loadMore(true); });
  var ct = document.createElement('span'); ct.className = 'gl-ct';
  if (_total != null) ct.textContent = _threads.length + ' of ~' + _total + ' in inbox';
  bar.append(refreshBtn, ct);

  if (_error && _error !== 'auth') {
    var eb = document.createElement('span'); eb.className = 'gl-err'; eb.textContent = _error;
    var rb = document.createElement('button'); rb.className = 'gl-btn'; rb.textContent = 'Retry';
    rb.addEventListener('click', function(){ loadMore(true); });
    bar.append(eb, rb);
  }

  var list = document.createElement('div'); list.className = 'gl-list';
  _listEl = list;

  wrap.append(bar, list);

  if (_nextPage && !_loading) {
    var mr = document.createElement('div'); mr.className = 'gl-more';
    var mb = document.createElement('button'); mb.className = 'gl-btn'; mb.textContent = 'Load 50 more…';
    mb.addEventListener('click', function(){ loadMore(false); });
    mr.appendChild(mb); wrap.appendChild(mr);
  }

  host.appendChild(wrap);
  rebuildList(list);
}

// ── Mount ─────────────────────────────────────────────────────────────────────

function draw(host) {
  if (!_cfg.gmailClientId) { buildSetupScreen(host); return; }
  if (_error === 'auth') { buildConnectScreen(host); return; }
  if (!_authed && _threads.length === 0 && !_loading) { buildConnectScreen(host); return; }
  buildPanel(host);
}

function mount(host, cfg) {
  addCss();
  _cfg = cfg;
  _draw = function() { draw(host); };

  if (!cfg.gmailClientId) { buildSetupScreen(host); return; }

  // If we have a cached token, go straight to loading
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
    // Try silent refresh first (no popup if user has an active Google session)
    silentRefresh().then(function(tok) {
      if (tok) { _authed = true; loadMore(true); }
      else buildConnectScreen(host);
    });
  })();
}

window.GL = { mount: mount };
})();
