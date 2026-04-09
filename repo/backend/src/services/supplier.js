import { query } from '../db/pool.js';
import { Errors } from '../utils/errors.js';

export async function listSuppliers(filters = {}) {
  let sql = 'SELECT * FROM suppliers';
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`name ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY name';

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function createSupplier(data) {
  const result = await query(
    'INSERT INTO suppliers (name, contact_info) VALUES ($1, $2) RETURNING *',
    [data.name, JSON.stringify(data.contact_info || {})]
  );
  return result.rows[0];
}

export async function updateSupplier(id, data) {
  const result = await query(
    `UPDATE suppliers SET name = COALESCE($1, name),
     contact_info = COALESCE($2, contact_info), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [data.name, data.contact_info ? JSON.stringify(data.contact_info) : null, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('Supplier');
  return result.rows[0];
}

export async function updateSupplierStatus(id, status) {
  const result = await query(
    'UPDATE suppliers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('Supplier');
  return result.rows[0];
}

// ---- SKU-Supplier Pricing ----

export async function listSupplierSKUs(supplierId) {
  const result = await query(
    `SELECT ss.*, sk.sku_code, sp.name as spu_name FROM sku_suppliers ss
     JOIN skus sk ON sk.id = ss.sku_id
     JOIN spus sp ON sp.id = sk.spu_id
     WHERE ss.supplier_id = $1 ORDER BY sp.name, sk.sku_code`,
    [supplierId]
  );
  return result.rows;
}

export async function listSKUSuppliers(skuId) {
  const result = await query(
    `SELECT ss.*, s.name as supplier_name FROM sku_suppliers ss
     JOIN suppliers s ON s.id = ss.supplier_id
     WHERE ss.sku_id = $1 ORDER BY ss.is_preferred DESC, s.name`,
    [skuId]
  );
  return result.rows;
}

export async function upsertSKUSupplier(skuId, data) {
  const result = await query(
    `INSERT INTO sku_suppliers (sku_id, supplier_id, unit_price, moq, pack_size, is_preferred, is_active, lead_time_days, is_taxable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (sku_id, supplier_id)
     DO UPDATE SET unit_price = $3, moq = $4, pack_size = $5, is_preferred = $6,
       is_active = $7, lead_time_days = $8, is_taxable = $9, updated_at = NOW()
     RETURNING *`,
    [skuId, data.supplier_id, data.unit_price, data.moq || 1, data.pack_size || 1,
     data.is_preferred || false, data.is_active !== false, data.lead_time_days || 0, data.is_taxable || false]
  );
  return result.rows[0];
}

export async function updateSKUSupplier(id, data) {
  const result = await query(
    `UPDATE sku_suppliers SET unit_price = COALESCE($1, unit_price), moq = COALESCE($2, moq),
     pack_size = COALESCE($3, pack_size), is_preferred = COALESCE($4, is_preferred),
     is_active = COALESCE($5, is_active), lead_time_days = COALESCE($6, lead_time_days),
     is_taxable = COALESCE($7, is_taxable), updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [data.unit_price, data.moq, data.pack_size, data.is_preferred, data.is_active, data.lead_time_days, data.is_taxable, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('SKU-Supplier pricing');
  return result.rows[0];
}

export async function deactivateSKUSupplier(id) {
  const result = await query(
    'UPDATE sku_suppliers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) throw Errors.notFound('SKU-Supplier pricing');
  return result.rows[0];
}
