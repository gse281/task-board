# Gmail token Worker

Keeps a Google refresh token so `email.html` signs in once and stays signed in.
Free Cloudflare Worker + KV. The page sends a one-time auth code; the Worker
stores the refresh token and hands back fresh 1-hour access tokens on request.

## Setup (one time)

### Google Cloud Console (same project as the existing OAuth client)
1. **APIs & Services → OAuth consent screen → Audience → Publish app** ("In production").
   In "Testing" mode Google kills refresh tokens after 7 days. No verification
   needed for personal use; you will see an "unverified app" warning once — click
   Advanced → Go to app.
2. **Credentials → your Web client**: copy the **Client secret** (create one if none).
   Authorized JS origin `https://gse281.github.io` stays as is. No redirect URI needed.

### Cloudflare (free account)
1. Workers & Pages → Create → Worker → name `gmail-token` → Deploy.
2. Edit code → paste `gmail-token-worker.js` → Deploy.
3. Storage & Databases → KV → Create namespace `gmail-tokens`.
4. Worker → Settings → Bindings → Add → KV namespace: variable name `TOKENS`, namespace `gmail-tokens`.
5. Worker → Settings → Variables and Secrets:
   - Secret `GOOGLE_CLIENT_ID` = the client ID
   - Secret `GOOGLE_CLIENT_SECRET` = the client secret
   - Text `ALLOWED_EMAIL` = the Gmail address to allow
   - Text `ALLOWED_ORIGIN` = `https://gse281.github.io`
6. Copy the Worker URL (`https://gmail-token.<you>.workers.dev`).

### Page
email.html → Live Gmail → paste the Worker URL into **Token backend URL** → Save →
Sign in with Google (once).

Without a Worker URL the page keeps the old ~1-hour browser-only sign-in.
