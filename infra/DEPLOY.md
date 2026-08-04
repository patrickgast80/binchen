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

`git push origin main` → `coolify-deploy.yml` GitHub Actions workflow POSTs to
the Coolify deploy API, which rebuilds storefront + backend on the Hetzner box.

**Requires repo secret `COOLIFY_PAT`.** Without it the workflow logs a skip and
exits 0 — no auto-deploy happens. Coolify's built-in GitHub App integration is
present but has never delivered a webhook (BIL-2397 root cause), so this
workflow is the load-bearing path today.

Manual trigger without a push: run `coolify-deploy.yml` via `workflow_dispatch`
in the GitHub UI, hit the Coolify UI (Application → Deploy), or POST the API
with the PAT stored at `infra/.vault/coolify-pat.env`:

```
source infra/.vault/coolify-pat.env
curl -X POST -H "Authorization: Bearer $COOLIFY_PAT" \
  "$COOLIFY_API_BASE/deploy?uuid=$COOLIFY_STOREFRONT_UUID&force=false"
```

## What GitHub Actions still runs

- `ci.yml` — lint, typecheck, build on every PR + push to `main`. No deploy.
- `e2e-smoke.yml` — Playwright smoke against `https://bilulu.de` on push. No deploy.
- `tls-monitor.yml` — daily cert check (BIL-2393). No deploy.
- `coolify-deploy.yml` — Coolify deploy trigger on push to main (BIL-2397).

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
(a **board/CEO action**, not agent-actionable). Railway was disconnected on
2026-08-04 (BIL-2391); Vercel/Render disconnects are tracked in BIL-2396.
