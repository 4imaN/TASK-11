# questions.md

## Business Logic Questions Log

### 1. What does “offline-first” mean for this suite?
- **Question:** The prompt says the suite is “offline-first” and runs over the local network, but it does not specify whether the frontend must support full client-side offline writes and later sync, or whether the backend remains the required source of truth.
- **My Understanding:** The backend remains the system of record. “Offline-first” means the UI should stay usable during short LAN disruptions by caching read-mostly data, preserving drafts locally, and recovering gracefully after reconnect, rather than implementing a separate fully offline write-sync engine.
- **Solution:** Implement local caching for catalog lookups, templates, and reference data; persist in-progress carts/import sessions/form drafts in browser storage; require backend confirmation for all state-changing actions such as checkout, holds, dispatch acceptance, and evidence submission.

### 2. The UI is said to serve three primary roles, so where do “Reviewers” fit?
- **Question:** The prompt names three primary roles (Administrator, Buyer, Dispatcher/Picker), but later says “Reviewers manage outcomes records.”
- **My Understanding:** “Reviewer” is not a fourth primary shell. It is a permission bundle inside the administrator area, available only to users granted outcomes-review permissions.
- **Solution:** Keep three primary navigation shells. Add an `outcomes_reviewer` permission set under RBAC so only authorized admins can access the outcomes/project/evidence module.

### 3. How should SPU and SKU be modeled?
- **Question:** The prompt requires SPU/SKU workflows but does not define lifecycle, status, or whether records can be deleted.
- **My Understanding:** SPU represents the product family; SKU represents the purchasable/inventoried variant defined by spec combinations such as strength, size, and flavor. Because audit logs and historical orders are required, master data should not be hard-deleted.
- **Solution:** Use SPU + SKU tables with status fields such as `draft`, `published`, `unpublished`, and `archived`. Use soft archival rather than physical deletion for auditable entities.

### 4. Where do the low-stock thresholds apply?
- **Question:** The prompt says inventory visually warns at 15 units and becomes critical at 5 units, but it does not say whether this is global, per SKU, per warehouse, or per lot.
- **My Understanding:** Thresholds should apply to the available quantity of each SKU inventory record within a warehouse/lot context, because authorization can be scoped by warehouse and inventory locking can apply to lots or seat-like allocations.
- **Solution:** Compute threshold color state from `available_qty` after deducting active holds/reservations on each SKU inventory record and surface it in admin and buyer catalog views.

### 5. How should supplier splitting work when a SKU can come from multiple suppliers?
- **Question:** The prompt requires live order estimates that split by supplier automatically, but it does not define the source-of-truth rule when several suppliers can fulfill the same SKU.
- **My Understanding:** Each SKU-supplier relationship should store supplier-specific MOQ, pack size, price, preferred/active status, and taxability. Automatic splitting should follow a deterministic preferred-supplier rule unless the buyer explicitly overrides it.
- **Solution:** Add a SKU-supplier pricing table. At estimate time, select the preferred active supplier for each eligible line by deterministic ranking; support optional manual override; always re-check price and stock at checkout.

### 6. How should handling fees and local sales tax be configured?
- **Question:** The prompt requires a configurable handling fee and local sales tax rules “where applicable,” but it does not define the scope or calculation order.
- **My Understanding:** Fees and tax rules should be configurable by store or warehouse jurisdiction. Tax should apply only to taxable lines, and the calculation order must be deterministic.
- **Solution:** Add admin configuration for handling fee rules and tax rules. Use a documented pricing pipeline: line subtotal -> pack/MOQ validation -> supplier split -> handling fee -> taxable base -> tax -> final estimate.

### 7. What exactly triggers the required re-confirmation on checkout?
- **Question:** The prompt says the user is prompted to confirm any change over 2%, but it does not clarify whether this means per-line or total-order change.
- **My Understanding:** The safest interpretation is total-order delta above 2%, while still surfacing line-level changes for transparency.
- **Solution:** Store the estimate snapshot during cart review. On checkout, recompute current pricing/inventory in a transaction, compare the new total to the quoted total, and require explicit re-confirmation if the absolute total delta exceeds 2% or if any line becomes unavailable.

### 8. How should “seat-style inventory locking” generalize beyond literal seats?
- **Question:** The prompt gives examples like vaccine appointment seats or controlled batch allocations, but it does not define the shared model.
- **My Understanding:** Both cases can be represented as an ordered row/slot allocation model where each selectable unit belongs to a row and a position, and adjacency rules are validated on selection.
- **Solution:** Model constrained inventory slots with `row_code` and `position_index`. Use an adjacency validator that blocks single-seat gaps inside a row unless the gap is at the row edge.

### 9. What happens when a hold expires or checkout succeeds?
- **Question:** The prompt requires 10-minute holds, visible countdowns, auto-release, cancellation, idempotency, and row-level locking, but it does not define the state change after successful order submission.
- **My Understanding:** A hold is temporary. Successful checkout converts the hold into a reservation/allocation linked to the order; cancellation or timeout releases it.
- **Solution:** Create a holds table with `expires_at`, `status`, `client_request_key`, and slot references. Release expired holds every minute with a scheduler. Convert active holds to committed reservations in the checkout transaction.

