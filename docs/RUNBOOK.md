# Beacon runbook

Day-2 operations. Topology, contracts and first-time setup are in [INFRA.md](./INFRA.md).
Every command runs from the repo root on the owner's laptop unless it says "on the box". Scripts
read `secrets.env` themselves and never print secret values.

## Quick reference

| What             | Where                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Web              | `https://beacon.spacesdrive.cc` (Cloudflare Pages project `beacon`)                                 |
| API              | `https://api.beacon.spacesdrive.cc` → EIP `$APP_PUBLIC_IP` (`beacon-app`, t4g.small)                |
| SSH              | `terraform -chdir=infra/terraform output -raw ssh_command`; user `ubuntu`, key `SSH_PRIVATE_KEY_PATH` |
| Stack on the box | `/opt/beacon/{docker-compose.prod.yml,Caddyfile,.env,compose.env}`; drive it with `kc …`             |
| Standby          | `beacon-firecrawl` (t4g.large), normally **stopped**; `scripts/firecrawl-standby.sh status`          |
| Bootstrap log    | `/var/log/beacon-bootstrap.log`, marker `/var/lib/beacon/bootstrap.done` (both boxes)               |

SSH is allowed from `admin_cidr` only. If your IP changed, run
`scripts/infra-tfvars.sh && terraform -chdir=infra/terraform apply`. That only updates the two
`*_ssh_admin` rules. `terraform.tfvars` is regenerated from `secrets.env` each time, so put
overrides (`APP_VOLUME_SIZE`, `FIRECRAWL_VOLUME_SIZE`, `FIRECRAWL_GIT_REF`, `FIRECRAWL_IMAGE_TAG`,
`CPU_CREDITS`, `AWS_INSTANCE_TYPE`, `FIRECRAWL_INSTANCE_TYPE`) in `secrets.env`, never in the tfvars file.

## Logs

```bash
ssh ubuntu@$APP_PUBLIC_IP
kc ps                                  # state + health of caddy, api, worker, redis
kc logs -f --tail=200 api              # pino JSON; pipe through `jq -R 'fromjson? // .'`
kc logs -f --tail=200 worker
kc logs --since=30m caddy | grep '"status":5'   # Caddy access log (JSON, stdout)
kc exec redis redis-cli info memory | grep -E 'used_memory_human|maxmemory_policy'
docker stats --no-stream               # memory vs limits (api 512m, worker 900m, redis 160m, caddy 64m)
journalctl -u docker --since today     # daemon
sudo fail2ban-client status sshd       # banned IPs
```

Logs are json-file with rotation: 10 MB × 5 for app containers, 5 MB × 3 for redis. Nothing is
shipped off the box. Set `SENTRY_DSN` in `secrets.env` and redeploy to get error reporting.

Standby logs (start it first):
`scripts/firecrawl-standby.sh ssh 'cd /opt/firecrawl && sudo docker compose logs --tail=200 api playwright-service'`.

## Deploy and roll back

- **Normal:** push to `main`. `deploy-api.yml` builds both images on arm64 runners, tags them
  `sha-<commit>` + `latest`, opens 22 for the runner via OIDC, uploads the bundle, runs
  `infra/compose/deploy.sh` (pull, up -d, health wait, public smoke test), then closes 22 again.
  `deploy-web.yml` builds `apps/web` and runs `wrangler pages deploy`.
- **Manual:** `gh workflow run deploy-api.yml` / `gh workflow run deploy-web.yml`. From the laptop,
  run `scripts/deploy-api-local.sh`, which needs Docker running and a gh token with
  `write:packages`.
- **Roll back the API:** redeploy an older tag. Every tag stays in GHCR.
  ```bash
  TAG=sha-<good-commit> scripts/deploy-api-local.sh --no-build
  # or on the box: sed -i 's/^BEACON_TAG=.*/BEACON_TAG=sha-<good>/' /opt/beacon/compose.env && kc up -d
  ```
- **Roll back the web:** Cloudflare dashboard → Pages → `beacon` → Deployments → pick one → _Rollback_.
- **Change only secrets:** update `secrets.env`, run `scripts/gh-secrets.sh`, then re-run
  deploy-api (or `deploy-api-local.sh --no-build`). The env file is rewritten on every deploy.

## Rotate keys

After any change: edit `secrets.env` → `scripts/gh-secrets.sh` → redeploy the API (and the web
app, for `VITE_*`).

