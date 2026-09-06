# Deploy Arcade Forge to an Azure VM

This guide deploys the MVP as two Docker containers on one Ubuntu VM: the Next.js/Codex application and PostgreSQL. Persistent Docker volumes hold the database, private game workspaces, published snapshots, and Codex thread state.

## 1. Create the VM

Create an Ubuntu 24.04 LTS VM. A reasonable private-beta starting point is 4 vCPUs, 8 GB RAM, and at least 64 GB of premium SSD storage. Codex generations are CPU-, memory-, and I/O-bursty, so avoid the smallest burstable VM sizes.

In the Network Security Group, allow:

- TCP 22 only from your administrator IP
- TCP 3000 from the intended audience for initial IP-based testing

Do not expose PostgreSQL port 5432. The Compose file exposes it only to the private Docker network.

## 2. Install Docker

SSH into the VM and install Docker Engine using Docker’s current Ubuntu instructions. Confirm that both commands work:

```bash
docker --version
docker compose version
```

Clone or copy this repository to the VM, then enter its directory.

## 3. Configure production secrets

Create `.env` from the example:

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Use one generated value for `POSTGRES_PASSWORD` and the other for `SESSION_SECRET`. Use URL-safe alphanumeric or hexadecimal text for the database password because Compose places it inside a connection URL.

Set the remaining values:

```dotenv
POSTGRES_PASSWORD=<random-hex-value>
SESSION_SECRET=<different-random-hex-value>
OPENAI_API_KEY=<server-side-openai-key>
# Set this instead if your Codex configuration uses an Azure OpenAI provider:
AZURE_OPENAI_API_KEY=
CODEX_CONFIG_PATH=./docker/codex-config.toml
APP_URL=http://<VM_PUBLIC_IP>:3000
APP_PORT=3000
CODEX_MODEL=
CODEX_REASONING_EFFORT=low
```

Restrict the file:

```bash
chmod 600 .env
```

`DATABASE_URL`, `WORKSPACE_ROOT`, and `PUBLISHED_ROOT` are supplied internally by Docker Compose and do not need production overrides.

## 4. Build and launch

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The app container waits for PostgreSQL, applies versioned migrations, and starts the web service. Check:

```bash
curl http://localhost:3000/api/health
```

Then visit `http://<VM_PUBLIC_IP>:3000` from a browser. Published games use URLs such as:

```text
http://<VM_PUBLIC_IP>:3000/g/my-game-randomslug
```

## 5. Updating

After installing a new application version:

```bash
docker compose build app
docker compose up -d app
docker compose logs --tail=100 app
```

Database migrations are forward-only and run automatically at startup.

## Backups

Back up all three data sets:

- PostgreSQL (`postgres_data`)
- Private and published game files (`game_data`)
- Codex session state (`codex_state`)

The database and game data must be backed up from approximately the same point in time. Thread state is useful but recoverable: if it is lost, a future adapter can start a new Codex thread from the stored conversation and current `index.html`.

## Production hardening

Before opening registration to the public:

1. Put a domain and HTTPS reverse proxy or Azure Application Gateway in front of port 3000. Change `APP_URL` to the exact `https://` origin; secure cookies will then be enabled automatically.
2. Close public access to port 3000 after the reverse proxy is active.
3. Move PostgreSQL to Azure Database for PostgreSQL or establish automated encrypted backups.
4. Move published artifacts to Blob Storage/CDN if traffic grows.
5. Add email verification, password reset, administrative controls, abuse detection, quotas, and per-tenant usage accounting.
6. Move Codex execution to disposable per-job containers or microVMs. Mount only one game workspace, disable network, and inject no database or publication credentials.
7. Add browser automation tests and malware/content moderation appropriate to your audience before publication.

The last point is essential for hostile multi-tenancy. A logical workspace directory plus the Codex sandbox is useful defense in depth, but the worker’s container or VM boundary should be the authoritative tenant isolation boundary.

The included app image installs Bubblewrap, following the official Codex Linux sandbox requirement. The Compose app service uses `seccomp=unconfined` and `apparmor=unconfined` so Bubblewrap can create its nested namespace and mounts inside Docker; this is scoped to the app container, does not add `SYS_ADMIN`, and does not use privileged mode. Bubblewrap remains the inner workspace sandbox. Review these settings with your infrastructure security policy, and replace the combined app/worker container with disposable job workers before a public launch.

## Codex sandbox smoke test

After creating or recreating the app container, confirm that both outer Docker restrictions are disabled for this service:

```bash
docker inspect "$(docker compose ps -q app)" \
  --format '{{json .HostConfig.SecurityOpt}}'
```

The result must include both `seccomp=unconfined` and `apparmor=unconfined`. Then verify that Bubblewrap can create its nested mount namespace:

```bash
docker compose exec -T app \
  bwrap --ro-bind / / --unshare-user --uid 0 true
```

Success produces no output and exits with status zero. `Failed to make / slave: Permission denied` means the running container still has an AppArmor restriction; recreate it after confirming the Compose settings instead of merely restarting it.

On Ubuntu 24.04, `bwrap: setting up uid map: Permission denied` means the host is still restricting unprivileged user namespaces. Following the official Codex Linux sandbox guidance, install and load Ubuntu's Bubblewrap profile on the VM host:

```bash
sudo apt update
sudo apt install -y apparmor-profiles apparmor-utils
sudo install -m 0644 \
  /usr/share/apparmor/extra-profiles/bwrap-userns-restrict \
  /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict
```

Run the smoke test again after loading the profile. If the profile is unavailable or does not resolve the restriction, the official fallback is `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. That fallback changes a host-wide security control, so use it only on a dedicated worker VM and review it before making it persistent.
