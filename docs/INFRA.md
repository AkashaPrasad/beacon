# Beacon infrastructure

What runs where, what `terraform plan` creates, how to apply and verify it, and the steps only
the owner can do. Day-2 operations (logs, rotation, scaling, restore, costs) are in
[RUNBOOK.md](./RUNBOOK.md).

```
Browser ──► Cloudflare Pages  beacon.spacesdrive.cc  (project "beacon", Direct Upload)
   │
   └──► api.beacon.spacesdrive.cc  (Cloudflare proxied, SSL Full (strict))
                │  80/443 open to Cloudflare ranges only
        ┌───────▼──────────────── EC2 beacon-app · t4g.small · ap-south-1a · EIP ──────┐
        │ caddy :80/:443 (Let's Encrypt HTTP-01) ─► api :4000 ─┐                          │
        │ worker :4001 (BullMQ, embeddings) ────────────────────┼─► redis :6379 (volume)  │
        │ instance role: ec2:Start/StopInstances on the standby only                      │
        └───────┬─────────────────────────────────────────────────────────────────────────┘
                │ http://<private-ip>:3002 (SG: beacon-app only)        MongoDB Atlas M0
        ┌───────▼──── EC2 beacon-firecrawl · t4g.large · normally STOPPED ─────────────┐
        │ firecrawl.service → docker compose: api, playwright-service, redis, rabbitmq,  │
        │ nuq-postgres (Firecrawl v2.11.162, unauthenticated, private only)             │
        └────────────────────────────────────────────────────────────────────────────────┘
```

## Files

| Path                                               | Purpose                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `infra/terraform/*.tf`                             | AWS: SGs, IAM, key pair, two instances, EIP, GitHub OIDC deploy role              |
| `infra/terraform/files/`                           | first-boot bash (`common.sh`, `app-bootstrap.sh`, `firecrawl-bootstrap.sh`, `kc`) |
| `infra/terraform/templates/`                       | cloud-init templates; Terraform embeds the files above and gzips the result       |
| `infra/compose/docker-compose.prod.yml`            | app box stack (caddy, api, worker, redis)                                         |
| `infra/compose/Caddyfile`                          | `api.beacon.spacesdrive.cc` → `api:4000`                                         |
| `infra/compose/deploy.sh`                          | server-side deploy step shared by CI and the laptop script                        |
| `infra/compose/firecrawl/`                         | standby compose file, `.env` template, `firecrawl.service`                        |
| `scripts/lib/env.sh`                               | safe `secrets.env` loader, `PROD_ENV` composer, ssh helpers                       |
| `scripts/infra-tfvars.sh`, `scripts/my-ip.sh`      | `terraform.tfvars` from `secrets.env` + current IP                                |
| `scripts/infra-apply.sh`                           | apply → outputs into `secrets.env` → Cloudflare → verify → stop standby           |
| `scripts/cloudflare-setup.sh`                      | idempotent DNS / Pages / SSL (`--check` = read-only)                              |
| `scripts/firecrawl-standby.sh`                     | `status \| start \| stop \| wait-ready \| ssh`                                    |
| `scripts/gh-secrets.sh`                            | every GitHub secret from `secrets.env` (`--list` = names only)                    |
| `scripts/deploy-api-local.sh`                      | the deploy-api workflow, from the laptop                                          |
| `.github/workflows/{ci,deploy-web,deploy-api}.yml` | CI, Pages deploy, image build + SSH deploy                                        |

State is local (`infra/terraform/terraform.tfstate`, git-ignored, along with `terraform.tfvars`).
`.terraform.lock.hcl` is committed, with checksums for darwin_arm64, linux_amd64 and linux_arm64.

## What the plan creates

`terraform plan` on 2026-10-27 (aws provider 6.70.0, http 3.6.3): **63 to add, 0 to change,
0 to destroy**. The account had no `beacon*` resources and no GitHub OIDC provider.

