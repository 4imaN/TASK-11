# PetMed Static Delivery Acceptance and Architecture Audit

## 1. Verdict
- Overall conclusion: `Partial Pass`

## 2. Scope and Static Verification Boundary
- Reviewed: repository structure, README/docs/config, Docker manifests, DB schema, Fastify entry points, middleware, routes, services, Svelte routes/components/stores, and static test files.
- Not reviewed: real runtime behavior, browser rendering, DB migration execution, scheduler timing, network behavior, upload/download I/O, Docker orchestration, or external-device integrations.
- Intentionally not executed: project startup, Docker, tests, Playwright, PostgreSQL, or any external service.
- Manual verification required for: actual runtime startup, browser rendering/responsiveness, file upload/download behavior, background job timing, real offline recovery behavior, and real concurrency under load.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal: offline-first internal suite for admin catalog/inventory/config, buyer procurement/cart/checkout, dispatcher fulfillment, constrained seat-style holds, and outcomes/evidence workflows with RBAC, scopes, PostgreSQL consistency, and local integration security.
- Main mapped implementation areas: Fastify app/bootstrap and scheduled jobs ([backend/src/index.js](backend/src/index.js):1-171), PostgreSQL schema ([scripts/init-db.sql](scripts/init-db.sql):11-518), auth/scope middleware ([backend/src/middleware/auth.js](backend/src/middleware/auth.js):12-163), business services for catalog/cart/holds/tasks/outcomes/integration/excel, and Svelte routes for admin/buyer/dispatcher flows.
- Static evidence shows a real full-stack codebase rather than a single demo file, but some prompt-critical workflows are only partially covered or have consistency gaps.

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 1.1 Documentation and static verifiability
- Conclusion: `Pass`
- Rationale: The repo includes startup, ports, accounts, test commands, architecture notes, API docs, env example, and schema/init scripts, which is enough for a human reviewer to follow the intended setup statically.
- Evidence: [README.md](README.md):5-15, [README.md](README.md):93-140, [README.md](README.md):175-252, [.env.example](.env.example):5-24, [docs/api-spec.md](docs/api-spec.md):1-360, [scripts/init-db.sql](scripts/init-db.sql):11-518
- Manual verification note: Runtime startup and docs accuracy against a live system were not executed.

#### 1.2 Material deviation from the Prompt
- Conclusion: `Partial Pass`
- Rationale: The implementation is centered on the prompt and covers the requested domains, but admin product management is only partially exposed in the UI and constrained-seat reservations are not reconciled with aggregate inventory counts.
- Evidence: [README.md](README.md):47-91, [frontend/src/routes/admin/products/+page.svelte](frontend/src/routes/admin/products/+page.svelte):95-176, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):125-280, [backend/src/services/holds.js](backend/src/services/holds.js):128-143, [backend/src/services/holds.js](backend/src/services/holds.js):226-315, [backend/src/services/inventory.js](backend/src/services/inventory.js):4-8

### 4.2 Delivery Completeness

#### 2.1 Core explicit requirement coverage
- Conclusion: `Partial Pass`
- Rationale: Most explicit backend requirements are implemented: auth/lockout/sessions, RBAC+scopes, catalog/SPU/SKU APIs, pricing and drift detection, holds, dispatch, outcomes, Excel import/export, and integration security. Main gaps are incomplete admin UI coverage for editing existing product metadata/SKU lifecycle and aggregate constrained-inventory consistency.
- Evidence: [backend/src/services/auth.js](backend/src/services/auth.js):7-117, [backend/src/services/catalog.js](backend/src/services/catalog.js):66-282, [backend/src/services/cart.js](backend/src/services/cart.js):176-365, [backend/src/services/holds.js](backend/src/services/holds.js):43-345, [backend/src/services/tasks.js](backend/src/services/tasks.js):189-406, [backend/src/services/outcomes.js](backend/src/services/outcomes.js):133-360, [backend/src/services/excel.js](backend/src/services/excel.js):70-452, [backend/src/services/integration.js](backend/src/services/integration.js):29-210, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):125-280

