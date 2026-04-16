# PetMed Operations & Procurement Suite

**Project Type:** fullstack

A local-network/offline-first web application for managing pet pharmaceutical catalogs, internal procurement ordering, seat-style inventory locking, warehouse fulfillment dispatch, and outcomes/evidence management.

## Quick Start

```bash
docker-compose up
# or equivalently:
docker compose up --build
```

All dependencies run inside Docker. No external services or local runtimes required.

Services will be available at:
- **Frontend:** http://localhost:5175
- **Backend API:** http://localhost:3020
- **PostgreSQL:** localhost:5434

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| admin | password123 | Administrator (full access) |
| buyer1 | password123 | Buyer (catalog, cart, holds) |
| dispatcher1 | password123 | Dispatcher (task board) |
| reviewer1 | password123 | Admin + Outcomes Reviewer |
| reviewer2 | password123 | Outcomes Reviewer (no admin) |

## Port Reference

The docker-compose project name is **`petmed`** (set in `docker-compose.yml`).

| Service | Container Port | Host Port | URL |
|---|---|---|---|
| Frontend (SvelteKit) | 3000 | **5175** | http://localhost:5175 |
| Backend API (Fastify) | 3020 | **3020** | http://localhost:3020 |
| PostgreSQL | 5432 | **5434** | `localhost:5434` |

## Architecture

```
Frontend (SvelteKit)  →  Backend (Fastify)  →  PostgreSQL
   :5175                    :3020                 :5434
```

All services run in Docker containers via `docker compose` (project name: `petmed`). No external dependencies required.

## Features

### Administrator
- SPU/SKU product management with full category/tag/spec-attribute editing
- Publish/unpublish/archive lifecycle for both SPUs and individual SKUs
- Primary and detail images, spec attributes (strength, size, flavor)
- SKU inline editing (spec combination) and status transitions from product detail
- Supplier master data with MOQ and pack-size definitions
- Inventory tracking with visual thresholds (warning at 15, critical at 5)
- Excel import/export with row-level validation
- User management with RBAC and data-scope constraints
- System configuration, audit logs, integration token management

### Buyer
- Searchable catalog browsing
- Cart with live order estimates
- Automatic supplier splitting with deterministic pricing
- MOQ and pack-size enforcement
- Handling fee and local tax calculation
- Checkout with 2% drift re-confirmation
- Idempotent order submission

### Seat-Style Holds
- Row/slot allocation model for constrained inventory
- Bulk selection with adjacent-seat validation
- 10-minute holds with visible countdown
- Idempotent hold creation per client request key
- Auto-release on timeout via background scheduler
- Hold create/cancel/expiry/commit reconciles aggregate inventory counters (reserved_qty) so threshold badges stay accurate

### Dispatcher
- Task board with grab-order and assigned modes
- Task assignment is admin/supervisor only; dispatchers cannot assign tasks to others
- Dispatchers can accept and work on tasks assigned to them
- Recommended tasks ranked by time window, workload, and reputation
- Optimistic concurrency on task acceptance
- Worker metrics and reputation scoring

### Outcomes (Admin-scoped)
- Outcomes CRUD (studies, patents, awards, copyrights)
- Evidence file upload with checksum fingerprinting
- Project linking with contribution shares (must sum to 100%)
- Duplicate warnings on similar titles/certificate numbers

### Integration API
- Token auth with HMAC request signatures
- Rate limiting (60 req/min per token)
- Async ingestion pipeline with exponential backoff
- Dead-letter log after 5 failures

## Project Structure

```
repo/
├── README.md
├── docker-compose.yml
├── run_tests.sh
├── scripts/
│   ├── init-db.sql
│   └── seed-data.sql
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db/pool.js
│       ├── middleware/auth.js
│       ├── routes/
│       ├── services/
│       └── utils/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── svelte.config.js
│   └── src/
│       ├── routes/
│       ├── components/
│       ├── stores/
│       └── lib/
├── unit_tests/
└── API_tests/
```

## Running Tests

All tests run inside Docker or against Docker-hosted services. No local Node.js, Chrome, or PostgreSQL installation is required beyond Docker itself.

```bash
# Canonical test command (runs unit, frontend, and API tests):
./run_tests.sh
```

The test runner:
1. Runs backend unit tests inside the project
2. Runs frontend component tests via Vitest
3. Resets database state via `docker compose exec`
4. Runs API integration tests against the running backend

### E2E Tests (Playwright)

E2E tests use a separate Docker Compose stack with isolated ports. Playwright, the browser, and the test database all run via Docker.

