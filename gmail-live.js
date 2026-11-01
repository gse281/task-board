/* gmail-live.js — live Gmail inbox panel
   Requires Google Identity Services loaded before this script:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   Public API:  window.GL = { mount(host, cfg) }
   cfg keys:    gmailClientId  — OAuth 2.0 Web client ID
*/
(function () {
'use strict';

var SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
var BASE  = 'https://www.googleapis.com/gmail/v1/users/me/';

// ── Auth state ────────────────────────────────────────────────────────────────
var _cfg        = null;   // { gmailClientId }
var _gisClient  = null;   // GIS TokenClient
var _token      = null;   // current access token string
var _exp        = 0;      // token expiry ms
var _pendingCB  = null;   // pending Promise resolver from GIS callback
var _authed     = false;  // user has granted once this session

// ── Panel state ───────────────────────────────────────────────────────────────
var _threads  = [];    // parsed thread objects
var _nextPage = null;  // Gmail API nextPageToken
var _total    = null;  // resultSizeEstimate
var _loading  = false;
var _error    = null;  // string or null
var _expanded = {};    // senderKey → bool (undefined = auto)
var _draw     = null;  // () → void, re-renders the panel

// ── Auth ──────────────────────────────────────────────────────────────────────

function ensureGISClient() {
  if (_gisClient) return;
  _gisClient = google.accounts.oauth2.initTokenClient({
    client_id: _cfg.gmailClientId,
    scope: SCOPE,
    callback: function (resp) {
      if (resp && resp.access_token) {
        _token  = resp.access_token;
        _exp    = Date.now() + (Number(resp.expires_in || 3540) - 60) * 1000;
        _authed = true;
      }
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(_token || null); }
    },
    error_callback: function (err) {
      if (_pendingCB) { var f = _pendingCB; _pendingCB = null; f(null); }
    }
  });
}

// Sign in interactively (popup)
function signIn() {
  return new Promise(function (resolve) {
    ensureGISClient();
    _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: _authed ? '' : 'select_account' });
  });
}

// Silent token refresh (no UI)
function silentToken() {
  if (_token && Date.now() < _exp) return Promise.resolve(_token);
  if (!_gisClient) return Promise.resolve(null);
  return new Promise(function (resolve) {
    _pendingCB = resolve;
    _gisClient.requestAccessToken({ prompt: 'none' });
  });
}

// Get token for API calls (silent refresh; returns null if not authed)
async function getToken() {
  if (_token && Date.now() < _exp) return _token;
  if (!_authed) return null;
  var tok = await silentToken();
  return tok;
}

// ── Gmail API ─────────────────────────────────────────────────────────────────