#### 2.2 0-to-1 deliverable vs partial/demo
- Conclusion: `Pass`
- Rationale: The repository has backend, frontend, schema, seed data, docs, and multiple test layers. It is not a snippet-only or mock-only submission.
- Evidence: [README.md](README.md):93-127, [backend/src/index.js](backend/src/index.js):1-171, [frontend/src/routes/+layout.svelte](frontend/src/routes/+layout.svelte):1-133, [scripts/init-db.sql](scripts/init-db.sql):11-518, [scripts/seed-data.sql](scripts/seed-data.sql):1-148

### 4.3 Engineering and Architecture Quality

#### 3.1 Engineering structure and decomposition
- Conclusion: `Pass`
- Rationale: The code is decomposed by domain into middleware/routes/services/utils plus separate frontend routes/components/stores. Core logic is not piled into one file.
- Evidence: [README.md](README.md):95-127, [backend/src/index.js](backend/src/index.js):1-171, [docs/design.md](docs/design.md):125-136

#### 3.2 Maintainability and extensibility
- Conclusion: `Partial Pass`
- Rationale: Service separation and SQL transaction use are good, but there are some inconsistent authorization patterns and the frontend leaves prompt-critical product management behaviors only partially editable.
- Evidence: [backend/src/middleware/auth.js](backend/src/middleware/auth.js):99-163, [backend/src/routes/inventory.js](backend/src/routes/inventory.js):18-49, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):31-35, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):125-185

### 4.4 Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API design
- Conclusion: `Partial Pass`
- Rationale: The code has centralized errors, validation schemas, audit logging, rate limiting, and transaction use. However, constrained-seat reservations do not reconcile with aggregate stock accounting, and some scope handling is inconsistent across mutation routes.
- Evidence: [backend/src/index.js](backend/src/index.js):39-71, [backend/src/utils/errors.js](backend/src/utils/errors.js):1-31, [backend/src/utils/audit.js](backend/src/utils/audit.js):3-35, [backend/src/services/holds.js](backend/src/services/holds.js):226-315, [backend/src/routes/inventory.js](backend/src/routes/inventory.js):18-49

#### 4.2 Real product/service vs example/demo
- Conclusion: `Partial Pass`
- Rationale: The implementation looks like a real internal app, but parts of the test corpus are specification-style examples instead of exercising production paths, which weakens proof for a few critical behaviors.
- Evidence: [unit_tests/holds.test.js](unit_tests/holds.test.js):3-5, [unit_tests/duplicate_warnings.test.js](unit_tests/duplicate_warnings.test.js):4-8, [backend/src/index.js](backend/src/index.js):1-171

### 4.5 Prompt Understanding and Requirement Fit

#### 5.1 Business goal, semantics, and constraints
- Conclusion: `Partial Pass`
- Rationale: The repo clearly understands the requested business domains and local-network architecture. Deviations are narrow but material: seat-style holds are not reflected in aggregate inventory counters, and admin product maintenance from the UI is weaker than the prompt implies.
- Evidence: [docs/design.md](docs/design.md):5-18, [docs/design.md](docs/design.md):127-135, [backend/src/services/holds.js](backend/src/services/holds.js):128-143, [backend/src/services/holds.js](backend/src/services/holds.js):226-315, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):125-280

### 4.6 Aesthetics

#### 6.1 Frontend visual and interaction quality
- Conclusion: `Partial Pass`
- Rationale: The static Svelte code shows distinct functional areas, badges, tables, offline banner, hold countdown, and dispatcher task states. Actual rendering quality and responsiveness still require manual verification.
- Evidence: [frontend/src/routes/+layout.svelte](frontend/src/routes/+layout.svelte):44-132, [frontend/src/routes/admin/products/+page.svelte](frontend/src/routes/admin/products/+page.svelte):88-245, [frontend/src/routes/buyer/cart/+page.svelte](frontend/src/routes/buyer/cart/+page.svelte):69-165, [frontend/src/routes/dispatcher/+page.svelte](frontend/src/routes/dispatcher/+page.svelte):72-146, [frontend/src/app.css](frontend/src/app.css):1-260
- Manual verification note: Browser rendering and mobile layout were not executed.