| Count | Resource                                                  | Notes                                                                                                 |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1     | `aws_key_pair.beacon`                                    | `beacon-key`, from `SSH_PUBLIC_KEY`                                                                  |
| 2     | `aws_security_group`                                      | `beacon-app`, `beacon-firecrawl` (default VPC)                                                      |
| 44    | ingress `app_cloudflare[*]`                               | 80 + 443 from each Cloudflare range (15 v4 + 7 v6, fetched at plan time)                              |
| 1     | ingress `app_ssh_admin`                                   | 22 from `admin_cidr` (current IP /32)                                                                 |
| 1     | ingress `firecrawl_api_from_app`                          | 3002 from SG `beacon-app` only                                                                       |
| 1     | ingress `firecrawl_ssh_admin`                             | 22 from `admin_cidr`                                                                                  |
| 4     | egress rules                                              | all traffic, IPv4 + IPv6, on both SGs                                                                 |
| 1     | `aws_iam_role.app` + 1 inline policy + 1 instance profile | Start/Stop on the standby ARN; DescribeInstances/DescribeInstanceStatus on `*`                        |
| 1     | `aws_instance.firecrawl`                                  | t4g.large, 30 GB gp3 (encrypted), IMDSv2 hop 1, public IP for egress                                  |
| 1     | `aws_instance.app`                                        | t4g.small, 20 GB gp3 (encrypted), IMDSv2 hop 2, instance profile                                      |
| 1     | `aws_eip.app`                                             | the API origin IP                                                                                     |
| 1     | `aws_iam_openid_connect_provider.github`                  | `token.actions.githubusercontent.com` (account-wide)                                                  |
| 1     | `aws_iam_role.gha_deploy` + 1 inline policy               | OIDC, `repo:AkashaPrasad/beacon:ref:refs/heads/main` only; Authorize/Revoke ingress on `beacon-app` |

AMI: latest Canonical `ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*`
(`ami-072d8688e7b3aba7a`, 2026-10-23, at plan time). Instances ignore later AMI and user-data
changes, so a newer image never replaces a box. Subnet: the default subnet of `ap-south-1a`
(t4g.small and t4g.large are offered in a, b and c). The account's standard vCPU quota is 8;
this uses 4.

Outputs: `app_public_ip`, `app_instance_id`, `app_security_group_id`, `firecrawl_instance_id`,
`firecrawl_private_ip`, `firecrawl_self_hosted_url`, `ssh_command`, `github_deploy_role_arn`,
`ami_id`.

### First boot (cloud-init)

Both boxes: swapfile (1 GB app, 2 GB standby), `vm.swappiness=10`, `vm.overcommit_memory=1`,
unattended-upgrades (security updates only, no automatic reboot), fail2ban (sshd, systemd
backend), key-only sshd, Docker Engine + compose plugin from download.docker.com, Docker logs
rotated, and Docker networks drawn from `10.201.0.0/16`. Docker's default pools include
`172.31.0.0/16`, the default VPC's CIDR, so a bridge there would swallow traffic to the
standby. The marker `/var/lib/beacon/bootstrap.done` records the result. The log is in
`/var/log/beacon-bootstrap.log`.

- App box: creates `/opt/beacon` (owned by `ubuntu`) and `/opt/beacon/incoming`, and installs
  `/usr/local/bin/kc` (a compose wrapper).
- Standby: shallow-clones Firecrawl `v2.11.162` to `/opt/firecrawl/src` and writes
  `/opt/firecrawl/docker-compose.yaml`. It renders `/opt/firecrawl/.env` with a Postgres password
  generated on the host, which never leaves it. It pulls `ghcr.io/firecrawl/firecrawl:2.11.162`
  (multi-arch), builds `playwright-service` and `nuq-postgres` from the pinned source, enables
  `firecrawl.service` (which runs `docker compose up -d` on every boot), and waits for
  `/v0/health/readiness`.

User-data is gzipped: the standby's YAML is 18.8 KB raw and 6.0 KB compressed, against EC2's
16 KB limit, which a Terraform precondition enforces.

## Firecrawl standby (BRIEF decision 3)