| Secret                                   | How                                                                                                                                                                                                                                                                                                                                                                     | Side effects                                                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                             | `openssl rand -hex 32`                                                                                                                                                                                                                                                                                                                                                  | every session cookie becomes invalid; users sign in again                                                                                                                                              |
| `ENCRYPTION_KEY`                         | `openssl rand -hex 32`, **only** with a re-encryption pass                                                                                                                                                                                                                                                                                                              | users' stored BYOK API keys were encrypted with the old key. Without a migration that decrypts with the old key and re-encrypts with the new one, they become unreadable and users must re-enter them. |
| `LLM_API_KEY`                            | new key in the Meta Model API dashboard, then revoke the old one                                                                                                                                                                                                                                                                                                        | none (AI-off mode covers the gap)                                                                                                                                                                      |
| `FIRECRAWL_API_KEY`                      | Firecrawl dashboard                                                                                                                                                                                                                                                                                                                                                     | none; the standby takes over on 402                                                                                                                                                                    |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`                                                                                                                                                                                                                                                                                                                                      | existing push subscriptions stop working; clients must re-subscribe. Redeploy web too (`VITE_VAPID_PUBLIC_KEY`).                                                                                       |
| `GOOGLE_CLIENT_ID`                       | Google Cloud console (new OAuth client)                                                                                                                                                                                                                                                                                                                                 | redeploy both; add the JS origins to the new client                                                                                                                                                    |
| `MONGODB_URI` password                   | Atlas → Database Access → edit user → new password                                                                                                                                                                                                                                                                                                                      | brief API/worker errors until the redeploy finishes                                                                                                                                                    |
| `CLOUDFLARE_API_TOKEN`                   | Cloudflare → My Profile/Account → API Tokens → roll                                                                                                                                                                                                                                                                                                                     | update `secrets.env`; re-run `gh-secrets.sh`                                                                                                                                                           |
| `GHCR_READ_TOKEN` (if used)              | github.com → Settings → Developer settings → PAT                                                                                                                                                                                                                                                                                                                        | none                                                                                                                                                                                                   |
| SSH key                                  | new keypair → append the new public key to `~ubuntu/.ssh/authorized_keys` on **both** boxes (start the standby first) → test → remove the old line → update `SSH_PUBLIC_KEY` / `SSH_PRIVATE_KEY_PATH` → `scripts/infra-tfvars.sh && terraform … apply`, which replaces only the `beacon-key` key pair, not the instances → `scripts/gh-secrets.sh` (`SSH_PRIVATE_KEY`) | none, if you do it in this order                                                                                                                                                                       |
| Firecrawl standby Postgres password      | `sudo sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" /opt/firecrawl/.env && sudo docker compose -f /opt/firecrawl/docker-compose.yaml up -d --force-recreate` (on the standby)                                                                                                                                                             | queue state is reset (it is transient)                                                                                                                                                                 |

Never paste secrets into a GitHub issue, a commit or `docs/`. `gitleaks` runs on pre-commit.

## Scale up

- **Bigger app box (no code change):** set `AWS_INSTANCE_TYPE=t4g.medium` in `secrets.env` →
  `scripts/infra-tfvars.sh && terraform -chdir=infra/terraform apply`. The instance type changes
  in place with a stop/start of about 1–2 minutes of downtime. The EIP, disk and volumes stay.
  Then raise `mem_limit` (e.g. api 768m, worker 1.5g) and the matching `NODE_OPTIONS` in
  `infra/compose/docker-compose.prod.yml` and push.
- **Bigger disk:** set `APP_VOLUME_SIZE=30` in `secrets.env` → `scripts/infra-tfvars.sh` → apply (in place) → on the box:
  `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`.
- **Split the worker out:** add a second `aws_instance` from the app box pattern. Run only
  `worker` there. Point `REDIS_URL` at the app box's private IP; that needs an SG rule for 6379
  from the new box and Redis bound to the private interface.
- **Standby capacity:** `FIRECRAWL_INSTANCE_TYPE=t4g.xlarge` in `secrets.env` → `scripts/infra-tfvars.sh` → apply, while it is
  stopped. Then raise `NUM_WORKERS_PER_QUEUE` / `BROWSER_POOL_SIZE` in `/opt/firecrawl/.env`.

## Restore and rebuild

