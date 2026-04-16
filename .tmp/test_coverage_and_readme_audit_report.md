# Test Coverage Audit

## Scope Note
- This report replaces a stale prior report that referenced a different codebase.
- Static inspection only. No tests, scripts, containers, or servers were run.

## Project Type Detection
- Declared project type: `fullstack`
- Evidence: `README.md:3`

## Backend Endpoint Inventory
- `auth.js`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/users`
  - `POST /api/users`
  - `PUT /api/users/:id`
  - `GET /api/roles`
- `cart.js`
  - `GET /api/cart`
  - `POST /api/cart/items`
  - `PUT /api/cart/items/:id`
  - `DELETE /api/cart/items/:id`
  - `POST /api/cart/estimate`
  - `POST /api/cart/checkout`
- `catalog.js`
  - `GET /api/categories`
  - `POST /api/categories`
  - `PUT /api/categories/:id`
  - `GET /api/tags`
  - `POST /api/tags`
  - `GET /api/spus`
  - `GET /api/spus/:id`
  - `POST /api/spus`
  - `PUT /api/spus/:id`
  - `PATCH /api/spus/:id/status`
  - `GET /api/spus/:spuId/skus`
  - `POST /api/spus/:spuId/skus`
  - `PUT /api/skus/:id`
  - `PATCH /api/skus/:id/status`
- `config.js`
  - `GET /api/config`
  - `PUT /api/config/:key`
  - `GET /api/audit-logs`
  - `GET /api/stores`
  - `GET /api/departments`
- `excel.js`
  - `GET /api/import/templates/:type`
  - `POST /api/import/:type`
  - `POST /api/import/:type/commit`
  - `GET /api/export/:type`
- `holds.js`
  - `GET /api/constrained-slots`
  - `POST /api/holds`
  - `GET /api/holds/:id`
  - `DELETE /api/holds/:id`
  - `POST /api/holds/:id/checkout`
- `integration.js`
  - `POST /api/integration/ingest`
  - `GET /api/integration/tokens`
  - `POST /api/integration/tokens`
  - `GET /api/integration/dead-letter`
  - `POST /api/integration/dead-letter/:id/retry`
- `inventory.js`
  - `GET /api/inventory`
  - `POST /api/inventory`
  - `PUT /api/inventory/:id`
  - `GET /api/warehouses`
  - `POST /api/warehouses`
- `outcomes.js`
  - `GET /api/outcomes`
  - `GET /api/outcomes/:id`
  - `POST /api/outcomes`
  - `PUT /api/outcomes/:id`
  - `PATCH /api/outcomes/:id/status`
  - `POST /api/outcomes/:id/evidence`
  - `GET /api/evidence/:id/download`
  - `GET /api/projects`
  - `POST /api/projects`
- `supplier.js`
  - `GET /api/suppliers`
  - `POST /api/suppliers`
  - `PUT /api/suppliers/:id`
  - `PATCH /api/suppliers/:id/status`
  - `GET /api/suppliers/:id/skus`
  - `GET /api/skus/:skuId/suppliers`
  - `POST /api/skus/:skuId/suppliers`
  - `PUT /api/sku-suppliers/:id`
  - `DELETE /api/sku-suppliers/:id`
- `tasks.js`
  - `GET /api/tasks`
  - `GET /api/tasks/recommendations`
  - `GET /api/tasks/:id`
  - `POST /api/tasks/:id/accept`
  - `POST /api/tasks/:id/assign`
  - `PATCH /api/tasks/:id/status`
  - `GET /api/worker-metrics`
- `index.js`
  - `GET /api/health`

Total declared endpoints: **77**

## API Test Mapping Table
| Endpoint group | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| Auth endpoints | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/security.test.js` | `API_tests/auth.test.js:20-86` |
| Cart and checkout endpoints | yes | true no-mock HTTP | `API_tests/cart_checkout.test.js`, `API_tests/endpoint_coverage.test.js` | `API_tests/cart_checkout.test.js:9-209`, `API_tests/endpoint_coverage.test.js:253-263` |
| Catalog endpoints | yes | true no-mock HTTP | `API_tests/catalog.test.js`, `API_tests/endpoint_coverage.test.js` | `API_tests/catalog.test.js:9-217`, `API_tests/endpoint_coverage.test.js:266-292` |
| Config and lookup endpoints | yes | true no-mock HTTP | `API_tests/auth.test.js`, `API_tests/security.test.js`, `API_tests/endpoint_coverage.test.js` | `API_tests/endpoint_coverage.test.js:145-169`, `API_tests/security.test.js:8-47` |
| Excel import/export endpoints | yes | true no-mock HTTP | `API_tests/endpoint_coverage.test.js`, `API_tests/admin_api.test.js` | `API_tests/endpoint_coverage.test.js:22-54`, `API_tests/admin_api.test.js:116-147` |
| Hold endpoints | yes | true no-mock HTTP | `API_tests/holds.test.js`, `API_tests/acceptance.test.js` | `API_tests/holds.test.js:31-239`, `API_tests/acceptance.test.js:159-191` |
| Integration endpoints | yes | true no-mock HTTP | `API_tests/integration.test.js`, `API_tests/endpoint_coverage.test.js` | `API_tests/integration.test.js:27-156`, `API_tests/endpoint_coverage.test.js:243-248` |
| Inventory endpoints | yes | true no-mock HTTP | `API_tests/cart_checkout.test.js`, `API_tests/admin_api.test.js`, `API_tests/endpoint_coverage.test.js` | `API_tests/admin_api.test.js:94-114`, `API_tests/endpoint_coverage.test.js:151-175` |
| Outcomes, evidence, projects | yes | true no-mock HTTP | `API_tests/outcomes.test.js`, `API_tests/security.test.js`, `API_tests/endpoint_coverage.test.js`, `API_tests/admin_api.test.js` | `API_tests/outcomes.test.js:12-67`, `API_tests/endpoint_coverage.test.js:178-233` |
| Supplier and SKU-supplier endpoints | yes | true no-mock HTTP | `API_tests/admin_api.test.js`, `API_tests/endpoint_coverage.test.js`, `API_tests/cart_checkout.test.js` | `API_tests/admin_api.test.js:10-66,214-234`, `API_tests/endpoint_coverage.test.js:66-127` |
| Task endpoints and worker metrics | yes | true no-mock HTTP | `API_tests/tasks.test.js`, `API_tests/security.test.js`, `API_tests/admin_api.test.js`, `API_tests/endpoint_coverage.test.js`, `API_tests/acceptance.test.js` | `API_tests/tasks.test.js:18-127`, `API_tests/endpoint_coverage.test.js:295-311`, `API_tests/acceptance.test.js:22-157` |
| Health endpoint | yes | true no-mock HTTP | `API_tests/security.test.js`, `e2e_tests/06-cross-role.spec.js` | `API_tests/security.test.js:53-58`, `e2e_tests/06-cross-role.spec.js:50-55` |

