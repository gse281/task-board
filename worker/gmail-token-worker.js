/* gmail-token-worker.js — Cloudflare Worker that keeps a Google refresh token
   so email.html never has to sign in again.

   Bindings (Worker → Settings):
     KV namespace    TOKENS
     Secret          GOOGLE_CLIENT_ID      same Web client ID the page uses
     Secret          GOOGLE_CLIENT_SECRET  that client's secret
     Variable        ALLOWED_EMAIL         only this Google account may connect
     Variable        ALLOWED_ORIGIN        https://gse281.github.io

   Endpoints (all POST, JSON):
     /exchange  {code}            → {access_token, expires_in, session, email}
     /token     Bearer <session>  → {access_token, expires_in}
     /signout   Bearer <session>  → {ok}
*/

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://gse281.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    const origin = req.headers.get('Origin');
    if (origin && origin !== cors['Access-Control-Allow-Origin']) return json({ error: 'origin' }, 403);

    const path = new URL(req.url).pathname;
    try {
      if (path === '/exchange') return await exchange(req, env, json);
      if (path === '/token')    return await token(req, env, json);
      if (path === '/signout')  return await signout(req, env, json);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e) }, 500);
    }
  }
};

async function google(env, params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params })
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

function jwtEmail(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(part)).email || '').toLowerCase();
  } catch (e) { return ''; }
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function newSession() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function sessionOk(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (\w+)$/);
  if (!m) return null;
  const key = 'sess:' + await sha256(m[1]);
  return (await env.TOKENS.get(key)) ? key : null;
}

async function exchange(req, env, json) {
  const { code } = await req.json().catch(() => ({}));
  if (!code) return json({ error: 'no_code' }, 400);

  // GIS popup code flow uses the literal redirect_uri "postmessage".
  const g = await google(env, { code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
  if (!g.ok) return json({ error: 'exchange_failed', detail: g.data.error_description || g.data.error }, 400);

  const email = jwtEmail(g.data.id_token || '');
  const allowed = (env.ALLOWED_EMAIL || '').toLowerCase();
  if (!allowed || email !== allowed) return json({ error: 'wrong_account', email }, 403);
  if (!String(g.data.scope || '').split(' ').includes(GMAIL_SCOPE)) return json({ error: 'scope_missing' }, 400);

  // Google only returns a refresh token on first consent; keep the old one otherwise.
  if (g.data.refresh_token) await env.TOKENS.put('refresh', g.data.refresh_token);
  else if (!(await env.TOKENS.get('refresh'))) return json({ error: 'no_refresh_token' }, 400);

  const session = newSession();
  await env.TOKENS.put('sess:' + await sha256(session), email);
  return json({ access_token: g.data.access_token, expires_in: g.data.expires_in, session, email });
}

async function token(req, env, json) {
  if (!(await sessionOk(req, env))) return json({ error: 'reauth' }, 401);
  const refresh = await env.TOKENS.get('refresh');
  if (!refresh) return json({ error: 'reauth' }, 401);

  const g = await google(env, { refresh_token: refresh, grant_type: 'refresh_token' });
  if (!g.ok) {
    if (g.data.error === 'invalid_grant') { await env.TOKENS.delete('refresh'); return json({ error: 'reauth' }, 401); }
    return json({ error: 'refresh_failed', detail: g.data.error_description || g.data.error }, 502);
  }
  return json({ access_token: g.data.access_token, expires_in: g.data.expires_in });
}

async function signout(req, env, json) {
  const key = await sessionOk(req, env);
  if (key) await env.TOKENS.delete(key);
  return json({ ok: true });
}