| Thing                 | Where it lives                                                     | Restore                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User data (MongoDB)   | Atlas M0. **M0 has no cloud backups.**                             | Take dumps yourself, e.g. weekly: `mongodump --uri "$MONGODB_URI" --db "$MONGODB_DB" --gzip --archive=beacon-$(date +%F).gz` (load `secrets.env` with `scripts/lib/env.sh` first). Restore: `mongorestore --uri … --gzip --archive=<file> --drop`. Recreate the Atlas Vector Search index on `listings.embedding` afterwards. |
| Queues/cache          | Redis volume `beacon_redis_data` (RDB every 60 s when ≥ 1 change) | Disposable. Jobs are idempotent and repeatable jobs re-register on worker start. `kc down && docker volume rm beacon_redis_data && kc up -d` resets it.                                                                                                                                                                       |
| TLS certificates      | volume `beacon_caddy_data`                                        | Disposable. Caddy re-issues via HTTP-01 on start (mind Let's Encrypt rate limits: 5 duplicate certs a week).                                                                                                                                                                                                                   |
| App box               | Terraform + cloud-init + the deploy                                | `terraform -chdir=infra/terraform apply -replace=aws_instance.app` → the EIP re-associates, so DNS is unchanged → `ssh-keygen -R $APP_PUBLIC_IP` → `scripts/deploy-api-local.sh --no-build` or re-run deploy-api                                                                                                               |
| Standby               | Terraform + cloud-init                                             | `terraform … apply -replace=aws_instance.firecrawl`. **Its private IP changes**, so run `scripts/infra-apply.sh` again (it rewrites `FIRECRAWL_*` in `secrets.env` and stops the standby), then `scripts/gh-secrets.sh` and redeploy the API.                                                                                  |
| Whole stack from zero |                                                                    | `scripts/infra-apply.sh` → `scripts/gh-secrets.sh` → deploys → the Atlas allow-list for the new EIP                                                                                                                                                                                                                            |

## Firecrawl standby

The worker runs it automatically: Firecrawl Cloud returns 402, or the credit cap is hit, or fewer
than 20 credits remain → Redis `crawler:backend=selfhosted` (6 h) → `StartInstances` → wait for
readiness → scrape → stop after 20 idle minutes. Manual control:

```bash
scripts/firecrawl-standby.sh status
scripts/firecrawl-standby.sh start
scripts/firecrawl-standby.sh wait-ready        # readiness + a real /v1/scrape, run from the app box
scripts/firecrawl-standby.sh stop              # always stop it when done (t4g.large is ~$0.045/h)
scripts/firecrawl-standby.sh ssh 'systemctl status firecrawl --no-pager'
```

- **Failover drill:** on the box, `kc exec redis redis-cli set crawler:backend selfhosted EX 3600`.
  Trigger a source refresh, then watch `kc logs -f worker` and `scripts/firecrawl-standby.sh status`.
  `kc exec redis redis-cli del crawler:backend` ends the drill.
- **Not coming up after start:** `scripts/firecrawl-standby.sh ssh 'sudo systemctl restart firecrawl; sudo docker compose -f /opt/firecrawl/docker-compose.yaml ps --all'`.
- **Upgrade Firecrawl:** review the target release's `docker-compose.yaml` and `SELF_HOST.md`.
  Set `FIRECRAWL_GIT_REF` / `FIRECRAWL_IMAGE_TAG` (e.g. `v2.11.x` / `2.11.x`) in `secrets.env`,
  run `scripts/infra-tfvars.sh`, and update `infra/compose/firecrawl/` if the compose contract changed. Then
  `terraform … apply -replace=aws_instance.firecrawl` and follow the "Standby" row above.

## Atlas network allow-list

Atlas → project → _Network Access_ → _IP Access List_:

1. _Add IP Address_ → `<APP_PUBLIC_IP>/32`, comment `beacon-app`.
2. Keep your laptop's IP (`scripts/my-ip.sh`) for seeding and `mongosh`.
3. Once prod reads and writes (feed loads, `kc logs worker` shows no `MongoServerSelectionError`),
   delete `0.0.0.0/0`.
4. If the EIP ever changes (`terraform destroy`/recreate), update step 1 before deploying.

## Monthly cost (ap-south-1, on-demand, AWS Price List API 2026-10-27)

| Item                                                                               | Unit price    | Per month                             |
| ---------------------------------------------------------------------------------- | ------------- | ------------------------------------- |
| `beacon-app` t4g.small, 730 h                                                     | $0.0112/h     | **$8.18**                             |
| App root volume, 20 GB gp3                                                         | $0.0912/GB-mo | **$1.82**                             |
| Elastic IP (public IPv4, in use), 730 h                                            | $0.005/h      | **$3.65**                             |
| Standby root volume, 30 GB gp3 (billed while stopped too)                          | $0.0912/GB-mo | **$2.74**                             |
| Standby t4g.large, only while running (e.g. 20 h/mo)                               | $0.0448/h     | $0.90                                 |
| Standby public IPv4, only while running (20 h)                                     | $0.005/h      | $0.10                                 |
| T4g surplus CPU credits (only if CPU stays above baseline)                         | $0.04/vCPU-h  | usually $0                            |
| Data transfer out (first 100 GB/mo free)                                           |               | $0                                    |
| Cloudflare Free (DNS, proxy, Pages), Atlas M0, GitHub Actions + GHCR (public repo) |               | $0                                    |
| **Baseline**                                                                       |               | **≈ $16.40 + standby usage ≈ $17.40** |

`t4g.medium` instead of t4g.small adds $8.18 (it costs $0.0224/h, $16.35/mo). Leaving the standby
running all month by mistake adds $32.70 + $3.65. AWS Free-plan credits ($100–$200 for accounts
created after July 2025) cover this for the semester, if they apply to the account.

## Teardown

```bash
scripts/cloudflare-setup.sh --check     # note the record IDs, then delete A api.beacon / CNAME beacon in the dashboard
terraform -chdir=infra/terraform destroy
```

The OIDC provider is account-wide. If something else starts using it, set
`create_github_oidc_provider=false` first so a destroy doesn't remove it.