## API Test Classification
### 1. True No-Mock HTTP
- `API_tests/*.test.js` use real HTTP requests against exact route paths.
- Evidence: `API_tests/helpers.js` bootstraps request execution through the running app surface; individual suites call exact paths such as `API_tests/endpoint_coverage.test.js:22-311` and `API_tests/cart_checkout.test.js:9-209`.

### 2. HTTP With Mocking
- None found in the API endpoint suites reviewed.

### 3. Non-HTTP
- Backend production-function unit tests: `unit_tests/*.test.js`
- Frontend component/store/dependency tests: `frontend/src/tests/*.test.js`
- Rendered browser E2E flows: `e2e_tests/*.spec.js`

## Mock Detection
- Frontend dependency mocking exists in test support, not in backend API coverage.
- Evidence:
  - `frontend/src/tests/pages.test.js:8-9` mocks browser globals
  - `frontend/src/tests/auth.test.js` and some unit suites use test doubles around isolated functions and stores
- Static conclusion: backend API coverage is not downgraded by these frontend/unit mocks because the HTTP endpoint suites themselves still hit the real route handlers.

## Coverage Summary
- Total endpoints: **77**
- Endpoints with HTTP tests: **77**
- Endpoints with true no-mock HTTP tests: **77**
- HTTP coverage: **100%**
- True API coverage: **100%**

## Unit Test Summary
### Backend Unit Tests
- Present
- Evidence: `unit_tests/*.test.js`
- Production imports confirmed across the unit suite, including:
  - `unit_tests/evidence_integrity.test.js`
  - `unit_tests/audit_masking.test.js`
  - `unit_tests/constrained_inventory.test.js`
  - `unit_tests/offline_mutation_policy.test.js`
- Covered areas:
  - services
  - auth/session logic
  - audit masking
  - inventory/hold calculations
  - offline mutation policy
- Important backend modules not directly isolated in unit tests:
  - route-level orchestration in `backend/src/routes/*.js` is mostly covered through API tests rather than direct unit tests

### Frontend Unit Tests
- **Frontend unit tests: PRESENT**
- Frontend test files:
  - `frontend/src/tests/SeatGrid.test.js`
  - `frontend/src/tests/Toast.test.js`
  - `frontend/src/tests/auth.test.js`
  - `frontend/src/tests/stores.test.js`
  - `frontend/src/tests/pages.test.js`
  - `frontend/src/tests/HoldCountdown.test.js`
  - `frontend/src/tests/ThresholdBadge.test.js`
  - `frontend/src/tests/api.test.js`