## 5. Issues / Suggestions (Severity-Rated)

### High

#### 1. Constrained-seat reservations are not reconciled with aggregate inventory counters
- Severity: `High`
- Title: Aggregate inventory and seat-state can diverge
- Conclusion: `Fail`
- Evidence: [backend/src/services/inventory.js](backend/src/services/inventory.js):4-8, [scripts/init-db.sql](scripts/init-db.sql):201-212, [backend/src/services/holds.js](backend/src/services/holds.js):128-143, [backend/src/services/holds.js](backend/src/services/holds.js):226-315, [backend/src/services/holds.js](backend/src/services/holds.js):318-345
- Impact: Seat holds/commits change `constrained_slots.status` only, while threshold badges and other stock calculations use `inventory.available_qty - reserved_qty`. The system can therefore show stale stock health and aggregate availability after seat reservations/commits.
- Minimum actionable fix: Update `inventory.reserved_qty` or `available_qty` consistently during hold create/cancel/commit/release, or derive aggregate stock for constrained inventory from slot state in one place only.

#### 2. Admin UI only partially supports ongoing SPU/SKU management
- Severity: `High`
- Title: Existing product maintenance is incomplete in the web UI
- Conclusion: `Partial Fail`
- Evidence: [README.md](README.md):47-55, [frontend/src/routes/admin/products/+page.svelte](frontend/src/routes/admin/products/+page.svelte):95-176, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):31-35, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):125-185, [frontend/src/routes/admin/products/[id]/+page.svelte](frontend/src/routes/admin/products/[id]/+page.svelte):237-279
- Impact: Admins can create SPUs with tags/specs/images and create new SKUs, but the existing-product screen does not expose editing for tags, spec attributes, category selection, SKU status changes, or SKU edits, which weakens the prompt’s “manage pet pharmaceuticals and supplies with SPU/SKU workflows” requirement for day-2 operations.
- Minimum actionable fix: Extend the product detail screen to edit tags, category, spec attributes, SKU status, and SKU metadata using the existing backend endpoints.

### Medium

#### 3. Inventory mutation scope handling is inconsistent with store-based scope semantics
- Severity: `Medium`
- Title: Store-scoped authorization is not honored consistently on inventory writes
- Conclusion: `Partial Fail`
- Evidence: [backend/src/routes/inventory.js](backend/src/routes/inventory.js):18-19, [backend/src/routes/inventory.js](backend/src/routes/inventory.js):42-48, [backend/src/middleware/auth.js](backend/src/middleware/auth.js):140-163
- Impact: Read paths resolve store scope to warehouses, but inventory create/update paths use direct warehouse scope checks only. A store-scoped inventory manager would be denied on writes even when the warehouse is valid through store-to-warehouse mapping.
- Minimum actionable fix: Replace direct warehouse-only checks in inventory mutation routes with `resolveWarehouseScope()`-based enforcement, matching the rest of the codebase.

#### 4. Dispatcher task board exposes a guaranteed-forbidden action
- Severity: `Medium`
- Title: Dispatcher UI calls admin-only assignment endpoint
- Conclusion: `Fail`
- Evidence: [README.md](README.md):73-79, [backend/src/routes/tasks.js](backend/src/routes/tasks.js):65-83, [frontend/src/routes/dispatcher/+page.svelte](frontend/src/routes/dispatcher/+page.svelte):126-129
- Impact: Dispatchers are shown an “Assign to Me” button that posts to `/api/tasks/:id/assign`, but that route is admin-only. This creates a broken UX path in the core grab-order workflow.
- Minimum actionable fix: Remove the button for dispatchers or change it to use `/api/tasks/:id/accept` for grab-order behavior.