### 10. How should duplicate order rejection be implemented?
- **Question:** The prompt says duplicate orders are rejected, but it does not specify the detection rule.
- **My Understanding:** Duplicate prevention should be idempotency-first and transaction-safe.
- **Solution:** Require an idempotency/request key on order submit, enforce a unique constraint on it, and add a secondary order fingerprint check based on buyer/store/cart snapshot inside the transaction to guard against rapid accidental resubmission.

### 11. When are fulfillment tasks created, and how do assigned vs grab-order modes coexist?
- **Question:** The prompt requires a task board with grab-order and assigned modes, but it does not define when tasks are generated or how both modes are used together.
- **My Understanding:** Tasks are created once split orders become fulfillment-ready. Some tasks are pre-assigned by rules or supervisors, while others enter a shared grab pool.
- **Solution:** Add task statuses such as `open`, `assigned`, `accepted`, `in_progress`, `completed`, `failed`, and `cancelled`. Generate tasks after order readiness. Use optimistic concurrency on acceptance so the same task cannot be taken twice.

### 12. How should recommendation ranking for dispatchers be calculated?
- **Question:** The prompt says recommended tasks are ranked by time window fit, workload balance, and reputation score, but it does not specify the formula.
- **My Understanding:** A simple deterministic local formula is sufficient as long as it is explainable and based on completed-task history.
- **Solution:** Compute a weighted score from due-window urgency, active workload count, completion timeliness, and recent failure/acceptance history. Store or derive the score locally and expose ranking reasons in the UI.

### 13. How strict should duplicate detection be for outcomes records?
- **Question:** The prompt asks for “simple duplicate warnings” when titles or certificate numbers closely match, but it does not define whether this is blocking or what similarity rule to use.
- **My Understanding:** These warnings are advisory only and should not block submission.
- **Solution:** Normalize titles/certificate numbers, check exact matches first, then near matches using case-insensitive normalized comparison and trigram similarity thresholds. Return warnings in the response and let the reviewer continue.

### 14. What is the expected behavior when contribution shares do not sum to 100%?
- **Question:** The prompt requires project contribution shares to sum to 100%, but it does not say whether partial save is allowed.
- **My Understanding:** Draft editing can be allowed, but publish/final-submit must fail until the shares sum to exactly 100%.
- **Solution:** Allow draft outcomes with incomplete allocations, but block final submission/publish until project shares total 100.00% within a small decimal tolerance.

### 15. What does the local “open API” integration include?
- **Question:** The prompt mentions local open API integration with token auth, request signatures, rate limiting, retry with exponential backoff, and a dead-letter log after 5 failures, but it does not define the flow.
- **My Understanding:** The suite should expose inbound local integration endpoints for on-prem devices/systems. Requests enter an ingestion pipeline that validates signature and rate limits, then processes asynchronously with retries and a dead-letter log for repeated failure.
- **Solution:** Build an integration token model, HMAC-style request signing, 60 requests/minute per token rate limiting, async ingestion jobs, exponential backoff retry, and a dead-letter log entry after 5 failed processing attempts.

### 16. How should sensitive-field protection work “at rest where feasible”?
- **Question:** The prompt requires password hashes, evidence file paths, and certificate numbers to be protected and masked, but hashing and encryption are not the same thing.
- **My Understanding:** Passwords must be salted and hashed only. Evidence file paths and certificate numbers should be application-encrypted where feasible, while being masked in list and audit views.
- **Solution:** Use salted password hashing for credentials, application-level encryption for certificate numbers and evidence storage paths, and masking rules in API serializers and audit views.

### 17. How should evidence files be stored while supporting tamper detection?
- **Question:** The prompt says files are stored on local disk and fingerprints are recorded in PostgreSQL, but it does not define storage location or access pattern.
- **My Understanding:** Files should live outside the public web root on a mounted local volume, with download access mediated by the API.
- **Solution:** Store files in a backend-managed directory, compute SHA-256 checksums on upload, record the checksum and encrypted storage path in PostgreSQL, and serve downloads through authorized API endpoints only.

### 18. How should data-scope constraints combine warehouse, department, and store?
- **Question:** The prompt says authorization includes data-scope constraints, but it does not define how multiple scopes are combined.
- **My Understanding:** A user may hold one or more scopes across store, warehouse, and department. Access should require a matching relevant scope dimension for the resource being acted upon.
- **Solution:** Add user-scope mapping tables and a shared policy layer used by both the API and the frontend menu/button rendering logic.

### 19. How should Excel import/export scope be defined?
- **Question:** The prompt clearly requires Excel templates with row-level validation feedback, but it does not list which entities must support import/export.
- **My Understanding:** At minimum, the suite must support catalog-related templates that materially affect the procurement flow: SPUs, SKUs, inventory, and supplier pricing. Outcomes import can remain optional unless time allows.
- **Solution:** Prioritize templates for SPU/SKU catalog import, inventory import/export, and supplier price rules. Return row-level validation errors immediately before commit and allow exporting current data to the same template shape.

### 20. How should sessions and lockout work in an offline local environment?
- **Question:** The prompt requires account lockout after 5 failed attempts in 15 minutes and sessions expiring after 8 hours of inactivity, but it does not define session storage.
- **My Understanding:** Session state should be stored server-side so it survives page refreshes and supports auditability.
- **Solution:** Use secure server-side session records in PostgreSQL with inactivity timestamps, enforce 5 failed logins in a rolling 15-minute window, and log lockout/auth events for auditing.
