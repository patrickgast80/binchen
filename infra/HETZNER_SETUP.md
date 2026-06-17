# Hetzner CX22 + Coolify Runbook (BIL-1544)

> Target shape: one CX22 VPS in **NBG1 (Nürnberg)** running **Coolify** as a self-hosted PaaS.
> Coolify hosts the Medusa backend (`apps/backend`, see [BIL-1545](/BIL/issues/BIL-1545)) and Postgres,
> Vercel keeps the storefront. DNS via Cloudflare.

---

## 0. Prerequisites (board action)

These are the only things DevOps cannot do alone. The CEO walks through
`infra/HETZNER_CEO_CHECKLIST.md` and posts back to [BIL-1544](/BIL/issues/BIL-1544):

- Hetzner Cloud project `bilulu` exists, AVV signed in the customer account.
- SSH **public** key uploaded to the project, labelled `board@bilulu`.
- API token (Read & Write) created → posted to DevOps via the secret-handoff channel.
- DNS record `coolify.bilulu.de` → CX22 IP added at Cloudflare (after server is up).

Once DevOps has the API token and SSH key fingerprint, it executes everything below.

---

## 1. Provision the CX22

Option A — `hcloud` CLI (preferred, scriptable):

```bash
# DevOps workstation, after `brew install hcloud` / `scoop install hcloud`
export HCLOUD_TOKEN='…provided by CEO…'
hcloud context create bilulu

# Sanity
hcloud ssh-key list                       # expect "board@bilulu"
hcloud server-type describe cx22          # 2 vCPU, 4 GB RAM, 40 GB disk

# Create the server with our cloud-init.
hcloud server create \
  --name bilulu-prod-01 \
  --type cx22 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key board@bilulu \
  --user-data-from-file infra/hetzner-cloud-init.yaml
```

Option B — Hetzner Console (only if CLI is unavailable):

1. Cloud Console → **Add Server** → Location **NBG1** → Image **Ubuntu 24.04** → Type **CX22**.
2. **SSH keys**: tick `board@bilulu`.
3. **Cloud-Init**: paste the contents of `infra/hetzner-cloud-init.yaml`. **Edit
   `ssh_authorized_keys[0]`** to the actual public key before clicking *Create*.
4. Name `bilulu-prod-01`, no backups yet (added in step 5).

Either way, write the IPv4 address into the BIL-1544 update.

---

## 2. Verify hardening + Docker (first SSH)

```bash
ssh deploy@<SERVER-IP>
sudo /usr/local/bin/bilulu-health
```

Expected output:

- `ufw status verbose` → active, `22/tcp 80/tcp 443/tcp` ALLOW IN, default deny.
- `fail2ban-client status sshd` → `jail is started`.
- `docker version` → server version 26.x or newer.
- `swapon --show` → `/swapfile 2G`.

If any of these are missing, **do not install Coolify by hand** — re-run the bootstrap by
fixing `infra/hetzner-cloud-init.yaml` and recreating the server (it is empty at this point).

---

## 3. Coolify first-run wizard

Cloud-init kicked off `install-coolify.sh`. After ~3 minutes:

```bash
# From your workstation
curl -I http://<SERVER-IP>:8000
# → HTTP/1.1 302 (redirect to /register on first boot)
```

Open `http://<SERVER-IP>:8000` once. Coolify shows the registration form:

- Email: `devops@binchen.de` (or the CEO's preferred admin address).
- Password: generate 32-char from `openssl rand -base64 24` and store under
  **infra/.vault/coolify-admin.env** (gitignored — see `SECRETS.md`).
- Click **Register** → Coolify creates the root admin.

> **Do not** enable any public dashboard yet — we still serve plain HTTP on `:8000`.

---

## 4. Domain + Let's Encrypt for the dashboard

Once the board confirms the Cloudflare A record `coolify.bilulu.de → <SERVER-IP>` exists
(grey-cloud / DNS-only) and propagated:

```bash
dig +short coolify.bilulu.de             # expect the CX22 IP
```

In Coolify:

1. **Settings → Instance Settings → Instance Domain** = `https://coolify.bilulu.de`.
2. Save → Coolify reconfigures its bundled Caddy and requests a Let's Encrypt cert.
3. Within ~30 s, `https://coolify.bilulu.de` returns 200 with a valid cert.

Verification:

```bash
curl -sSI https://coolify.bilulu.de | head -1          # HTTP/2 200
curl -sS https://coolify.bilulu.de/api/health | jq .   # {"status":"ok"}
echo | openssl s_client -connect coolify.bilulu.de:443 -servername coolify.bilulu.de 2>/dev/null \
  | openssl x509 -noout -issuer -dates
# Issuer should be Let's Encrypt; notBefore today.
```

---

## 5. Backups

Two layers:

1. **Hetzner Backups** — Cloud Console → Server → **Backups** → enable (~20 % of server cost,
   so ~€1/mo). Daily snapshot, 7-day retention. This is our point-in-time disaster recovery.
2. **App-level Postgres dump** — once Backend deploys Medusa in Coolify
   ([BIL-1545](/BIL/issues/BIL-1545)), we add a Coolify scheduled backup of the Postgres
   service to S3-compatible storage (Hetzner Object Storage, separate issue).

Restore test: tracked separately, must happen before BIL-1 cutover.

---

## 6. Coolify API token for Backend / Frontend agents

In Coolify → **Settings → API Tokens → Generate**, scope `read:projects`, `write:applications`,
`write:deployments`. Hand the token to:

- Backend follow-up issue (Medusa deploy in Coolify) — link in BIL-1545 thread.
- Frontend (only if they need preview environments outside Vercel — usually not).

Token lives in **infra/.vault/coolify-api.env** locally, and in GitHub Actions as
`COOLIFY_API_TOKEN` when CI-driven deploys are wired.

---

## 7. Post results

Post one comment on [BIL-1](/BIL/issues/BIL-1) with:

- VPS IPv4 + IPv6
- `https://coolify.bilulu.de`
- A copy of `bilulu-health` output (sanitised — no public keys, no tokens)

Close BIL-1544 as `done`.

---

## Rollback

The blast radius before any apps are deployed is the CX22 itself.

```bash
# Destroy the server (we still have the cloud-init in git).
hcloud server delete bilulu-prod-01

# Recreate with the same one-liner from step 1 once the issue is fixed.
```

After backend is live, rollback shifts to *Coolify deploy rollback* + *DB restore from
Hetzner snapshot* — documented separately when BIL-1545 ships.

---

## Observability hooks (added immediately after step 4)

- Better Stack uptime monitor on `https://coolify.bilulu.de/api/health` → alert CEO + DevOps.
- Sentry already used by app workloads — no Sentry at the VPS layer.
- Hetzner alerts: CPU > 90 % for 15 m, disk > 80 % → DevOps email.
- Cost alert: Hetzner monthly threshold €15 (catches accidental large servers).

---

## Cost summary

| Item              | Monthly (EUR) |
|-------------------|---------------|
| CX22 NBG1         | 4.51          |
| Backups (20 %)    | 0.90          |
| **Total**         | **≈ 5.41**    |

Well under the €50/mo CEO-approval threshold but the **first** recurring cloud cost for
this project — so a board approval is still requested before the first `hcloud server create`.