#### 5. Static test coverage misses several high-risk authorization and consistency cases
- Severity: `Medium`
- Title: Tests are present but leave severe defects able to slip through
- Conclusion: `Partial Fail`
- Evidence: [unit_tests/holds.test.js](unit_tests/holds.test.js):3-5, [unit_tests/duplicate_warnings.test.js](unit_tests/duplicate_warnings.test.js):4-8, [API_tests/auth.test.js](API_tests/auth.test.js):41-89, [API_tests/holds.test.js](API_tests/holds.test.js):107-115, [API_tests/outcomes.test.js](API_tests/outcomes.test.js):64-77, [docs/design.md](docs/design.md):163-172
- Impact: Some tests validate specifications or local helper copies rather than production code, and key areas remain untested: 8-hour inactivity expiry, negative store/warehouse scope denials, evidence integrity/download flows, audit-log masking, and the inventory/seat consistency gap.
- Minimum actionable fix: Add production-path API tests for scope-denied warehouse/store access, session inactivity expiry, evidence upload/download/tamper handling, audit masking, and constrained-seat inventory reconciliation; replace spec-only unit tests with tests against production functions where possible.

### Low

#### 6. Dormant offline mutation queue conflicts with the documented confirmation policy
- Severity: `Low`
- Title: Unused offline write queue weakens the documented contract
- Conclusion: `Suspected Risk`
- Evidence: [README.md](README.md):236-243, [frontend/src/lib/offlineApi.js](frontend/src/lib/offlineApi.js):30-42, [frontend/src/lib/mutationQueue.js](frontend/src/lib/mutationQueue.js):30-66
- Impact: The current screens do not call this helper, but the generic helper can queue state-changing mutations locally and replay them later, which conflicts with the documented rule that checkout/holds/dispatch/evidence changes require backend confirmation.
- Minimum actionable fix: Remove the helper, restrict it to draft-only operations, or explicitly gate it away from transactional mutations.

## 6. Security Review Summary

- Authentication entry points: `Pass`
  - Login, logout, session hashing, inactivity timeout, and lockout are implemented in code, not only in docs.
  - Evidence: [backend/src/routes/auth.js](backend/src/routes/auth.js):5-44, [backend/src/services/auth.js](backend/src/services/auth.js):7-117, [backend/src/middleware/auth.js](backend/src/middleware/auth.js):12-74

- Route-level authorization: `Partial Pass`
  - Most routes use `authenticate` plus explicit permission guards. Weaknesses are around consistency, not total absence.
  - Evidence: [backend/src/routes/catalog.js](backend/src/routes/catalog.js):5-214, [backend/src/routes/tasks.js](backend/src/routes/tasks.js):5-126, [backend/src/routes/outcomes.js](backend/src/routes/outcomes.js):22-217

- Object-level authorization: `Partial Pass`
  - Cart and hold ownership checks exist, task-status changes restrict to assignee/admin, and outcomes enforce department scope. Inventory write scope handling is inconsistent, and negative cross-scope cases are not well tested.
  - Evidence: [backend/src/services/cart.js](backend/src/services/cart.js):12-28, [backend/src/services/holds.js](backend/src/services/holds.js):146-195, [backend/src/routes/tasks.js](backend/src/routes/tasks.js):103-117, [backend/src/routes/outcomes.js](backend/src/routes/outcomes.js):11-20

- Function-level authorization: `Partial Pass`
  - The services rely mostly on route enforcement and request-derived IDs. This is acceptable in many cases but means service-level misuse would be harder to contain if routes change.
  - Evidence: [backend/src/routes/cart.js](backend/src/routes/cart.js):74-98, [backend/src/services/cart.js](backend/src/services/cart.js):191-365, [backend/src/routes/integration.js](backend/src/routes/integration.js):39-77

- Tenant / user data isolation: `Partial Pass`
  - User ownership and scope filters are present for carts, holds, warehouses, departments, and outcomes. Coverage for store/warehouse denial cases is incomplete and inventory writes do not consistently honor resolved store scope.
  - Evidence: [backend/src/middleware/auth.js](backend/src/middleware/auth.js):99-163, [backend/src/routes/config.js](backend/src/routes/config.js):59-90, [backend/src/routes/holds.js](backend/src/routes/holds.js):14-25, [backend/src/routes/inventory.js](backend/src/routes/inventory.js):42-48