```bash
# Start the E2E test environment
docker compose -f docker-compose.test.yml up -d

# Run E2E tests (Playwright manages backend + frontend dev servers)
docker compose -f docker-compose.test.yml exec app npx playwright test
```

> E2E test ports (3010/5174/5433) are isolated from the main stack (3020/5175/5434).

## Verification Flow

After `docker-compose up`, verify the system:

### UI Verification
1. Open http://localhost:5175
2. Login as `admin` / `password123`
3. Navigate Admin > Products to see seed SPUs
4. Navigate Admin > Inventory to see stock levels
5. Login as `buyer1` to test catalog and cart flows
6. Login as `dispatcher1` to view the task board

### API Verification
```bash
# Health check
curl http://localhost:3020/api/health

# Login and get session cookie
curl -c /tmp/petmed.cookie -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# Authenticated endpoint: list products
curl -b /tmp/petmed.cookie http://localhost:3020/api/spus?limit=3
```
8. Run `./run_tests.sh` to execute all tests

## Security

- Passwords: bcrypt with cost factor 12
- Sessions: server-side in PostgreSQL, 8-hour inactivity timeout
- Account lockout: 5 failed attempts in 15 minutes
- Certificate numbers: AES-256-GCM encrypted at rest
- Evidence files: stored outside web root, SHA-256 checksums
- RBAC with data-scope constraints enforced both in UI and API
- Integration API: HMAC signatures, rate limiting, token auth

### Security Notes

**Demo credentials are for development only.** The accounts listed in the
"Demo Accounts" table above (`admin/password123`, etc.) are seeded by
`scripts/seed-data.sql` and must **never** be used in a production
environment.

**docker-compose.yml secrets must be changed for production.** The following
environment variables in `docker-compose.yml` ship with weak/default values
that are only acceptable during local development:

| Variable | Default (dev) | Production requirement |
|---|---|---|
| `POSTGRES_PASSWORD` | `petmed_dev_password` | Strong, randomly generated password |
| `SESSION_SECRET` | `pm-s3ss10n-k3y-d3v-0nly-...` | Cryptographically random string (>=32 chars) |
| `ENCRYPTION_KEY` | `0123456789abcdef0123456789abcdef` | Random 32-hex-char AES-256 key |

In production (`NODE_ENV=production`), the backend **fails fast** on startup if
`SESSION_SECRET` is weak/short (<32 chars) or `ENCRYPTION_KEY` is missing. In
development mode (the default in `docker-compose.yml`), fallback dev values are
used for convenience.

#### Production Deployment Checklist

1. Generate strong, unique values for `POSTGRES_PASSWORD`, `SESSION_SECRET`,
   and `ENCRYPTION_KEY`.
2. Remove or disable the seed-data script (`seed-data.sql`) so demo accounts
   are not created.
3. Set `NODE_ENV=production` (the default in `docker-compose.yml` is `development`).
4. Place the application behind a TLS-terminating reverse proxy (e.g., nginx,
   Caddy, or a cloud load balancer).
5. Restrict the PostgreSQL port (`5434`) so it is not exposed to the public
   network -- only the backend container needs access.
6. Review and tighten CORS origins in the backend configuration.
7. Enable log aggregation and monitor the audit-log table for suspicious
   activity.
8. Rotate integration API tokens on a regular schedule.

## Offline-First Strategy

The backend is the system of record. The frontend stays usable during short LAN disruptions via:

- **Read cache**: Catalog, categories, tags, and reference data are cached in localStorage with a 5-minute TTL
- **Draft persistence**: In-progress cart contents and form drafts are saved to localStorage
- **Graceful fallback**: When the network is unavailable, cached data is served and an "Offline" indicator is shown
- **Mutation queue**: Catalog admin operations (product create/update, SKU create, supplier create/archive, pricing add/edit/deactivate, inventory create/update) are queued in localStorage when offline and automatically replayed when connectivity returns. A "pending sync" badge in the top bar shows how many mutations are waiting.
- **Recovery**: When connectivity returns, fresh data is fetched, caches are refreshed, and queued mutations are flushed to the backend.

Operations that require real-time backend confirmation are **not queued** for offline replay: checkout, hold commit, dispatch accept, and authentication. These will fail immediately if the network is unavailable.

## Background Jobs

| Job | Interval | Purpose |
|---|---|---|
| Hold cleanup | 60s | Release expired holds |
| Ingestion retry | 30s | Retry failed integration jobs |
| Worker metrics | 5min | Recompute reputation scores |
| Session cleanup | 15min | Remove expired sessions |
