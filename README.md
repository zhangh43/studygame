# Arcade Forge

Arcade Forge is a multi-tenant web service for creating small, self-contained browser games through conversation. Users own private game workspaces and persistent coding sessions, then publish validated, immutable versions at `/g/<public-slug>`.

The first harness adapter uses the server-side [OpenAI Codex SDK](https://learn.chatgpt.com/docs/codex-sdk). The application-facing interface is provider-neutral, so another coding harness can be added later without changing the UI or game data model.

## Included in this MVP

- Email/password registration and opaque server-side sessions
- Tenant-scoped games, messages, jobs, and artifacts in PostgreSQL
- One persistent Codex thread and workspace per game
- Streaming harness activity into the chat UI
- Browser-only, single-file game policy
- File-size and unsafe-capability validation with one automatic repair attempt
- Authenticated draft previews in sandboxed iframes
- Immutable publish snapshots and public game URLs
- Publish and unpublish controls
- Docker Compose deployment for an Azure VM

## Architecture

```text
Browser → Next.js UI/API → PostgreSQL
                        → GameHarness interface → Codex SDK → game workspace
                                                  ↓
                                         validation + snapshot
                                                  ↓
                                          public /g/<slug>
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

Open <http://localhost:3000>, register an account, create a game, and describe it in the studio chat.

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
| `APP_URL` | Public origin; controls secure session cookies |
| `SESSION_SECRET` | At least 32 random characters used to bind session tokens |
| `OPENAI_API_KEY` | Server-only credential passed to the Codex SDK |
| `AZURE_OPENAI_API_KEY` | Optional credential forwarded when the mounted Codex configuration uses an Azure OpenAI provider |
| `CODEX_CONFIG_PATH` | Optional read-only Codex configuration file mounted by Compose |
| `CODEX_MODEL` | Optional explicit Codex model; blank uses the SDK default |
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

On Linux, Codex uses Bubblewrap for `workspace-write`. The image installs the distribution package as required by the official sandbox documentation. Compose disables Docker's outer seccomp profile for the app container because that profile blocks Bubblewrap's namespace creation; the app is not privileged and receives no added Linux capabilities. Bubblewrap then applies the narrower workspace sandbox to agent commands.

The Codex child process receives an allowlisted environment rather than the full application environment. Generated HTML is checked for configured database, session, and model-provider secrets, and a failed or unchanged turn restores the previous draft.

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
