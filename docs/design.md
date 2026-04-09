# PetMed Operations & Procurement Suite — Design Document

## 1. System Overview

The PetMed Operations & Procurement Suite is a local-network/offline-first web application for managing pet pharmaceutical catalogs, internal procurement ordering, seat-style inventory locking, warehouse fulfillment dispatch, and outcomes/evidence management.

### Architecture

```
┌──────────────┐     HTTP/REST      ┌──────────────┐     SQL      ┌──────────────┐
│   Svelte UI  │ ◄──────────────► │  Fastify API │ ◄──────────► │  PostgreSQL  │
│  (port 5175) │                    │  (port 3020) │              │  (port 5434) │
└──────────────┘                    └──────────────┘              └──────────────┘
                                         │
                                    ┌────┴────┐
                                    │  Jobs   │
                                    │Scheduler│
                                    └─────────┘
```

All services run in Docker containers orchestrated via `docker-compose.yml`.

## 2. Domain Model

### Core Entities

#### Authentication & Authorization
- **User**: id, username, password_hash, display_name, email, status, failed_login_count, locked_until, created_at, updated_at
- **Role**: id, name, description, permissions (JSONB)
- **UserRole**: user_id, role_id
- **UserScope**: user_id, scope_type (warehouse|department|store), scope_id
- **Session**: id, user_id, token, expires_at, last_activity_at, ip_address, created_at

#### Catalog
- **Category**: id, name, slug, parent_id, sort_order, status
- **Tag**: id, name, slug
- **SPU** (Standard Product Unit): id, name, description, category_id, primary_image_url, status (draft|published|unpublished|archived), created_at, updated_at
- **SPUTag**: spu_id, tag_id
- **SPUImage**: id, spu_id, image_url, sort_order, is_primary
- **SpecAttribute**: id, spu_id, name (strength|size|flavor|etc), values (JSONB)
- **SKU**: id, spu_id, sku_code, spec_combination (JSONB), status, created_at, updated_at

#### Supplier & Pricing
- **Supplier**: id, name, contact_info, status (active|archived), created_at
- **SKUSupplier**: id, sku_id, supplier_id, unit_price, moq, pack_size, is_preferred, is_active, lead_time_days, is_taxable

#### Inventory
- **Inventory**: id, sku_id, warehouse_id, lot_number, available_qty, reserved_qty, threshold_warning (default 15), threshold_critical (default 5), updated_at
- **Warehouse**: id, name, code, address, status

#### Cart & Orders
- **Cart**: id, buyer_user_id, store_id, status (active|checked_out|abandoned), created_at, updated_at
- **CartItem**: id, cart_id, sku_id, supplier_id (nullable for auto), quantity, unit_price_snapshot, created_at
- **OrderEstimate**: id, cart_id, estimate_snapshot (JSONB), total, handling_fee, tax, created_at
- **Order**: id, cart_id, buyer_user_id, store_id, idempotency_key (unique), order_fingerprint, status, total, handling_fee, tax, confirmed_drift, created_at
- **OrderLine**: id, order_id, sku_id, supplier_id, quantity, unit_price, line_total, split_group

#### Constrained Inventory (Seat-Style)
- **ConstrainedSlot**: id, inventory_id, row_code, position_index, status (available|held|reserved|unavailable)
- **Hold**: id, client_request_key (unique), user_id, status (active|released|committed|expired), expires_at, created_at
- **HoldSlot**: hold_id, slot_id

#### Dispatch & Tasks
- **Task**: id, order_id, order_line_ids (JSONB), warehouse_id, assigned_user_id, status (open|assigned|accepted|in_progress|completed|failed|cancelled), priority, due_window_start, due_window_end, version (for optimistic concurrency), created_at, updated_at
- **TaskHistory**: id, task_id, user_id, action, timestamp
- **WorkerMetric**: user_id, completed_count, failed_count, avg_completion_time, reputation_score, active_task_count, last_computed_at

#### Outcomes & Evidence
- **Outcome**: id, type (study|patent|award|copyright), title, certificate_number_encrypted, description, status (draft|submitted|published), created_by, created_at, updated_at
- **OutcomeProject**: id, outcome_id, project_id, contribution_share
- **Project**: id, name, description, department_id, status, created_at
- **Evidence**: id, outcome_id, file_name, storage_path_encrypted, file_size, mime_type, checksum_sha256, uploaded_by, created_at

#### Integration
- **IntegrationToken**: id, name, token_hash, secret_key, rate_limit (default 60/min), status, created_at
- **IngestionJob**: id, token_id, payload, status (pending|processing|completed|failed|dead_letter), attempts, last_error, next_retry_at, created_at, updated_at
- **AuditLog**: id, user_id, action, entity_type, entity_id, details (JSONB), ip_address, created_at

