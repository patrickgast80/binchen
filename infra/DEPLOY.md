# Deploy path — bilulu.de

**One deploy target. One trigger.** Everything else was removed in BIL-2396.

## Where the app runs

- **Host:** Hetzner (188.245.40.74), managed by Coolify.
- **Proxy:** Traefik with Let's Encrypt (see `RUNBOOK.md` → TLS-Alarm if certs flip to the default cert).
- **Domains served by this host:**
  - `bilulu.de`, `www.bilulu.de` → Next.js storefront
  - `api.bilulu.de` → MedusaJS backend

Verify at any time:
```
curl -sI https://bilulu.de/ | grep -E "X-Powered-By|Server"
# Expected: X-Powered-By: Next.js  (no Vercel / no Cloudflare header)
```

## What triggers a deploy

`git push origin main` → **Coolify's built-in GitHub integration** picks the
commit up and rebuilds the storefront and backend services on the Hetzner box.

There is no GitHub Actions workflow that pushes to a Coolify webhook. If we
ever need to trigger a manual redeploy without a push, use the Coolify UI
(Application → Deploy) or the Coolify API with the PAT stored at
`infra/.vault/coolify-pat.env`.

## What GitHub Actions still runs

- `ci.yml` — lint, typecheck, build on every PR + push to `main`. No deploy.
- `e2e-smoke.yml` — Playwright smoke against `https://bilulu.de` on push. No deploy.
- `tls-monitor.yml` — daily cert check (BIL-2393). No deploy.

Removed in BIL-2396: `preview.yml`, `staging.yml`, `production.yml`,
`keepalive.yml`, plus `vercel.json` and `render.yaml`. See rollback below if
you need to bring a PaaS target back online.

## Rollback

Restore any file removed in BIL-2396:
```
git revert <BIL-2396 commit sha>
```

That alone will not re-enable Vercel/Render/Railway deploys — those platforms
must also be reconnected to the GitHub repo from their respective dashboards
(a **board/CEO action**, not agent-actionable — see BIL-2391 for Railway and
the parent BIL-2396 for Vercel/Render).