- Admin / internal / debug protection: `Pass`
  - Admin/config/audit/integration token management and task assignment endpoints are protected; no unguarded debug endpoints were found in the reviewed scope.
  - Evidence: [backend/src/routes/config.js](backend/src/routes/config.js):5-57, [backend/src/routes/integration.js](backend/src/routes/integration.js):39-77, [backend/src/routes/tasks.js](backend/src/routes/tasks.js):65-83

## 7. Tests and Logging Review

- Unit tests: `Partial Pass`
  - Unit tests exist for pricing, adjacency, threshold logic, task scoring, crypto, and contribution validation.
  - Some are specification-style or use local copies instead of the production function path.
  - Evidence: [unit_tests/pricing.test.js](unit_tests/pricing.test.js):1-120, [unit_tests/adjacency.test.js](unit_tests/adjacency.test.js):1-74, [unit_tests/holds.test.js](unit_tests/holds.test.js):3-5, [unit_tests/duplicate_warnings.test.js](unit_tests/duplicate_warnings.test.js):4-8

- API / integration tests: `Partial Pass`
  - API tests cover auth, cart/checkout drift, holds, tasks, outcomes, and integration token/signature/rate-limit flows, but not several key negative authorization and consistency paths.
  - Evidence: [API_tests/auth.test.js](API_tests/auth.test.js):20-89, [API_tests/cart_checkout.test.js](API_tests/cart_checkout.test.js):9-142, [API_tests/holds.test.js](API_tests/holds.test.js):22-115, [API_tests/tasks.test.js](API_tests/tasks.test.js):19-80, [API_tests/integration.test.js](API_tests/integration.test.js):27-172

- Logging categories / observability: `Pass`
  - Structured category-based logger and DB-backed audit logs exist.
  - Evidence: [backend/src/utils/logger.js](backend/src/utils/logger.js):1-27, [backend/src/utils/audit.js](backend/src/utils/audit.js):3-35, [backend/src/index.js](backend/src/index.js):101-138

- Sensitive-data leakage risk in logs / responses: `Partial Pass`
  - Audit details are masked for passwords, tokens, secrets, certificate numbers, and storage paths. Outcomes mask certificate numbers in responses. Static review did not find obvious plaintext secret logging, but runtime logging behavior was not executed.
  - Evidence: [backend/src/utils/audit.js](backend/src/utils/audit.js):12-35, [backend/src/services/outcomes.js](backend/src/services/outcomes.js):113-130, [backend/src/services/integration.js](backend/src/services/integration.js):107-130

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist under `unit_tests/` and are matched by Jest from repo root.
  - Evidence: [backend/jest.config.js](backend/jest.config.js):1-6
- API/integration tests exist under `API_tests/`.
  - Evidence: [backend/jest.config.js](backend/jest.config.js):1-6
- Frontend component tests exist under `frontend/src/tests/` and use Vitest + jsdom.
  - Evidence: [frontend/vitest.config.js](frontend/vitest.config.js):1-10
- E2E tests exist under `e2e_tests/` and Playwright is configured, but they require starting services/DB and were not executed.
  - Evidence: [playwright.config.js](playwright.config.js):3-45, [README.md](README.md):142-169
