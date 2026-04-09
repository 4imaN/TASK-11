# PetMed Operations & Procurement Suite

A local-network/offline-first web application for managing pet pharmaceutical catalogs, internal procurement ordering, seat-style inventory locking, warehouse fulfillment dispatch, and outcomes/evidence management.

## Quick Start

```bash
docker compose up --build
```

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

```bash
# Unit tests only (no backend required)
cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --config jest.config.js --testPathPattern='unit_tests' --forceExit

# API tests require:
# - Docker Compose services running (`docker compose up -d`)
# - The test runner resets database state before API tests
cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --config jest.config.js --testPathPattern='API_tests' --forceExit

# Both (using the entrypoint script)
./run_tests.sh
```

### E2E Tests (Playwright)

Configuration lives in `playwright.config.js` at the repo root. Key settings:

| Setting | Value |
|---|---|
| Test directory | `./e2e_tests` |
| Frontend URL | `http://localhost:5174` (Playwright-managed dev server) |
| Backend URL / port | `http://localhost:3010` (Playwright-managed) |
| Test DB port | `5433` (via `docker-compose.test.yml`) |
| Browser | Local Chrome (`channel: 'chrome'`) |

E2E tests require:
- A local **Chrome** installation (Playwright uses it via the `chrome` channel)
- A running **PostgreSQL** instance seeded with test data (start one with `docker compose -f docker-compose.test.yml up -d`)

Playwright will automatically start the backend (port 3010) and frontend (port 5174) dev servers as configured in `playwright.config.js`. You do **not** need to start them manually.

```bash
# 1. Start the test database (port 5433)
docker compose -f docker-compose.test.yml up -d

# 2. Run Playwright E2E tests (backend + frontend started automatically)
npx playwright test

# To see the HTML report after a run:
npx playwright show-report
```

> **Note:** The E2E test ports (3010 / 5174 / 5433) are intentionally different
> from the main docker-compose ports (3020 / 5175 / 5434) so both environments
> can run simultaneously.

## Verification Flow

1. Run `docker compose up --build`
2. Open http://localhost:5175
3. Login as `admin` / `password123`
4. Navigate Admin > Products to see seed SPUs
5. Navigate Admin > Inventory to see stock levels with threshold indicators
6. Login as `buyer1` to test catalog and cart flows
7. Login as `dispatcher1` to view the task board
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