The config follows the upstream `docker-compose.yaml`, `SELF_HOST.md` and the official self-host
guide at the release it verifies, **v2.11.162**. Its "smallest working .env" is
`USE_DB_AUTHENTICATION=false` + `POSTGRES_USER/PASSWORD/DB` (`POSTGRES_DB=postgres` is required
by the bundled pg_cron). Upstream says the root `.env` only overrides variables the compose file
references, so every key in `firecrawl.env.template` is referenced in our compose file:
`PORT=3002`, `INTERNAL_PORT=3002`, `HOST=0.0.0.0`, `REDIS_URL=redis://redis:6379`,
`REDIS_RATE_LIMIT_URL`, `PLAYWRIGHT_MICROSERVICE_URL=http://playwright-service:3000/scrape`, and
concurrency settings sized for the box.

Deviations from upstream compose, all deliberate:

- The API comes from the published image. Building `apps/api` needs Rust, Go and pnpm, which
  would take most of an hour on this box.
- The FoundationDB services are dropped; they are an optional queue backend.
- `cpus` is capped at 2.0. Upstream's 4.0 is rejected on a 2-vCPU host.
- Memory limits and concurrency are lower, and services use `restart: unless-stopped`.

Lifecycle: `infra-apply.sh` lets it boot once, verifies a real `/v1/scrape` **from the app box**
(the same path and SG rule the worker uses), then **stops it**. From then on the worker starts
it with `ec2:StartInstances` and waits for readiness. After `FIRECRAWL_STANDBY_IDLE_MINUTES`
(20) idle, it stops it again. The private IP survives stop/start, so `FIRECRAWL_SELF_HOSTED_URL`
is stable. Start-to-ready is expected to take a few minutes (instance boot + compose up + harness
startup); measure it in the first drill and record it in RUNBOOK.md.

## Contract for the app code

| Item              | Value                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Images            | `ghcr.io/akashaprasad/beacon-api`, `ghcr.io/akashaprasad/beacon-worker`; `apps/<app>/Dockerfile`, build context = repo root, `linux/arm64`; tags `sha-<40-hex>` + `latest`                                                                                                                                            |
| API               | listens on **4000**; `/healthz` (liveness, used by the compose healthcheck and the deploy smoke test) and `/readyz`                                                                                                                                                                                                     |
| Worker            | **4001**: `/healthz` (compose healthcheck), `/metrics`; not published outside the compose network                                                                                                                                                                                                                       |
| Healthchecks      | run `node -e "fetch(...)"` inside the container, so images need no curl/wget, only `node` on PATH                                                                                                                                                                                                                       |
| Env               | `env_file: /opt/beacon/.env`, shared by api and worker (keys below). Compose sets `NODE_OPTIONS=--max-old-space-size=384` (api) / `640` (worker). Don't hard-code a larger heap in the Dockerfile `CMD`.                                                                                                               |
| Client IP         | Caddy sends `X-Forwarded-For: <client>` (from `CF-Connecting-IP`) as a single hop, so use `app.set('trust proxy', 1)` in Express                                                                                                                                                                                        |
| Body limit        | Caddy rejects bodies > 12 MB (resume upload limit is 10 MB)                                                                                                                                                                                                                                                             |
| AWS               | worker uses `@aws-sdk/client-ec2` with the **default credential chain** (instance role via IMDSv2; hop limit 2 makes it reachable from containers) and `AWS_REGION`. No static keys. Allowed: Start/Stop on `FIRECRAWL_INSTANCE_ID`, Describe* on all.                                                                  |
| Firecrawl standby | `FIRECRAWL_SELF_HOSTED_URL=http://<private-ip>:3002`, no auth header. Readiness: `GET /v0/health/readiness` → `{"status":"ok"}` (heartbeat only). Functional check: `POST /v1/scrape` (or `/v2/scrape`). Ask for `markdown`/`html` only: LLM formats (`json`, `extract`) need an LLM provider the standby doesn't have. |

### Server env file (`/opt/beacon/.env`)