- Documentation provides test commands.
  - Evidence: [README.md](README.md):129-169, [run_tests.sh](run_tests.sh):17-55

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Authentication success/failure/lockout | [API_tests/auth.test.js](API_tests/auth.test.js):20-49 | Login success, 401 invalid user/password, 423 lockout | basically covered | 8-hour inactivity timeout is not covered | Add session inactivity-expiry API test with manipulated `last_activity_at` |
| Admin/RBAC endpoint protection | [API_tests/auth.test.js](API_tests/auth.test.js):74-89, [API_tests/security.test.js](API_tests/security.test.js):111-128 | Buyer/dispatcher denied on roles/config/audit/catalog/outcomes | basically covered | Object-level and scope-negative cases are still thin | Add warehouse/store/department negative scope tests |
| MOQ/pack-size, estimate, checkout, drift | [API_tests/cart_checkout.test.js](API_tests/cart_checkout.test.js):9-142, [unit_tests/pricing.test.js](unit_tests/pricing.test.js):22-120 | Invalid pack size rejected, estimate generated, duplicate idempotency rejected, drift confirmation flow | sufficient | No direct test for inventory shortfall rollback after partial reservation attempt | Add transactional rollback test for insufficient inventory during checkout |
| Seat adjacency and hold idempotency | [unit_tests/adjacency.test.js](unit_tests/adjacency.test.js):12-74, [API_tests/holds.test.js](API_tests/holds.test.js):29-105 | Gap-rule validation, idempotent hold key, conflict on held slots, cancel release | basically covered | Aggregate inventory reconciliation is untested and currently defective | Add API test asserting seat hold/commit changes inventory counters or equivalent aggregate |
| Dispatcher optimistic concurrency | [API_tests/tasks.test.js](API_tests/tasks.test.js):46-72 | Accept success or 409 on version mismatch | basically covered | UI-level forbidden assign action is not caught | Add frontend/API test that dispatcher task board does not call admin-only assign endpoint |
| Outcomes shares and duplicate warnings | [API_tests/outcomes.test.js](API_tests/outcomes.test.js):12-77, [unit_tests/contributions.test.js](unit_tests/contributions.test.js):4-64 | 100% share enforcement, duplicate warnings returned, buyer denied | basically covered | Duplicate-warning unit test partially uses a local helper copy | Add tests against production `checkDuplicateWarnings` with controlled encrypted fixtures |
| Integration HMAC, rate limit, dead-letter | [API_tests/integration.test.js](API_tests/integration.test.js):40-172, [API_tests/security.test.js](API_tests/security.test.js):54-80 | Valid signature accepted, invalid rejected, 429 after threshold, dead-letter sanitized | sufficient | No direct static proof of payload schema validation and safe retry rollback | Add tests for malformed payload shapes and repeated retry state transitions |
| Sensitive logging / audit masking | No direct automated test found | Audit masking exists in production code only | missing | Severe logging regressions could pass current tests | Add unit/API tests asserting audit log payload masks secrets and certificate numbers |

### 8.3 Security Coverage Audit
- Authentication: `Basically covered`
  - Covered by login/401/lockout/logout tests.
  - Major remaining gap: inactivity timeout.
- Route authorization: `Basically covered`
  - Covered for several admin/buyer/dispatcher/reviewer endpoint combinations.
  - Remaining gap: no broad negative matrix for each privileged route family.
- Object-level authorization: `Insufficient`
  - Hold ownership and outcomes access have only light negative coverage.
  - Cross-store/warehouse object denial cases are largely absent.
- Tenant / data isolation: `Insufficient`
  - Scope-aware code exists, but tests do not meaningfully probe store-to-warehouse denial paths or inventory write scope rules.
- Admin / internal protection: `Basically covered`
  - Config/audit/users/task assignment/integration token endpoints have direct deny tests.

### 8.4 Final Coverage Judgment
- Final Coverage Judgment: `Partial Pass`
- Major risks covered: auth basics, RBAC basics, checkout drift/idempotency, hold conflict/idempotency, task accept concurrency, outcomes share validation, and integration HMAC/rate limiting.
- Major uncovered risks: inactivity timeout, detailed scope isolation denials, audit masking, evidence integrity flows, and constrained-seat inventory reconciliation. Because of those gaps, tests could still pass while severe authorization or consistency defects remain.

## 9. Final Notes
- The repository is materially aligned with the prompt and is statically reviewable as a real full-stack submission.
- The strongest defects are consistency and completeness issues, not a total absence of architecture.
- No runtime success claims are made here; all conclusions above are based on static evidence only.