async function gfetch(path, opts) {
  opts = opts || {};
  var tok = await getToken();
  if (!tok) throw Object.assign(new Error('Not signed in'), { code: 'auth' });
  var r = await fetch(BASE + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, opts.headers || {})
  }));
  if (r.status === 401) { _token = null; throw Object.assign(new Error('Token expired'), { code: 'auth' }); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function apiListThreads(pageToken) {
  var qs = 'threads?maxResults=50&labelIds=INBOX';
  if (pageToken) qs += '&pageToken=' + encodeURIComponent(pageToken);
  return gfetch(qs);
}

async function apiGetThread(id) {
  return gfetch('threads/' + id + '?format=METADATA&metadataHeaders=From,Subject,Date');
}

async function apiModify(id, body) {
  return gfetch('threads/' + id + '/modify', { method: 'POST', body: JSON.stringify(body) });
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function hdr(msg, name) {
  var hdrs = (msg.payload && msg.payload.headers) ? msg.payload.headers : [];
  var n = name.toLowerCase();
  for (var i = 0; i < hdrs.length; i++) {
    if (hdrs[i].name.toLowerCase() === n) return hdrs[i].value;
  }
  return '';
}

function parseSender(from) {
  var nm = from.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  var name = nm ? nm[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
  var em = (from.match(/<([^>]+)>/) || [])[1] || from;
  // Trim trailing spaces/quotes from name
  name = name.replace(/^["'\s]+|["'\s]+$/g, '') || em;
  return { name: name, email: em };
}

function parseThread(t) {
  var msgs = t.messages || [];
  var first = msgs[0] || {};
  var last  = msgs[msgs.length - 1] || first;
  var sender  = parseSender(hdr(first, 'From'));
  var subject = hdr(first, 'Subject') || '(no subject)';
  var dateStr = hdr(first, 'Date');
  var date    = dateStr ? new Date(dateStr) : new Date();
  return {
    id:         t.id,
    subject:    subject,
    senderName: sender.name,
    senderEmail:sender.email,
    date:       date,
    starred:    (last.labelIds || []).indexOf('STARRED') >= 0,
    unread:     (first.labelIds || []).indexOf('UNREAD') >= 0,
    msgCount:   msgs.length
  };
}

function fmtDate(d) {
  var now = new Date(), diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
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
    var items = list.threads || [];
    var fetched = await Promise.all(items.map(function (t) { return apiGetThread(t.id); }));
    _threads = _threads.concat(fetched.map(parseThread));
  } catch (e) {
    _error = (e.code === 'auth') ? 'auth' : (e.message || 'Unknown error');
  }

  _loading = false;
  _draw && _draw();
}

// ── CSS ───────────────────────────────────────────────────────────────────────

var _cssAdded = false;
function addCss() {
  if (_cssAdded) return; _cssAdded = true;
  var s = document.createElement('style');
  s.textContent = [
    '.gl{display:flex;flex-direction:column;height:100%;font:13px/1.4 -apple-system,system-ui,sans-serif;color:#e7f3f6}',
    '.gl-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #1a2a32;flex-shrink:0;flex-wrap:wrap}',
    '.gl-btn{background:#0e2233;border:1px solid #1e3a4a;color:#8aa6af;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit}',
    '.gl-btn:hover{background:#152e40;color:#e7f3f6}',
    '.gl-btn.p{background:#0d3d56;border-color:#1a6882;color:#39c7df}',
    '.gl-btn.p:hover{background:#0e4d6b}',
    '.gl-ct{font-size:11px;color:#8aa6af}',
    '.gl-err{font-size:12px;color:#e07070;flex:1}',
    '.gl-list{flex:1;overflow-y:auto}',
    /* group header */
    '.gl-gh{display:flex;align-items:center;gap:5px;padding:5px 10px;background:#08161f;border-bottom:1px solid #1a2a32;cursor:pointer;user-select:none}',
    '.gl-gh:hover{background:#0c1e2b}',
    '.gl-xi{font-size:9px;color:#4a6a7a;width:10px;flex-shrink:0}',
    '.gl-gn{font-size:12px;font-weight:600;color:#c8e6f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gl-gc{font-size:11px;color:#8aa6af;background:#0d2233;border-radius:9px;padding:0 5px}',
    '.gl-gd{font-size:11px;color:#8aa6af;margin-left:auto;margin-right:4px}',
    '.gl-gab{font-size:10px;padding:1px 7px;background:#0d3d56;border:1px solid #1a6882;color:#39c7df;border-radius:3px;cursor:pointer;font-family:inherit;display:none;white-space:nowrap}',
    '.gl-gh:hover .gl-gab{display:block}',
    /* thread row */
    '.gl-row{display:flex;align-items:center;gap:5px;padding:4px 10px 4px 22px;border-bottom:1px solid #0d1a22;cursor:pointer;min-width:0}',
    '.gl-row.sing{padding-left:10px}',
    '.gl-row:hover{background:#0d1e2a}',
    '.gl-row.unr .gl-subj{font-weight:600;color:#fff}',
    '.gl-star{font-size:12px;cursor:pointer;color:#4a6a7a;flex-shrink:0;line-height:1;padding:1px 2px}',
    '.gl-star.on{color:#f0c040}',
    '.gl-star:hover{color:#c8a030}',
    '.gl-subj{flex:1;font-size:12px;color:#b8d8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gl-mc{font-size:10px;color:#8aa6af;background:#111d27;border-radius:8px;padding:0 4px;flex-shrink:0}',
    '.gl-dt{font-size:11px;color:#8aa6af;flex-shrink:0;white-space:nowrap}',
    '.gl-ab{font-size:11px;padding:1px 5px;background:none;border:1px solid #1e3a4a;color:#8aa6af;border-radius:3px;cursor:pointer;font-family:inherit;display:none;flex-shrink:0}',
    '.gl-row:hover .gl-ab{display:block}',
    '.gl-ab:hover{background:#0d3d56;border-color:#1a6882;color:#39c7df}',
    /* misc */
    '.gl-spin{padding:24px;text-align:center;color:#8aa6af;font-size:12px}',
    '.gl-more{padding:8px;text-align:center;border-top:1px solid #1a2a32;flex-shrink:0}',
    '.gl-setup{padding:20px;max-width:480px}',
    '.gl-setup h3{margin:0 0 10px;font-size:14px;color:#c8e6f0}',
    '.gl-setup p{font-size:12px;color:#8aa6af;margin:0 0 8px;line-height:1.5}',
    '.gl-setup code{color:#8aa6af;background:#0b1c26;padding:1px 4px;border-radius:3px}',
    '.gl-setup a{color:#39c7df}',
    '.gl-connect{padding:32px 20px;text-align:center}',
    '.gl-connect p{font-size:12px;color:#8aa6af;margin:10px 0 0}',
    '.gl-empty{padding:20px;text-align:center;color:#8aa6af;font-size:12px}',
  ].join('');
  document.head.appendChild(s);
}

// ── Group threads ─────────────────────────────────────────────────────────────

function groupThreads(arr) {
  var map = {}, order = [];
  for (var i = 0; i < arr.length; i++) {
    var t = arr[i];
    var k = t.senderName.toLowerCase();
    if (!map[k]) { map[k] = { key: k, label: t.senderName, threads: [], latest: t.date }; order.push(k); }
    map[k].threads.push(t);
    if (t.date > map[k].latest) map[k].latest = t.date;
  }
  var groups = order.map(function (k) { return map[k]; });
  // Sort each group's threads newest first
  groups.forEach(function (g) { g.threads.sort(function (a, b) { return b.date - a.date; }); });
  // Sort groups by their latest thread
  groups.sort(function (a, b) { return b.latest - a.latest; });
  return groups;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeRow(t, indented, listEl) {
  var div = document.createElement('div');
  div.className = 'gl-row' + (t.unread ? ' unr' : '') + (indented ? '' : ' sing');

  var star = document.createElement('span');
  star.className = 'gl-star' + (t.starred ? ' on' : '');
  star.textContent = t.starred ? '★' : '☆';
  star.title = t.starred ? 'Unstar' : 'Star';
  star.addEventListener('click', function (e) {
    e.stopPropagation();
    var was = t.starred; t.starred = !was;
    star.className = 'gl-star' + (t.starred ? ' on' : '');
    star.textContent = t.starred ? '★' : '☆';
    apiModify(t.id, was ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] })
      .catch(function () { t.starred = was; star.className = 'gl-star' + (t.starred ? ' on' : ''); star.textContent = t.starred ? '★' : '☆'; });
  });

  var subj = document.createElement('span');
  subj.className = 'gl-subj';
  subj.textContent = t.subject;
  subj.title = t.senderName + ' — ' + t.subject;

  var elems = [star, subj];

  if (t.msgCount > 1) {
    var mc = document.createElement('span');
    mc.className = 'gl-mc'; mc.textContent = t.msgCount;
    elems.push(mc);
  }

  var dt = document.createElement('span');
  dt.className = 'gl-dt'; dt.textContent = fmtDate(t.date);
  elems.push(dt);

  var ab = document.createElement('button');
  ab.className = 'gl-ab'; ab.textContent = '🗂'; ab.title = 'Archive';
  ab.addEventListener('click', function (e) {
    e.stopPropagation();
    ab.textContent = '…'; ab.disabled = true;
    apiModify(t.id, { removeLabelIds: ['INBOX'] }).then(function () {
      _threads = _threads.filter(function (x) { return x.id !== t.id; });
      rebuildList(listEl);
    }).catch(function () { ab.textContent = '!'; ab.disabled = false; });
  });
  elems.push(ab);

  elems.forEach(function (el) { div.appendChild(el); });

  div.addEventListener('click', function () {
    window.open('https://mail.google.com/mail/u/0/#inbox/' + t.id, 'gm-pane');
  });

  return div;
}

function makeGroupHeader(g, isOpen, listEl) {
  var div = document.createElement('div');
  div.className = 'gl-gh';

  var xi = document.createElement('span'); xi.className = 'gl-xi'; xi.textContent = isOpen ? '▾' : '▸';
  var gn = document.createElement('span'); gn.className = 'gl-gn'; gn.textContent = g.label; gn.title = g.label;
  var gc = document.createElement('span'); gc.className = 'gl-gc'; gc.textContent = g.threads.length;
  var gd = document.createElement('span'); gd.className = 'gl-gd'; gd.textContent = fmtDate(g.latest);

  var gab = document.createElement('button');
  gab.className = 'gl-gab'; gab.textContent = 'Archive all';
  gab.addEventListener('click', function (e) {
    e.stopPropagation();
    gab.textContent = '…'; gab.disabled = true;
    Promise.all(g.threads.map(function (t) { return apiModify(t.id, { removeLabelIds: ['INBOX'] }); }))
      .then(function () {
        var ids = g.threads.map(function (t) { return t.id; });
        _threads = _threads.filter(function (t) { return ids.indexOf(t.id) < 0; });
        rebuildList(listEl);
      })
      .catch(function () { gab.textContent = '!'; gab.disabled = false; });
  });

  [xi, gn, gc, gd, gab].forEach(function (el) { div.appendChild(el); });

  div.addEventListener('click', function (e) {
    if (e.target === gab || gab.contains(e.target)) return;
    _expanded[g.key] = (_expanded[g.key] === false) ? true : false;
    rebuildList(listEl);
  });

  return div;
}

function rebuildList(listEl) {
  if (!listEl) return;
  var frag = document.createDocumentFragment();
  var groups = groupThreads(_threads);

  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (g.threads.length > 1) {
      var isOpen = _expanded[g.key] !== false; // default open
      frag.appendChild(makeGroupHeader(g, isOpen, listEl));
      if (isOpen) {
        for (var j = 0; j < g.threads.length; j++) {
          frag.appendChild(makeRow(g.threads[j], true, listEl));
        }
      }
    } else {
      frag.appendChild(makeRow(g.threads[0], false, listEl));
    }
  }

  if (_loading) {
    var spin = document.createElement('div');
    spin.className = 'gl-spin';
    spin.textContent = _threads.length ? 'Loading more…' : 'Loading inbox…';
    frag.appendChild(spin);
  } else if (!_loading && _threads.length === 0 && !_error) {
    var empty = document.createElement('div');
    empty.className = 'gl-empty'; empty.textContent = 'Inbox is empty 🎉';
    frag.appendChild(empty);
  }

  listEl.replaceChildren(frag);
}

// ── Screen builders ───────────────────────────────────────────────────────────

function buildSetupScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';
  var setup = document.createElement('div'); setup.className = 'gl-setup';
  setup.innerHTML = [
    '<h3>📥 Live Gmail</h3>',
    '<p>Needs a Google OAuth 2.0 Client ID (Web application type).</p>',
    '<p>1. Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud → Credentials</a><br>',
    '2. Create OAuth client → <strong>Web application</strong><br>',
    '3. Add JS origin: <code>https://gse281.github.io</code><br>',
    '4. Copy the Client ID → paste into ⚙︎ on the board as <strong>Gmail Client ID</strong></p>',
    '<p style="color:#4a6a7a;font-size:11px">Gmail scope required: <code>gmail.modify</code></p>'
  ].join('');
  wrap.appendChild(setup);
  host.appendChild(wrap);
}

function buildConnectScreen(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';
  var conn = document.createElement('div'); conn.className = 'gl-connect';
  var btn = document.createElement('button');
  btn.className = 'gl-btn p'; btn.textContent = '📬  Sign in with Google';
  btn.style.fontSize = '13px';
  btn.addEventListener('click', function () {
    btn.textContent = 'Opening…'; btn.disabled = true;
    signIn().then(function (tok) {
      if (tok) {
        loadMore(true);
      } else {
        btn.textContent = '📬  Sign in with Google'; btn.disabled = false;
      }
    });
  });
  var note = document.createElement('p');
  note.textContent = 'Opens a Google sign-in popup';
  conn.appendChild(btn); conn.appendChild(note);
  wrap.appendChild(conn);
  host.appendChild(wrap);
}

function buildPanel(host) {
  host.innerHTML = '';
  var wrap = document.createElement('div'); wrap.className = 'gl';

  // ── Toolbar
  var bar = document.createElement('div'); bar.className = 'gl-bar';

  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'gl-btn'; refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.addEventListener('click', function () { loadMore(true); });

  var ct = document.createElement('span'); ct.className = 'gl-ct';
  if (_total != null) {
    ct.textContent = _threads.length + ' loaded' + (_total > _threads.length ? ' of ~' + _total : '');
  }

  bar.appendChild(refreshBtn);
  if (ct.textContent) bar.appendChild(ct);

  if (_error && _error !== 'auth') {
    var errSpan = document.createElement('span'); errSpan.className = 'gl-err';
    errSpan.textContent = 'Error: ' + _error;
    var retryBtn = document.createElement('button');
    retryBtn.className = 'gl-btn'; retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', function () { loadMore(true); });
    bar.appendChild(errSpan); bar.appendChild(retryBtn);
  }

  // ── List
  var list = document.createElement('div'); list.className = 'gl-list';

  wrap.appendChild(bar);
  wrap.appendChild(list);

  // ── Load more
  if (_nextPage && !_loading) {
    var moreRow = document.createElement('div'); moreRow.className = 'gl-more';
    var moreBtn = document.createElement('button');
    moreBtn.className = 'gl-btn'; moreBtn.textContent = 'Load 50 more';
    moreBtn.addEventListener('click', function () { loadMore(false); });
    moreRow.appendChild(moreBtn);
    wrap.appendChild(moreRow);
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

  _draw = function () { draw(host); };

  if (!cfg.gmailClientId) {
    buildSetupScreen(host);
    return;
  }

  // Show spinner while waiting for GIS
  host.innerHTML = '<div class="gl"><div class="gl-spin">Connecting…</div></div>';

  (function waitForGIS() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      setTimeout(waitForGIS, 150);
      return;
    }
    ensureGISClient();
    // Try silent token (works if user granted before this session)
    silentToken().then(function (tok) {
      if (tok) {
        _authed = true;
        loadMore(true);
      } else {
        buildConnectScreen(host);
      }
    });
  })();
}

window.GL = { mount: mount };
})();
