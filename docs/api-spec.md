# PetMed Operations & Procurement Suite — API Specification

Base URL: `http://localhost:3020/api`

All responses follow: `{ "success": bool, "data": any, "error": { "code": string, "message": string, "details": any } }`

Authentication: Session cookie (`petmed_session`) set on login.
Integration: `X-Api-Token` + `X-Request-Signature` headers.

---

## 1. Authentication & Sessions

### POST /api/auth/login
Login with username and password.
- Body: `{ "username": string, "password": string }`
- 200: `{ "success": true, "data": { "user": { id, username, display_name, roles, permissions, scopes } } }`
- 401: Invalid credentials
- 423: Account locked (includes `locked_until`)
- Rate: 5 failures per 15 min per username triggers lockout

### POST /api/auth/logout
End current session.
- 200: Success
- 401: Not authenticated

### GET /api/auth/me
Get current user profile with roles and scopes.
- 200: `{ user, roles, scopes, permissions }`
- 401: Not authenticated

---

## 2. Users & Roles (Admin)

### GET /api/users
List users. Filterable by role, status, scope.
- Query: `?page=1&limit=20&role=buyer&status=active`
- 200: Paginated user list

### POST /api/users
Create user.
- Body: `{ username, password, display_name, email, roles: [string], scopes: [{ type, id }] }`
- 201: Created user
- 409: Username exists

### PUT /api/users/:id
Update user (including roles/scopes).
- 200: Updated user

### GET /api/roles
List available roles and their permissions.

---

## 3. Categories & Tags

### GET /api/categories
List categories (tree structure).
- Query: `?flat=true` for flat list

### POST /api/categories
Create category.
- Body: `{ name, parent_id?, sort_order? }`

### PUT /api/categories/:id
Update category.

### GET /api/tags
List tags.
- Query: `?search=string`

### POST /api/tags
Create tag.
- Body: `{ name }`

---

## 4. Products (SPU/SKU)

### GET /api/spus
List SPUs with filtering.
- Query: `?category_id=&tag=&status=&search=&page=1&limit=20`
- 200: Paginated SPU list with primary image, category, tags

### POST /api/spus
Create SPU.
- Body: `{ name, description, category_id, tags: [id], images: [{ url, is_primary, sort_order }], spec_attributes: [{ name, values }] }`
- 201: Created SPU

### GET /api/spus/:id
Get SPU detail with SKUs, images, specs.

### PUT /api/spus/:id
Update SPU.

### PATCH /api/spus/:id/status
Publish/unpublish/archive.
- Body: `{ status: "published"|"unpublished"|"archived" }`

### GET /api/spus/:spuId/skus
List SKUs for an SPU.

### POST /api/spus/:spuId/skus
Create SKU.
- Body: `{ sku_code, spec_combination: { strength?, size?, flavor?, ... } }`

### PUT /api/skus/:id
Update SKU.

### PATCH /api/skus/:id/status
Change SKU status.

---

## 5. Suppliers

### GET /api/suppliers
List suppliers.
- Query: `?status=active&search=&page=1&limit=20`

### POST /api/suppliers
Create supplier.
- Body: `{ name, contact_info }`

### PUT /api/suppliers/:id
Update supplier.

### PATCH /api/suppliers/:id/status
Archive/reactivate supplier.

### GET /api/suppliers/:id/skus
List all SKU pricing entries for a given supplier.
- 200: Array of SKU-supplier pricing records with sku_code and spu_name

---

## 6. SKU-Supplier Pricing

### GET /api/skus/:skuId/suppliers
List supplier pricing for a SKU.

### POST /api/skus/:skuId/suppliers
Add/update supplier pricing.
- Body: `{ supplier_id, unit_price, moq, pack_size, is_preferred, is_active, lead_time_days, is_taxable }`

### PUT /api/sku-suppliers/:id
Update pricing record.

### DELETE /api/sku-suppliers/:id
Deactivate pricing record (soft).

---

## 7. Inventory

### GET /api/inventory
List inventory records.
- Query: `?warehouse_id=&sku_id=&threshold_state=warning|critical&page=1&limit=20`
- Response includes computed `threshold_state` (normal|warning|critical)

### POST /api/inventory
Create/update inventory record.
- Body: `{ sku_id, warehouse_id, lot_number?, available_qty, threshold_warning?, threshold_critical? }`

### PUT /api/inventory/:id
Update inventory.

### GET /api/warehouses
List warehouses.

### POST /api/warehouses
Create warehouse.

---

## 8. Excel Import/Export

### GET /api/import/templates/:type
Download Excel template. Types: `spu`, `sku`, `inventory`, `supplier-pricing`
- 200: Excel file download

### POST /api/import/:type
Upload and validate Excel file.
- Body: multipart form with file
- 200: `{ valid_rows: [], error_rows: [{ row, field, message }], total, valid_count, error_count }`
- Does NOT commit — returns validation results only

### POST /api/import/:type/commit
Commit a validated import.
- Body: `{ import_session_id }`
- 200: `{ imported_count, skipped_count }`

### GET /api/export/:type
Export current data as Excel.
- Query: filters matching the entity type
- 200: Excel file download

---

## 9. Cart & Estimates

### GET /api/cart
Get current active cart for authenticated buyer.
- 200: Cart with items, estimates

### POST /api/cart/items
Add item to cart.
- Body: `{ sku_id, quantity, supplier_id? }`
- 400: MOQ/pack-size violation
- 200: Updated cart

### PUT /api/cart/items/:id
Update cart item quantity.
- 400: MOQ/pack-size violation

### DELETE /api/cart/items/:id
Remove item from cart.

