# Arcade Forge

Arcade Forge is a multi-tenant web service for creating small, self-contained browser games through conversation. Users own private game workspaces and persistent coding sessions, then publish validated, immutable versions at `/g/<public-slug>`.

The first harness adapter uses the server-side [OpenAI Codex SDK](https://learn.chatgpt.com/docs/codex-sdk). The application-facing interface is provider-neutral, so another coding harness can be added later without changing the UI or game data model.

## Included in this MVP

- Email-or-username/password registration and opaque server-side sessions
- Persistent English/Chinese interface switching
- Tenant-scoped games, messages, jobs, and artifacts in PostgreSQL
- One persistent Codex thread and workspace per game
- Streaming harness activity into the chat UI
- Browser-only, single-file game policy
- File-size and unsafe-capability validation with one automatic repair attempt
- Authenticated draft previews in sandboxed iframes
- Immutable publish snapshots and public game URLs
- Publish and unpublish controls
- Public game discovery and creator profile pages
- One-star-per-user reactions and authenticated comments
- Top-games and top-creators leaderboards
- Per-game and per-creator star totals
- Thirty-connection PostgreSQL pool and bounded Codex concurrency
- Disconnect-tolerant generation streams with keepalive events and traceable JSON logs
- Optional automatic HTTPS through Caddy
- Docker Compose deployment for an Azure VM

## Architecture

```text
Browser → Next.js UI/API → PostgreSQL
                        → GameHarness interface → Codex SDK → game workspace
                                                  ↓
                                         validation + snapshot
                                                  ↓
                                  social /play/<slug> → sandboxed /g/<slug>
```

The application stores product state in PostgreSQL. Codex thread state is also persisted by the Codex runtime under its configured home directory. PostgreSQL remains the source of truth for mapping a tenant-owned game to a thread ID and workspace.

Publishing never exposes the writable workspace. It copies a validated `index.html` into an immutable revision directory and updates the database pointer.

## Run locally

Requirements:

- Node.js 20.9 or newer
- PostgreSQL 15 or newer, or Docker
- An OpenAI API key with Codex access

Create the environment file:

```bash
cp .env.example .env
```

Set a long random `SESSION_SECRET`, a database password, and `OPENAI_API_KEY`. If PostgreSQL is installed locally, make `DATABASE_URL` match it. Then:

```bash
npm install
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>, register with an email address or user name and a password of at least six characters, create a game, and describe it in the studio chat. Published games appear in `/discover`; their social play pages live at `/play/<slug>` while `/g/<slug>` remains the isolated game document. Use the EN/中文 switch in the lower-right corner to persist the interface language.

To run PostgreSQL through Docker while keeping the app on your host, use port 5433 as shown in `.env.example`:

```bash
docker compose up -d db
npm run db:migrate
npm run dev
```

In that case, keep the host-facing `DATABASE_URL` from `.env.example`. PostgreSQL is bound only to `127.0.0.1:5433`; the Compose app service overrides the URL with the internal `db` hostname when the whole stack runs in Docker. If you use a separately installed PostgreSQL on port 5432 instead, adjust `DATABASE_URL` as needed.

To run everything in containers:

```bash
docker compose up -d --build
docker compose logs -f app
```

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for host development |
| `POSTGRES_PASSWORD` | Password used by Docker Compose |
| `POSTGRES_MAX_CONNECTIONS` | PostgreSQL server connection limit; Compose defaults to `100` |
| `DB_POOL_MAX` | Maximum database connections per application container; defaults to `30` |
| `APP_BIND_ADDRESS` | Host address for the direct app port; use `127.0.0.1` behind HTTPS |
| `APP_URL` | Public origin; controls secure session cookies |
| `DOMAIN` | Public DNS name used by the optional Caddy HTTPS profile |
| `SESSION_SECRET` | At least 32 random characters used to bind session tokens |
| `OPENAI_API_KEY` | Server-only credential passed to the Codex SDK |
| `AZURE_OPENAI_API_KEY` | Optional credential forwarded when the mounted Codex configuration uses an Azure OpenAI provider |
| `CODEX_CONFIG_PATH` | Optional read-only Codex configuration file mounted by Compose |
| `CODEX_MODEL` | Optional explicit Codex model; blank uses the SDK default |
| `CODEX_REASONING_EFFORT` | Optional reasoning effort; Compose defaults to `low` for responsive game generation |
| `HARNESS_MAX_CONCURRENCY` | Maximum simultaneous Codex runs per app container; defaults to `4` |
| `WORKSPACE_ROOT` | Private writable game workspaces |
| `PUBLISHED_ROOT` | Immutable published artifacts |
| `HARNESS_PROVIDER` | Currently `codex` |

Generate secrets with `openssl rand -hex 32`. Never expose `OPENAI_API_KEY` to the browser.

For local Docker development with a custom provider, set `CODEX_CONFIG_PATH` to the absolute path of your existing `config.toml` and export its required credential, such as `AZURE_OPENAI_API_KEY`, before running Compose. Only the configuration file is mounted read-only. Container thread state stays in the separate `codex_state` volume. Never mount the entire host `.codex` directory into the container: its SQLite thread store contains host-specific paths and must not be shared concurrently across operating systems.

For Azure with the standard OpenAI provider, keep the default empty `docker/codex-config.toml` and provide `OPENAI_API_KEY`.

## Harness adapter

`src/lib/harness/types.ts` is the provider contract. `CodexHarness` starts or resumes a thread with:

- The game workspace as `workingDirectory`
- `workspace-write` sandbox mode
- Network and web search disabled
- Non-interactive approvals
- A fixed browser-game policy around the untrusted tenant request

The thread ID is recorded only after Codex emits `thread.started`. Each subsequent message resumes that thread in the same workspace.

On Linux, Codex uses Bubblewrap for `workspace-write`. The image installs the distribution package as required by the official sandbox documentation. Compose disables Docker's outer seccomp and AppArmor profiles for the app container because they block Bubblewrap's nested namespace and mount setup; the app is not privileged and receives no added Linux capabilities. Bubblewrap then applies the narrower workspace sandbox to agent commands.

The Codex child process receives an allowlisted environment rather than the full application environment. Generated HTML is checked for configured database, session, and model-provider secrets, and a failed or unchanged turn restores the previous draft.

## Concurrency and diagnostics

Logged-in users do not reserve database connections. A connection is borrowed only while a query is running, so the default 30-connection application pool supports substantially more than 30 signed-in or browsing users. Expensive Codex jobs are separately limited by `HARNESS_MAX_CONCURRENCY`; excess jobs wait in memory and the UI reports that it is waiting for a coding slot. The unique database index on running jobs still prevents two generations from modifying the same game simultaneously.

Generation is not cancelled when the browser reloads or its SSE connection drops. The server continues the job, validates the result, and saves it. The stream sends a keepalive every 15 seconds for reverse proxies. Application logs are single-line JSON with events such as `generation.started`, `harness.run_finished`, `harness.command_failed`, and `generation.failed`. Errors shown in the UI include the same `traceId` recorded in the logs.

To run the included automatic HTTPS proxy after pointing a DNS name at the server:

```bash
docker compose --profile https up -d --build
```

Set `DOMAIN` to the DNS name, `APP_URL` to its exact `https://` origin, and `APP_BIND_ADDRESS=127.0.0.1`. Caddy obtains and renews the public certificate and disables response buffering for generation streams.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Current security boundary

The web application strictly scopes database queries and workspace paths by the authenticated tenant. Generated games are capability-checked and served with a restrictive Content Security Policy inside sandboxed iframes.

The supplied single-container deployment is appropriate for development and a controlled private beta. Although Codex uses its own filesystem sandbox, all game workspaces are mounted into the same application container. Before accepting mutually untrusted public tenants, run every harness job in a disposable container or microVM that mounts only that game’s workspace and contains no application/database secrets. Keep the existing `GameHarness` interface and move its implementation behind a queue/worker boundary.

See [DEPLOY_AZURE.md](./DEPLOY_AZURE.md) for the VM deployment procedure and production checklist.