- Frameworks/tools detected:
  - Vitest
  - Svelte Testing Library style component tests
- Covered frontend modules/components:
  - `frontend/src/components/SeatGrid.svelte`
  - `frontend/src/components/Toast.svelte`
  - `frontend/src/stores/auth.js`
  - `frontend/src/stores/cart.js`
  - `frontend/src/stores/skus.js`
  - dependency coverage for `frontend/src/routes/+layout.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/routes/admin/+page.svelte`, `frontend/src/routes/buyer/+page.svelte`, `frontend/src/routes/dispatcher/+page.svelte` via `frontend/src/tests/pages.test.js:12-90`
- Important frontend modules not directly unit rendered:
  - actual SvelteKit route files are covered indirectly through dependency-level tests plus Playwright, not directly rendered in Vitest

### Cross-Layer Observation
- Testing is reasonably balanced for a fullstack app:
  - backend API coverage is complete
  - frontend has unit/component coverage
  - full rendered flows exist in `e2e_tests/*.spec.js`

## API Observability Check
- Strong overall.
- Exact paths, request bodies, auth state, and response assertions are visible in the API suites.
- Strong examples:
  - `API_tests/cart_checkout.test.js:103-209`
  - `API_tests/security.test.js:8-247`
  - `API_tests/endpoint_coverage.test.js:206-231`
- Residual weak spot:
  - `API_tests/acceptance.test.js:32-37`, `133-138`, `178-191` still contain shared-state branch assertions, so a few cases prove reachability plus constrained outcomes rather than one guaranteed exact outcome.

## Tests Check
- Success paths: strong
- Failure/validation paths: strong
- Edge cases: strong
- Auth/permissions: strong
- Integration boundaries: strong
- Real assertions vs superficial: mostly meaningful
- Depth vs shallow tests: good overall
- Meaningful vs autogenerated: meaningful
- `run_tests.sh`: present and Docker-based
  - Evidence: `run_tests.sh:1-91`
  - Static note: it still performs `npm install` inside Docker test containers, which is acceptable under the README's Docker-contained rule because the installs happen inside the containerized test runner, not as a host prerequisite.

## End-to-End Expectations
- Project type is fullstack.
- Real FE ↔ BE rendered coverage is present.
- Evidence: `e2e_tests/04-dispatcher.spec.js`, `e2e_tests/05-reviewer.spec.js`, `e2e_tests/06-cross-role.spec.js`

## Test Coverage Score (0–100)
- **93/100**

## Score Rationale
- Full backend endpoint inventory is now covered by exact-path HTTP tests.
- Evidence upload success path exists and is asserted through real multipart upload.
- Frontend has component, store, dependency, and browser E2E coverage.

## Key Notes
- A few acceptance tests still branch on existing suite state instead of enforcing one fully fixed outcome:
  - `API_tests/acceptance.test.js:32-37`
  - `API_tests/acceptance.test.js:133-138`
  - `API_tests/acceptance.test.js:178-191`
- This does not affect the final pass verdict.

## Confidence & Assumptions
- Confidence: **high**
- Assumptions:
  - SvelteKit route files are treated as acceptably covered through `frontend/src/tests/pages.test.js` plus `e2e_tests/*.spec.js`, rather than direct Vitest rendering of `+page.svelte` and `+layout.svelte`
  - No runtime execution was used

# README Audit

## README Location
- Present at `README.md`

## Hard Gate Failures
- None found

## High Priority Issues
- None found

## Medium Priority Issues
- None found

## Low Priority Issues
- Route-page unit coverage is documented by strategy rather than explained in the README itself. This is not a hard-gate failure.

## Gate Check
- Formatting: pass
  - Evidence: `README.md:1-240`
- Project type declaration: pass
  - Evidence: `README.md:3`
- Startup command: pass
  - Evidence: `README.md:9-12`
- Access method: pass
  - Evidence: `README.md:15-37`
- Verification method: pass
  - Evidence: `README.md:165-188`
- Docker-contained instructions: pass
  - Evidence: `README.md:138-159`
- Demo credentials for auth-enabled system: pass
  - Evidence: `README.md:22-30`

## Engineering Quality
- Tech stack clarity: strong
- Architecture explanation: clear
- Testing instructions: clear and Docker-centered
- Security/roles: documented
- Workflows: documented for admin, buyer, dispatcher, reviewer
- Presentation quality: good

## README Verdict
- **PASS**

## Final Verdicts
- Test Coverage Audit: **PASS**
- README Audit: **PASS**