`compose_prod_env` in `scripts/lib/env.sh` composes it from `secrets.env`. It reaches the server
as the `PROD_ENV` GitHub secret or through `deploy-api-local.sh`:

`MONGODB_URI MONGODB_DB REDIS_URL GOOGLE_CLIENT_ID JWT_SECRET ENCRYPTION_KEY LLM_PROVIDER
LLM_BASE_URL LLM_API_KEY LLM_MODEL EMBEDDING_PROVIDER EMBEDDING_MODEL FIRECRAWL_API_KEY
FIRECRAWL_DAILY_CREDIT_CAP FIRECRAWL_SELF_HOSTED_URL FIRECRAWL_INSTANCE_ID
FIRECRAWL_STANDBY_IDLE_MINUTES(=20) VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT WEB_URL
API_URL AWS_REGION NODE_ENV(=production) VECTOR_SEARCH(=atlas)` plus `SENTRY_DSN` when set.
Values with spaces, `#`, `$`, quotes or backslashes are single-quoted, which compose reads
literally.

`/opt/beacon/compose.env` holds only `BEACON_TAG` (plus optional `REDIS_MAXMEMORY_POLICY`). It
is the compose interpolation file (`--env-file`), so secrets are never interpolated into the
compose model.

## Decisions (one line each, for DECISIONS.md)

- **Redis `maxmemory-policy noeviction`, not SPEC's `allkeys-lru`.** BullMQ requires
  `noeviction` (LRU can silently evict job and lock keys), and `docker-compose.dev.yml` already
  uses it. Override with `REDIS_MAXMEMORY_POLICY=allkeys-lru` in `/opt/beacon/compose.env`.
  Rejected: following SPEC literally.
- **GitHub OIDC role opens port 22 for the runner IP during a deploy.** SSH is restricted to the
  owner's IP and hosted runners' IPs are unpredictable. Rejected: opening 22 to the world;
  SSM Run Command (more IAM and agent surface).
- **Native `ubuntu-24.04-arm` runners for the arm64 images.** They are free for public repos and
  avoid QEMU. Rejected: QEMU on x86 (5–10× slower).
- **Firecrawl API from the published image; playwright and nuq-postgres built from the pinned
  tag.** Fast first boot, and the schema and scraper still match the release. Rejected: a full
  source build (about an hour on a t4g.large).
- **Let's Encrypt HTTP-01 through the Cloudflare proxy.** Verified on this zone on 2026-10-27:
  with _Always Use HTTPS_ on, `http://<proxied-host>/.well-known/acme-challenge/*` still reaches
  the origin, while `/` gets a 301. TLS-ALPN is disabled since it can't work behind the proxy.
  Rejected: a Cloudflare Origin CA certificate (needs an extra token scope and manual renewal).
- **Gzipped user-data with files embedded as YAML block scalars.** Base64-in-YAML was 18.8 KB,
  over the 16 KB limit.
- **Node heap caps of 384 MB (api) and 640 MB (worker), not SPEC's 512/768.** A heap equal to
  the 512 MB cgroup limit gets OOM-killed before V8 can collect garbage, and onnxruntime memory
  lives outside the heap.
- **`secrets.env` is parsed, not `source`d.** An unquoted `&` in `MONGODB_URI` makes bash drop
  the variable and zsh fail to parse the file.
- **`cpu_credits = unlimited` on both instances.** No throttling for the API or short standby
  bursts; surplus costs $0.04 per vCPU-hour only if the CPU stays above baseline.

## Cloudflare (read-only checks, 2026-10-27)

`scripts/cloudflare-setup.sh --check` passed:

- **Token:** an _account-scoped_ API token (it verifies at `/accounts/{id}/tokens/verify`, not
  `/user/tokens/verify`). It is active and includes **Pages Write, DNS Write, Zone Settings
  Write, SSL and Certificates Write and Zone Read**, every scope the scripts need. It is also
  much broader than needed (Account API Tokens Write, Billing Write, Workers and more), so it
  should not live in CI. Create a narrow "Cloudflare Pages: Edit" token, put it in `secrets.env`
  as `CLOUDFLARE_PAGES_DEPLOY_TOKEN`, and `gh-secrets.sh` will use it.