### POST /api/cart/estimate
Compute live estimate with supplier splitting.
- 200: `{ splits: [{ supplier, lines, subtotal, handling_fee, tax, total }], grand_total, estimate_id }`

### POST /api/cart/checkout
Submit order.
- Body: `{ estimate_id, idempotency_key, confirmed_drift?: bool }`
- 200: Order created
- 409: Duplicate order (idempotency_key)
- 409: Price/inventory drift > 2% — returns `{ drift_detected: true, old_total, new_total, line_changes: [], requires_confirmation: true }`
- 400: Inventory unavailable

---

## 10. Constrained Holds

### GET /api/constrained-slots
List slots for a constrained inventory.
- Query: `?inventory_id=`
- 200: Slots with status (available, held, reserved)

### POST /api/holds
Create a hold on selected slots.
- Body: `{ slot_ids: [int], client_request_key: string }`
- 200: `{ hold_id, expires_at, slots }`
- 409: Slot(s) already held/reserved
- 400: Adjacency validation failure (single-gap rule)
- 200 (idempotent): Same response if client_request_key matches existing active hold

### GET /api/holds/:id
Get hold status with countdown.

### DELETE /api/holds/:id
Cancel hold, release slots.

### POST /api/holds/:id/checkout
Convert hold to committed reservation + create order.
- Body: `{ idempotency_key }`
- 200: Order created, slots marked reserved

---

## 11. Dispatch Tasks

### GET /api/tasks
List tasks for dispatcher.
- Query: `?status=open&mode=grab|assigned&warehouse_id=&page=1&limit=20`
- 200: Tasks with recommendation scores (when mode=grab)

### GET /api/tasks/:id
Get task detail.

### POST /api/tasks/:id/accept
Accept a task (optimistic concurrency). Available to dispatchers (`task.*`).
- Body: `{ version: int }`
- 200: Task accepted
- 409: Already taken or version mismatch

### POST /api/tasks/:id/assign (Admin only)
Assign a task to a specific user. Requires `admin.*` permission.
- Body: `{ user_id: string }`
- 200: Task assigned
- 403: Non-admin callers are rejected

### PATCH /api/tasks/:id/status
Update task status.
- Body: `{ status: "in_progress"|"completed"|"failed"|"cancelled" }`

### GET /api/tasks/recommendations
Get recommended tasks for current dispatcher.
- 200: Ranked task list with scores and reasoning

### GET /api/worker-metrics
Get current user's worker metrics.

---

## 12. Outcomes, Projects & Evidence

### GET /api/outcomes
List outcomes.
- Query: `?type=&status=&search=&page=1&limit=20`

### POST /api/outcomes
Create outcome.
- Body: `{ type, title, certificate_number?, description, projects: [{ project_id, contribution_share }] }`
- 200: `{ outcome, duplicate_warnings: [{ field, match_type, existing_id, existing_title }] }`

### PUT /api/outcomes/:id
Update outcome.
- 400: Contribution shares don't sum to 100% (on submit/publish)

### PATCH /api/outcomes/:id/status
Change status (draft -> submitted -> published).
- 400: Shares must sum to 100% for submit/publish

### POST /api/outcomes/:id/evidence
Upload evidence file.
- Body: multipart form with file
- 200: `{ evidence_id, file_name, checksum }`

### GET /api/evidence/:id/download
Download evidence file (authorized).
- 200: File stream

### GET /api/projects
List projects.
- Query: `?department_id=&search=`

### POST /api/projects
Create project.

---

## 13. Integration API

### POST /api/integration/ingest
Ingest data from external system.
- Headers: `X-Api-Token`, `X-Request-Signature`, `X-Timestamp`
- Body: `{ entity_type, action, payload }`
- 202: Accepted for processing
- 401: Invalid token
- 403: Invalid signature
- 429: Rate limit exceeded (60/min per token)

### GET /api/integration/tokens (admin)
List integration tokens.

### POST /api/integration/tokens (admin)
Create integration token.
- 201: `{ token_id, token (shown once), secret_key (shown once) }`

### GET /api/integration/dead-letter (admin)
List dead-letter entries.
- Query: `?token_id=&page=1&limit=20`

### POST /api/integration/dead-letter/:id/retry (admin)
Manually retry a dead-letter entry.

---

## 14. Audit Logs

### GET /api/audit-logs (admin)
List audit log entries.
- Query: `?user_id=&action=&entity_type=&from=&to=&page=1&limit=50`
- 200: Paginated audit entries (sensitive fields masked)

---

## 15. System Configuration (Admin)

### GET /api/config
List system configuration.

### PUT /api/config/:key
Update configuration value.
- Body: `{ value: any }`

---

## 16. Health Check

### GET /api/health
Check system health and database connectivity.
- 200: `{ "success": true, "data": { "status": "ok", "timestamp": "ISO8601" } }`
- 200 (degraded): `{ "success": false, "data": { "status": "degraded", "timestamp": "ISO8601" } }`

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| AUTH_REQUIRED | 401 | Not authenticated |
| AUTH_INVALID | 401 | Invalid credentials |
| AUTH_LOCKED | 423 | Account locked |
| FORBIDDEN | 403 | Insufficient permissions |
| SCOPE_DENIED | 403 | Data scope violation |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Concurrency conflict |
| DUPLICATE | 409 | Duplicate resource |
| VALIDATION | 400 | Validation error |
| DRIFT_DETECTED | 409 | Price/inventory drift |
| RATE_LIMITED | 429 | Rate limit exceeded |
| SERVER_ERROR | 500 | Internal error (no stack trace) |
