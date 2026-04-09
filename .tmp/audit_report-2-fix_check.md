# Prior Audit Issue Recheck

## Verdict
- Overall conclusion: Fixed
- Static-only review. I did not run the project, tests, Docker, or external services.

## Scope
- Reviewed the prior issue list in [.tmp/delivery_acceptance_audit.md](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/.tmp/delivery_acceptance_audit.md).
- Re-checked only the previously reported material issues:
  - `admin.*` scope bypass
  - dispatcher task visibility isolation
  - outcome status response leaking encrypted certificate data
  - Excel SPU import/export missing image/spec support
  - inconsistent offline queue policy

## Issue Status

### 1. `admin.*` completely disables data-scope enforcement
- Previous severity: High
- Current status: Fixed
- Rationale: scope helpers now explicitly state that `admin.*` does not bypass scope, and unrestricted access is limited to users with no scope entries at all.
- Evidence:
  - [backend/src/middleware/auth.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/middleware/auth.js#L99): `requireScope` now denies scoped users outside allowed scope.
  - [backend/src/middleware/auth.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/middleware/auth.js#L133): `isGlobalAdmin` only returns true for `admin.*` users with no scopes.
  - [backend/src/middleware/auth.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/middleware/auth.js#L140): `getScopeFilter` no longer treats `admin.*` as unrestricted by itself.
  - [unit_tests/scoped_admin.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/scoped_admin.test.js#L44): new tests cover global admin vs scoped admin behavior.

### 2. Task listing lacks object-level isolation for dispatchers
- Previous severity: High
- Current status: Fixed
- Rationale: the route now enforces an explicit non-admin mode allowlist and normalizes missing or unsupported values to `own_and_grab`. The service also adds a defensive fallback so unsupported non-`all` modes with a `user_id` still collapse to the restrictive own-or-grab filter instead of broadening visibility.
- Evidence:
  - [backend/src/routes/tasks.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/routes/tasks.js#L9): route defines `ALLOWED_NON_ADMIN_MODES` and a restrictive default.
  - [backend/src/routes/tasks.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/routes/tasks.js#L26): non-admin unsupported or missing `mode` values are normalized to `own_and_grab`.
  - [backend/src/services/tasks.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/tasks.js#L67): `assigned`, `grab`, and `own_and_grab` remain explicitly filtered.
  - [backend/src/services/tasks.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/tasks.js#L77): service-level defensive fallback applies `own_and_grab` semantics for unrecognized non-`all` modes with `user_id`.
  - [backend/src/routes/tasks.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/routes/tasks.js#L53): task detail access remains restricted to own or open/unassigned tasks for non-admin users.
  - [unit_tests/task_visibility.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/task_visibility.test.js#L20): tests now cover route-level mode allowlisting and normalization.
  - [unit_tests/task_visibility.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/task_visibility.test.js#L65): tests also cover service-level fallback handling.
- Note: static evidence is sufficient to mark the original defect fixed, but API-level negative tests for unsupported non-admin `mode` values would still strengthen regression protection.

### 3. Outcome status API returns encrypted certificate data directly
- Previous severity: Medium
- Current status: Fixed
- Rationale: the service now sanitizes returned outcome rows before responding, removing the encrypted field and replacing it with a masked display field.
- Evidence:
  - [backend/src/services/outcomes.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/outcomes.js#L242): `sanitizeOutcomeRow` deletes `certificate_number_encrypted`.
  - [backend/src/services/outcomes.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/outcomes.js#L271): `updateOutcomeStatus` still uses `RETURNING *` internally.
  - [backend/src/services/outcomes.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/outcomes.js#L278): response is sanitized before return.
  - [unit_tests/outcome_response_shape.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/outcome_response_shape.test.js#L6): tests verify encrypted field removal.

### 4. Excel import/export does not cover SPU images or spec attributes
- Previous severity: Medium
- Current status: Fixed
- Rationale: SPU templates, validation, import commit logic, and export logic now include both image URLs and spec attributes.
- Evidence:
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L8): SPU template now includes `Image URLs (pipe-separated)` and `Spec Attributes (JSON)`.
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L172): row validation checks image URL format.
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L181): row validation checks spec-attribute JSON structure.
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L343): import commit persists `spu_images`.
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L354): import commit persists `spec_attributes`.
  - [backend/src/services/excel.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/backend/src/services/excel.js#L456): export reconstructs image/spec data.
  - [unit_tests/excel_spu_images_specs.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/excel_spu_images_specs.test.js#L46): tests cover new row-level validation rules.
- Note: the added tests mostly duplicate validation logic instead of exercising the full Excel pipeline, so implementation exists, but end-to-end static test proof is still limited.

### 5. Offline queue policy is inconsistently implemented
- Previous severity: Medium
- Current status: Fixed
- Rationale: queueability rules are now centralized in one module and reused by both offline queuing paths.
- Evidence:
  - [frontend/src/lib/offlineMutationPolicy.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/frontend/src/lib/offlineMutationPolicy.js#L8): single canonical denylist for non-queueable mutations.
  - [frontend/src/lib/mutationQueue.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/frontend/src/lib/mutationQueue.js#L2): queue logic imports the shared policy.
  - [frontend/src/lib/offlineApi.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/frontend/src/lib/offlineApi.js#L4): offline fallback also imports the same shared policy.
  - [unit_tests/offline_mutation_policy.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/unit_tests/offline_mutation_policy.test.js#L15): tests cover holds, checkout, task mutations, auth, and evidence upload.
  - [frontend/src/lib/__tests__/offlineMutationPolicy.test.js](/Users/aimanmengesha/Desktop/eagle%20point/Slopering/w2t11/repo/frontend/src/lib/__tests__/offlineMutationPolicy.test.js#L77): queue layer tests confirm blocked mutations now throw instead of queuing.

## Summary
- Fixed: 5 of 5 previously reported material issues.
- No previously reported issue remains open by static evidence.
- Residual verification gap: the task-visibility fix is covered by route/service unit tests and static code inspection, but API-level negative tests for invalid non-admin `mode` values would provide stronger regression assurance.
