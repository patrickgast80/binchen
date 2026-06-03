# Railway Backend Setup Runbook

## First-time setup (run once, needs RAILWAY_TOKEN)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login with your token
export RAILWAY_TOKEN=<from board credentials>
railway login --browserless

# 3. Create or link project
railway init          # creates new project
# OR
railway link          # links existing project

# 4. Add Postgres add-on (Railway managed)
railway add --plugin postgresql
# DATABASE_URL is injected automatically into the service env

# 5. Set required secrets (replace placeholder values)
railway variables --set "JWT_SECRET=$(openssl rand -base64 32)"
railway variables --set "COOKIE_SECRET=$(openssl rand -base64 32)"
railway variables --set "STRIPE_SECRET_KEY=sk_test_..."
railway variables --set "STRIPE_WEBHOOK_SECRET=whsec_..."
railway variables --set "PAYPAL_CLIENT_ID=..."
railway variables --set "PAYPAL_CLIENT_SECRET=..."
railway variables --set "STORE_CORS=https://binchen-storefront.vercel.app"
railway variables --set "ADMIN_CORS=https://binchen-storefront.vercel.app"
railway variables --set "AUTH_CORS=https://binchen-storefront.vercel.app"

# 6. First deploy (from repo root — builds via apps/backend/Dockerfile)
railway up --service backend --detach

# 7. Get the public URL
railway domain

# 8. Update MEDUSA_BACKEND_URL with the real URL
railway variables --set "MEDUSA_BACKEND_URL=https://<railway-domain>"

# 9. Verify
curl https://<railway-domain>/health
# → {"status":"ok"} with HTTP 200
curl https://<railway-domain>/store/products
# → {"products":[], ...} with HTTP 200 (empty until seed)
```

## Rollback

```bash
# List deployments
railway deployments

# Roll back to previous deployment
railway rollback
```

## GitHub Actions wiring (after first manual deploy)

Add these secrets to the GitHub repo (`Settings > Secrets and variables > Actions`):

| Secret | Value |
|--------|-------|
| `RAILWAY_TOKEN` | Service token from Railway project settings |

Add this variable (non-secret) to the `staging` GitHub Actions environment:

| Variable | Value |
|----------|-------|
| `RAILWAY_BACKEND_URL` | `https://<railway-domain>` |

## PayPal webhook setup (after first deploy)

1. Go to https://developer.paypal.com → Apps & Credentials → your sandbox app
2. Scroll to **Webhooks** → Add Webhook
3. URL: `https://<railway-domain>/hooks/payment/paypal_pp`
4. Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`
5. Copy the Webhook ID → `railway variables --set "PAYPAL_AUTH_WEBHOOK_ID=<id>"`
6. Redeploy: `railway up --service backend --detach`
