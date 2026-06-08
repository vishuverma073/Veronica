# Veronica

Monorepo with two apps:

- `veronica-api-` — backend API (Hono + Drizzle), runs on **:8787**. Uses a remote Supabase Postgres, so no local DB needed.
- `veronica-india` — frontend (Next.js), runs on **:3000**. Already pointed at the backend via `.env.local`.

## Run locally (both)

Open two terminals from the repo root:

```bash
# 1. Backend  → http://localhost:8787
cd veronica-api- && pnpm install && pnpm dev

# 2. Frontend → http://localhost:3000
cd veronica-india && npm install && npm run dev
```

Then open http://localhost:3000 (admin at http://localhost:3000/admin).

## Notes

- Env files already exist: `veronica-api-/apps/api/.env` and `veronica-india/.env.local`. Copy from the matching `.example` if missing.
- `pnpm install` / `npm install` can be skipped once dependencies are installed.
- Frontend without the backend: set `NEXT_PUBLIC_USE_MOCKS=true` in `veronica-india/.env.local` to use in-browser mocks.
- "Port already in use" just means the app is already running — open the URL above.

## Local dev notes

- **Login / OTP**: SMS is in stub mode (no MSG91 keys), so the one-time code is **printed in the backend terminal** instead of texted. After you tap “Send code”, look for **`🔐 DEV OTP for +91…: 123456`** in the terminal running `pnpm dev`.
- **Cart**: in dev the cart is stored in `sessionStorage`, so each fresh browser session starts empty (reloads within a session keep it). Production uses `localStorage`.
- The backend allows CORS from `localhost`/`127.0.0.1` automatically; add deployed frontend origins via `CORS_ORIGINS` (comma-separated) in the API `.env`.

## Online orders — production minimum

Everything below the site/admin baseline. Skip Resend, Inngest, Sentry, Slack, etc. until later.

**API** (`veronica-api-/apps/api/.env`):

| Variable | Why |
|----------|-----|
| `DATABASE_URL` | Cart, orders, users |
| `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` | Customer login session |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID` | Phone OTP (required in production — no SMS = no login) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payment modal + webhook |
| `CORS_ORIGINS=https://yourdomain.com` | Browser → API |
| `STOREFRONT_URL=https://yourdomain.com` | Order tracking links |
| `NODE_ENV=production` | Disables dev OTP/payment shortcuts |

Register Razorpay webhook: `POST https://<api-host>/webhooks/razorpay`

**Frontend** (`veronica-india/.env.local` on Vercel):

```
NEXT_PUBLIC_API_URL=https://<api-host>
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_MOCK_PAYMENTS=false
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

**Local test flow (no MSG91 yet):** keep `ENABLE_DEV_AUTH_BYPASS=1` on the API, use Razorpay **test** keys, OTP appears in the API terminal (`🔐 DEV OTP`).