- **Zone `spacesdrive.cc`:** active, Free plan.
- **SSL/TLS mode: `strict`** (Full (strict)), so the script leaves it alone. It only changes
  `off`/`flexible` to `strict`, and that is a **zone-wide** change.
- **Other settings:** `always_use_https` is on (fine, see Decisions); `min_tls_version` is 1.2.
- **Records and project:** there are no records yet for `api.beacon` or `beacon`, and no Pages
  project `beacon`. The script creates the project and attaches the custom domain. It then
  creates `CNAME beacon → <project subdomain>`, reading the real subdomain from the API, because
  `beacon.pages.dev` may already be taken globally (Cloudflare then assigns something like
  `beacon-abc.pages.dev`).

## Apply and verify (orchestrator, with the owner's approval)

```bash
cd /Users/akashaaprasad/Documents/Projects/mern-endterm
scripts/infra-apply.sh                 # shows the plan, asks "yes"; estimate 25-40 min end to end
#   tfvars → apply → outputs into secrets.env → cloudflare-setup → verify app box
#   → wait for standby bootstrap → /v1/scrape from the app box → stop standby
scripts/firecrawl-standby.sh status    # expect: stopped, private IP = FIRECRAWL_SELF_HOSTED_URL
scripts/gh-secrets.sh                  # after the owner adds the EIP to Atlas (see below)
gh workflow run deploy-api.yml && gh workflow run deploy-web.yml   # needs the repo pushed to GitHub
#   or, before the repo/CI exists:  scripts/deploy-api-local.sh  (needs Docker Desktop running)
```

Verification:

```bash
ssh -i ~/.ssh/<key> ubuntu@$APP_PUBLIC_IP 'cat /var/lib/beacon/bootstrap.done; kc ps'
curl -fsS https://api.beacon.spacesdrive.cc/healthz          # 200 through Cloudflare
curl -sI http://api.beacon.spacesdrive.cc/.well-known/acme-challenge/x   # 404 from Caddy, not a 301
curl -sI https://beacon.spacesdrive.cc | head -1             # 200 from Pages
scripts/firecrawl-standby.sh start && scripts/firecrawl-standby.sh wait-ready && scripts/firecrawl-standby.sh stop
scripts/cloudflare-setup.sh --check                           # records now present, proxied=true
```

## Manual owner steps

1. **Atlas network access:** Atlas → _Network Access_ → _Add IP Address_ → `$APP_PUBLIC_IP/32`
   (comment "beacon-app EIP"). Keep this laptop's IP for seeding and `mongosh`. Remove
   `0.0.0.0/0` once prod works. The standby never talks to Atlas.
2. **Google OAuth:** Google Cloud Console → _APIs & Services → Credentials →_ the OAuth client →
   _Authorised JavaScript origins_: add `https://beacon.spacesdrive.cc`, and keep
   `http://localhost:5173`. ID-token login needs no redirect URI.
3. **GHCR package visibility (one time, after the first image push):** github.com →
   _Profile → Packages → `beacon-api` → Package settings → Change visibility → Public_. Repeat
   for `beacon-worker`. Until then, deploys still work: `deploy-api.yml` logs the server in with
   the job's short-lived `GITHUB_TOKEN` (or a `GHCR_READ_TOKEN` PAT with `read:packages`, if that
   secret exists) and logs out after the pull. `deploy-api-local.sh` uses `gh auth token`. Check
   that each package's _Manage Actions access_ lists the `beacon` repo.
4. **Optional:** add `CLOUDFLARE_PAGES_DEPLOY_TOKEN` (Pages: Edit only) to `secrets.env` and
   rerun `scripts/gh-secrets.sh`. You can also quote `MONGODB_URI` in `secrets.env` so plain
   `source` works (the scripts handle both forms).
