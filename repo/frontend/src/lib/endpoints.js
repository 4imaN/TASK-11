/**
 * Centralized API endpoint constants.
 *
 * All paths are relative to the /api base URL configured in lib/api.js.
 * This file serves as a single reference for every backend endpoint used by
 * the frontend.  Existing pages have NOT been refactored to consume these
 * constants yet -- this is provided as a maintenance/documentation aid so
 * that endpoint paths can be audited, searched, and updated in one place.
 */

export const ENDPOINTS = {
  // ---- Auth ----
  AUTH_LOGIN:  '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_ME:     '/auth/me',

  // ---- Users ----
  USERS:       '/users',
  USER_BY_ID:  '/users/:id',   // PUT

  // ---- Roles ----
  ROLES:       '/roles',

  // ---- Catalog: Categories & Tags ----
  CATEGORIES:       '/categories',
  CATEGORY_BY_ID:   '/categories/:id',
  TAGS:             '/tags',

  // ---- Catalog: SPUs ----
  SPUS:             '/spus',
  SPU_BY_ID:        '/spus/:id',
  SPU_STATUS:       '/spus/:id/status',
  SPU_SKUS:         '/spus/:spuId/skus',

  // ---- Catalog: SKUs ----
  SKU_BY_ID:        '/skus/:id',
  SKU_STATUS:       '/skus/:id/status',
  SKU_SUPPLIERS:    '/skus/:skuId/suppliers',

  // ---- Suppliers ----
  SUPPLIERS:            '/suppliers',
  SUPPLIER_BY_ID:       '/suppliers/:id',
  SUPPLIER_STATUS:      '/suppliers/:id/status',
  SUPPLIER_SKUS:        '/suppliers/:id/skus',
  SKU_SUPPLIER_BY_ID:   '/sku-suppliers/:id',

  // ---- Inventory & Warehouses ----
  INVENTORY:        '/inventory',
  INVENTORY_BY_ID:  '/inventory/:id',
  WAREHOUSES:       '/warehouses',

  // ---- Cart & Checkout ----
  CART:             '/cart',
  CART_ITEMS:       '/cart/items',
  CART_ITEM_BY_ID:  '/cart/items/:id',
  CART_ESTIMATE:    '/cart/estimate',
  CART_CHECKOUT:    '/cart/checkout',

  // ---- Seat-Style Holds ----
  CONSTRAINED_SLOTS:  '/constrained-slots',
  HOLDS:              '/holds',
  HOLD_BY_ID:         '/holds/:id',
  HOLD_CHECKOUT:      '/holds/:id/checkout',

  // ---- Tasks & Dispatch ----
  TASKS:                  '/tasks',
  TASK_BY_ID:             '/tasks/:id',
  TASK_ACCEPT:            '/tasks/:id/accept',
  TASK_STATUS:            '/tasks/:id/status',
  TASK_RECOMMENDATIONS:   '/tasks/recommendations',
  WORKER_METRICS:         '/worker-metrics',

  // ---- Outcomes & Evidence ----
  OUTCOMES:             '/outcomes',
  OUTCOME_BY_ID:        '/outcomes/:id',
  OUTCOME_STATUS:       '/outcomes/:id/status',
  OUTCOME_EVIDENCE:     '/outcomes/:id/evidence',
  EVIDENCE_DOWNLOAD:    '/evidence/:id/download',

  // ---- Projects ----
  PROJECTS:       '/projects',

  // ---- Integration API ----
  INTEGRATION_INGEST:         '/integration/ingest',
  INTEGRATION_TOKENS:         '/integration/tokens',
  INTEGRATION_DEAD_LETTER:    '/integration/dead-letter',
  INTEGRATION_DEAD_LETTER_RETRY: '/integration/dead-letter/:id/retry',

  // ---- Import / Export (Excel) ----
  IMPORT_TEMPLATE:  '/import/templates/:type',
  IMPORT:           '/import/:type',
  IMPORT_COMMIT:    '/import/:type/commit',
  EXPORT:           '/export/:type',

  // ---- System Config & Admin ----
  CONFIG:       '/config',
  CONFIG_BY_KEY:'/config/:key',
  AUDIT_LOGS:   '/audit-logs',
  STORES:       '/stores',
  DEPARTMENTS:  '/departments',
};