#### Configuration
- **SystemConfig**: id, key, value (JSONB), description, updated_at
  - Keys: handling_fee_rules, tax_rules, hold_duration_minutes, etc.

## 3. Security Boundaries

### Authentication
- Passwords: bcrypt with cost factor 12
- Lockout: 5 failed attempts in rolling 15-minute window
- Sessions: server-side in PostgreSQL, 8-hour inactivity timeout
- Session tokens: cryptographically random, stored hashed

### Authorization Layers
1. **Route-level**: Fastify preHandler checks authentication
2. **Role-level**: Middleware checks role permissions
3. **Scope-level**: Service layer filters data by user scopes
4. **Frontend**: Menu/button rendering based on permissions (defense in depth, not sole enforcement)

### Data Protection
- Password hashes: bcrypt (never reversible)
- Certificate numbers: AES-256-GCM encryption at rest
- Evidence file paths: AES-256-GCM encryption at rest
- UI masking: certificate numbers show last 4 chars only
- Audit log masking: sensitive fields replaced with masked values
- File checksums: SHA-256 stored in DB for tamper detection

## 4. Concurrency Controls

| Scenario | Mechanism |
|---|---|
| Hold creation | Row-level lock + idempotency key + aggregate reserved_qty sync |
| Hold cancel/expiry | Slot release + aggregate reserved_qty decrement |
| Checkout | Transaction with price/inventory recheck |
| Task acceptance | Optimistic concurrency via version column |
| Duplicate orders | Unique constraint on idempotency_key |
| Hold expiry | Scheduled job every 60 seconds |
| Rate limiting | Fixed-window counter per integration token |

## 5. Background Jobs

| Job | Frequency | Description |
|---|---|---|
| Hold cleanup | Every 60s | Release expired holds, update slot status |
| Integration retry | Every 30s | Retry failed ingestion jobs with exponential backoff |
| Worker metrics | Every 5min | Recompute reputation/workload scores |
| Session cleanup | Every 15min | Remove expired sessions |

## 6. Module Decomposition

1. **Auth Module**: Login, session management, lockout, RBAC, scope enforcement
2. **Catalog Module**: SPU/SKU CRUD, categories, tags, images, spec attributes, publish/unpublish
3. **Supplier Module**: Supplier management, SKU-supplier pricing, MOQ, pack sizes
4. **Inventory Module**: Stock tracking, threshold computation, warehouse management
5. **Cart/Order Module**: Cart management, estimate pipeline, checkout with drift detection
6. **Constrained Hold Module**: Slot management, hold lifecycle, adjacency validation
7. **Dispatch Module**: Task board, grab/assign modes, recommendation engine, optimistic acceptance
8. **Outcomes Module**: Outcome CRUD, evidence files, project linking, contribution shares, duplicate warnings
9. **Integration Module**: Token management, signature verification, rate limiting, ingestion pipeline, dead-letter
10. **Audit Module**: Event logging, masking, encryption utilities

## 7. Pricing Pipeline (Deterministic)

```
1. Validate qty >= MOQ and qty % pack_size == 0
2. Compute line_subtotal = qty * unit_price (per SKU-supplier)
3. Group lines by supplier (auto-split or buyer override)
4. Compute handling_fee per supplier split (from config)
5. Compute taxable_base = sum of taxable lines per split
6. Apply tax_rate to taxable_base
7. Final = sum(line_subtotals) + handling_fees + taxes
```

## 8. Test Plan

### Unit Tests
- Pricing calculator (MOQ, pack-size, tax, handling fee)
- Adjacency gap validator
- Hold lifecycle (create, expire, commit, release)
- Constrained inventory reconciliation (hold→aggregate counter sync, threshold accuracy)
- Session inactivity timeout logic
- Audit log masking (password, token, secret_key, certificate_number, storage_path)
- Evidence integrity / tamper detection (checksum verification)
- Task recommendation scorer
- Contribution share validator
- Duplicate warning normalizer
- Signature verification
- Rate limiter
- Encryption/masking utilities

### API Tests
- Auth flows (login, lockout, session timeout)
- RBAC enforcement
- Product CRUD and publish lifecycle
- Excel import validation
- Cart/estimate/checkout with drift
- Hold creation/conflict/expiry
- Task accept with optimistic concurrency
- Outcomes with duplicate warnings and share validation
- Integration auth, rate limiting, retry, dead-letter

## 9. Docker Architecture

```yaml
services:
  db:       PostgreSQL 16 with init scripts
  backend:  Node.js 20 + Fastify
  frontend: Node.js 20 + Svelte (dev server or built)
```

All data persists in named Docker volumes. No external dependencies required.
