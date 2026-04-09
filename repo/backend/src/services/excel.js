import ExcelJS from 'exceljs';
import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';

const TEMPLATES = {
  spu: {
    columns: [
      { header: 'Name', key: 'name', required: true },
      { header: 'Description', key: 'description', required: false },
      { header: 'Category Slug', key: 'category_slug', required: true },
      { header: 'Tags (comma-separated)', key: 'tags', required: false },
      { header: 'Status', key: 'status', required: false },
      { header: 'Image URLs (pipe-separated)', key: 'image_urls', required: false },
      { header: 'Spec Attributes (JSON)', key: 'spec_attributes', required: false },
    ],
  },
  sku: {
    columns: [
      { header: 'SPU Name', key: 'spu_name', required: true },
      { header: 'SKU Code', key: 'sku_code', required: true },
      { header: 'Spec Combination (JSON)', key: 'spec_combination', required: true },
      { header: 'Status', key: 'status', required: false },
    ],
  },
  inventory: {
    columns: [
      { header: 'SKU Code', key: 'sku_code', required: true },
      { header: 'Warehouse Code', key: 'warehouse_code', required: true },
      { header: 'Lot Number', key: 'lot_number', required: false },
      { header: 'Available Qty', key: 'available_qty', required: true },
      { header: 'Warning Threshold', key: 'threshold_warning', required: false },
      { header: 'Critical Threshold', key: 'threshold_critical', required: false },
    ],
  },
  'supplier-pricing': {
    columns: [
      { header: 'SKU Code', key: 'sku_code', required: true },
      { header: 'Supplier Name', key: 'supplier_name', required: true },
      { header: 'Unit Price', key: 'unit_price', required: true },
      { header: 'MOQ', key: 'moq', required: true },
      { header: 'Pack Size', key: 'pack_size', required: true },
      { header: 'Is Preferred (true/false)', key: 'is_preferred', required: false },
      { header: 'Is Taxable (true/false)', key: 'is_taxable', required: false },
    ],
  },
};

export async function generateTemplate(type) {
  const template = TEMPLATES[type];
  if (!template) throw Errors.validation(`Unknown import type: ${type}`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template');
  sheet.columns = template.columns.map(col => ({
    header: col.header,
    key: col.key,
    width: 25,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  return workbook.xlsx.writeBuffer();
}

export async function validateImport(type, fileBuffer, userId) {
  const template = TEMPLATES[type];
  if (!template) throw Errors.validation(`Unknown import type: ${type}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.validation('No worksheet found in file');

  // Validate header row matches template exactly
  const headerRow = sheet.getRow(1);
  const actualHeaders = [];
  template.columns.forEach((col, idx) => {
    const cellValue = headerRow.getCell(idx + 1).value;
    actualHeaders.push(cellValue ? String(cellValue).trim() : '');
  });

  const expectedHeaders = template.columns.map(c => c.header);
  const headerErrors = [];
  if (actualHeaders.length < expectedHeaders.length) {
    headerErrors.push(`Expected ${expectedHeaders.length} columns, found ${actualHeaders.length}`);
  }
  for (let i = 0; i < expectedHeaders.length; i++) {
    if (actualHeaders[i] !== expectedHeaders[i]) {
      headerErrors.push(`Column ${i+1}: expected "${expectedHeaders[i]}", found "${actualHeaders[i] || '(empty)'}"`);
    }
  }
  if (headerErrors.length > 0) {
    throw Errors.validation('Template header mismatch', { expected: expectedHeaders, actual: actualHeaders, errors: headerErrors });
  }

  const validRows = [];
  const errorRows = [];
  let rowNum = 1;

  sheet.eachRow((row, index) => {
    if (index === 1) return;
    rowNum = index;

    const rowData = {};
    const rowErrors = [];

    template.columns.forEach((col, colIdx) => {
      const cellValue = row.getCell(colIdx + 1).value;
      const strValue = cellValue != null ? String(cellValue).trim() : '';
      rowData[col.key] = strValue;

      if (col.required && !strValue) {
        rowErrors.push({ field: col.key, message: `${col.header} is required` });
      }
    });

    const typeErrors = validateRowByType(type, rowData);
    rowErrors.push(...typeErrors);

    if (rowErrors.length > 0) {
      errorRows.push({ row: index, data: rowData, errors: rowErrors });
    } else {
      validRows.push({ row: index, data: rowData });
    }
  });

  // Referential validation for rows that passed format checks
  const referentiallyValid = [];
  for (const row of validRows) {
    const refErrors = await validateReferentialIntegrity(type, row.data);
    if (refErrors.length > 0) {
      errorRows.push({ row: row.row, data: row.data, errors: refErrors });
    } else {
      referentiallyValid.push(row);
    }
  }

  const finalValid = referentiallyValid;
  const finalErrors = errorRows;

  const sessionResult = await query(
    `INSERT INTO import_sessions (user_id, type, valid_rows, error_rows, total_rows, valid_count, error_count, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'validated') RETURNING id`,
    [userId, type, JSON.stringify(finalValid), JSON.stringify(finalErrors),
     finalValid.length + finalErrors.length, finalValid.length, finalErrors.length]
  );

  return {
    import_session_id: sessionResult.rows[0].id,
    valid_rows: finalValid,
    error_rows: finalErrors,
    total: finalValid.length + finalErrors.length,
    valid_count: finalValid.length,
    error_count: finalErrors.length,
  };
}

function validateRowByType(type, data) {
  const errors = [];
  switch (type) {
    case 'spu':
      if (data.status && !['draft', 'published', 'unpublished', 'archived'].includes(data.status)) {
        errors.push({ field: 'status', message: 'Status must be draft, published, unpublished, or archived' });
      }
      if (data.image_urls) {
        const urls = data.image_urls.split('|').map(u => u.trim()).filter(Boolean);
        for (const url of urls) {
          if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
            errors.push({ field: 'image_urls', message: `Invalid image URL: "${url}" (must start with http://, https://, or /)` });
            break;
          }
        }
      }
      if (data.spec_attributes) {
        try {
          const parsed = JSON.parse(data.spec_attributes);
          if (!Array.isArray(parsed)) {
            errors.push({ field: 'spec_attributes', message: 'Spec Attributes must be a JSON array' });
          } else {
            for (const spec of parsed) {
              if (!spec.name || !Array.isArray(spec.values)) {
                errors.push({ field: 'spec_attributes', message: 'Each spec attribute must have "name" (string) and "values" (array)' });
                break;
              }
            }
          }
        } catch {
          errors.push({ field: 'spec_attributes', message: 'Spec Attributes must be valid JSON' });
        }
      }
      break;
    case 'sku':
      if (data.spec_combination) {
        try { JSON.parse(data.spec_combination); } catch {
          errors.push({ field: 'spec_combination', message: 'Must be valid JSON' });
        }
      }
      break;
    case 'inventory':
      if (data.available_qty && (isNaN(data.available_qty) || parseInt(data.available_qty) < 0)) {
        errors.push({ field: 'available_qty', message: 'Must be a non-negative integer' });
      }
      break;
    case 'supplier-pricing':
      if (data.unit_price && (isNaN(data.unit_price) || parseFloat(data.unit_price) <= 0)) {
        errors.push({ field: 'unit_price', message: 'Must be a positive number' });
      }
      if (data.moq && (isNaN(data.moq) || parseInt(data.moq) < 1)) {
        errors.push({ field: 'moq', message: 'Must be a positive integer' });
      }
      if (data.pack_size && (isNaN(data.pack_size) || parseInt(data.pack_size) < 1)) {
        errors.push({ field: 'pack_size', message: 'Must be a positive integer' });
      }
      break;
  }
  return errors;
}

async function validateReferentialIntegrity(type, data) {
  const errors = [];
  switch (type) {
    case 'spu': {
      if (data.category_slug) {
        const catResult = await query('SELECT id FROM categories WHERE slug = $1', [data.category_slug]);
        if (catResult.rows.length === 0) {
          errors.push({ field: 'category_slug', message: `Category slug '${data.category_slug}' does not exist` });
        }
      }
      break;
    }
    case 'sku': {
      if (data.spu_name) {
        const spuResult = await query('SELECT id FROM spus WHERE name = $1', [data.spu_name]);
        if (spuResult.rows.length === 0) {
          errors.push({ field: 'spu_name', message: `SPU name '${data.spu_name}' does not exist` });
        }
      }
      break;
    }
    case 'inventory': {
      if (data.sku_code) {
        const skuResult = await query('SELECT id FROM skus WHERE sku_code = $1', [data.sku_code]);
        if (skuResult.rows.length === 0) {
          errors.push({ field: 'sku_code', message: `SKU code '${data.sku_code}' does not exist` });
        }
      }
      if (data.warehouse_code) {
        const whResult = await query('SELECT id FROM warehouses WHERE code = $1', [data.warehouse_code]);
        if (whResult.rows.length === 0) {
          errors.push({ field: 'warehouse_code', message: `Warehouse code '${data.warehouse_code}' does not exist` });
        }
      }
      break;
    }
    case 'supplier-pricing': {
      if (data.sku_code) {
        const skuResult = await query('SELECT id FROM skus WHERE sku_code = $1', [data.sku_code]);
        if (skuResult.rows.length === 0) {
          errors.push({ field: 'sku_code', message: `SKU code '${data.sku_code}' does not exist` });
        }
      }
      if (data.supplier_name) {
        const supResult = await query('SELECT id FROM suppliers WHERE name = $1', [data.supplier_name]);
        if (supResult.rows.length === 0) {
          errors.push({ field: 'supplier_name', message: `Supplier name '${data.supplier_name}' does not exist` });
        }
      }
      break;
    }
  }
  return errors;
}

export async function commitImport(importSessionId, userId, requestingUser = null) {
  const session = await query(
    "SELECT * FROM import_sessions WHERE id = $1 AND status = 'validated'",
    [importSessionId]
  );
  if (session.rows.length === 0) throw Errors.notFound('Import session');

  const importSession = session.rows[0];

  // Verify the import session belongs to the calling user (or caller is admin)
  if (requestingUser) {
    const isAdmin = requestingUser.permissions && requestingUser.permissions.some(p => p === 'admin.*');
    if (!isAdmin && importSession.user_id !== requestingUser.id) {
      throw Errors.forbidden('You can only commit your own import sessions');
    }
  }
  const validRows = typeof importSession.valid_rows === 'string'
    ? JSON.parse(importSession.valid_rows) : importSession.valid_rows;

  if (validRows.length === 0) throw Errors.validation('No valid rows to import');

  let imported = 0;
  const commitErrors = [];

  await transaction(async (client) => {
    for (const row of validRows) {
      try {
        await commitRow(client, importSession.type, row.data);
        imported++;
      } catch (err) {
        commitErrors.push({
          row: row.row,
          data: row.data,
          error: err.message || 'Unknown commit error',
        });
      }
    }

    await client.query(
      "UPDATE import_sessions SET status = 'committed' WHERE id = $1",
      [importSessionId]
    );
  });

  await logAudit(userId, 'import_committed', 'import_session', importSessionId,
    { type: importSession.type, imported, skipped: commitErrors.length }, null);

  return { imported_count: imported, skipped_count: commitErrors.length, commit_errors: commitErrors };
}

async function commitRow(client, type, data) {
  switch (type) {
    case 'spu': {
      const catResult = await client.query('SELECT id FROM categories WHERE slug = $1', [data.category_slug]);
      if (catResult.rows.length === 0) throw new Error('Category not found');
      const spuResult = await client.query(
        `INSERT INTO spus (name, description, category_id, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        [data.name, data.description || '', catResult.rows[0].id, data.status || 'draft']
      );
      const spuId = spuResult.rows[0].id;

      // Persist image URLs
      if (data.image_urls) {
        const urls = data.image_urls.split('|').map(u => u.trim()).filter(Boolean);
        for (let i = 0; i < urls.length; i++) {
          await client.query(
            'INSERT INTO spu_images (spu_id, image_url, sort_order, is_primary) VALUES ($1, $2, $3, $4)',
            [spuId, urls[i], i, i === 0]
          );
        }
      }

      // Persist spec attributes
      if (data.spec_attributes) {
        const specs = JSON.parse(data.spec_attributes);
        for (const spec of specs) {
          await client.query(
            'INSERT INTO spec_attributes (spu_id, name, values) VALUES ($1, $2, $3)',
            [spuId, spec.name, JSON.stringify(spec.values)]
          );
        }
      }
      break;
    }
    case 'sku': {
      const spuResult = await client.query('SELECT id FROM spus WHERE name = $1', [data.spu_name]);
      if (spuResult.rows.length === 0) throw new Error('SPU not found');
      await client.query(
        `INSERT INTO skus (spu_id, sku_code, spec_combination, status) VALUES ($1, $2, $3, $4)
         ON CONFLICT (sku_code) DO NOTHING`,
        [spuResult.rows[0].id, data.sku_code, data.spec_combination, data.status || 'draft']
      );
      break;
    }
    case 'inventory': {
      const skuResult = await client.query('SELECT id FROM skus WHERE sku_code = $1', [data.sku_code]);
      if (skuResult.rows.length === 0) throw new Error('SKU not found');
      const whResult = await client.query('SELECT id FROM warehouses WHERE code = $1', [data.warehouse_code]);
      if (whResult.rows.length === 0) throw new Error('Warehouse not found');
      const lotNumber = data.lot_number || null;
      const skuId = skuResult.rows[0].id;
      const warehouseId = whResult.rows[0].id;
      const qty = parseInt(data.available_qty);
      const warn = parseInt(data.threshold_warning) || 15;
      const crit = parseInt(data.threshold_critical) || 5;

      if (lotNumber === null) {
        // Null lot: use advisory lock to prevent duplicates
        const lockKey = Buffer.from(skuId + warehouseId).reduce((h, b) => (h * 31 + b) & 0x7fffffff, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
        const existing = await client.query(
          'SELECT id FROM inventory WHERE sku_id = $1 AND warehouse_id = $2 AND lot_number IS NULL',
          [skuId, warehouseId]
        );
        if (existing.rows.length > 0) {
          await client.query(
            'UPDATE inventory SET available_qty = $1, threshold_warning = $2, threshold_critical = $3, updated_at = NOW() WHERE id = $4',
            [qty, warn, crit, existing.rows[0].id]
          );
        } else {
          await client.query(
            'INSERT INTO inventory (sku_id, warehouse_id, lot_number, available_qty, threshold_warning, threshold_critical) VALUES ($1, $2, NULL, $3, $4, $5)',
            [skuId, warehouseId, qty, warn, crit]
          );
        }
      } else {
        await client.query(
          `INSERT INTO inventory (sku_id, warehouse_id, lot_number, available_qty, threshold_warning, threshold_critical)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (sku_id, warehouse_id, lot_number) DO UPDATE SET available_qty = $4, threshold_warning = $5, threshold_critical = $6, updated_at = NOW()`,
          [skuId, warehouseId, lotNumber, qty, warn, crit]
        );
      }
      break;
    }
    case 'supplier-pricing': {
      const skuResult = await client.query('SELECT id FROM skus WHERE sku_code = $1', [data.sku_code]);
      if (skuResult.rows.length === 0) throw new Error('SKU not found');
      const supResult = await client.query('SELECT id FROM suppliers WHERE name = $1', [data.supplier_name]);
      if (supResult.rows.length === 0) throw new Error('Supplier not found');
      await client.query(
        `INSERT INTO sku_suppliers (sku_id, supplier_id, unit_price, moq, pack_size, is_preferred, is_taxable)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (sku_id, supplier_id)
         DO UPDATE SET unit_price = $3, moq = $4, pack_size = $5, is_preferred = $6, is_taxable = $7, updated_at = NOW()`,
        [skuResult.rows[0].id, supResult.rows[0].id, parseFloat(data.unit_price),
         parseInt(data.moq), parseInt(data.pack_size),
         data.is_preferred === 'true', data.is_taxable === 'true']
      );
      break;
    }
  }
}

export async function exportData(type, filters = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');

  const template = TEMPLATES[type];
  if (!template) throw Errors.validation(`Unknown export type: ${type}`);

  sheet.columns = template.columns.map(col => ({
    header: col.header, key: col.key, width: 25,
  }));

  let rows = [];
  switch (type) {
    case 'spu': {
      const result = await query(
        `SELECT s.id, s.name, s.description, c.slug as category_slug, s.status,
         array_to_string(array_agg(DISTINCT t.slug), ',') as tags
         FROM spus s LEFT JOIN categories c ON c.id = s.category_id
         LEFT JOIN spu_tags st ON st.spu_id = s.id LEFT JOIN tags t ON t.id = st.tag_id
         GROUP BY s.id, c.slug ORDER BY s.name`
      );
      // Fetch images and spec_attributes per SPU
      for (const row of result.rows) {
        const imgResult = await query(
          'SELECT image_url FROM spu_images WHERE spu_id = $1 ORDER BY sort_order', [row.id]
        );
        row.image_urls = imgResult.rows.map(r => r.image_url).join('|');

        const specResult = await query(
          'SELECT name, values FROM spec_attributes WHERE spu_id = $1', [row.id]
        );
        row.spec_attributes = specResult.rows.length > 0
          ? JSON.stringify(specResult.rows.map(r => ({
              name: r.name,
              values: typeof r.values === 'string' ? JSON.parse(r.values) : r.values,
            })))
          : '';
        delete row.id;
      }
      rows = result.rows;
      break;
    }
    case 'sku': {
      const result = await query(
        `SELECT s.name as spu_name, sk.sku_code, sk.spec_combination, sk.status
         FROM skus sk JOIN spus s ON s.id = sk.spu_id
         ORDER BY s.name, sk.sku_code`
      );
      rows = result.rows.map(r => ({
        ...r,
        spec_combination: typeof r.spec_combination === 'object' ? JSON.stringify(r.spec_combination) : r.spec_combination,
      }));
      break;
    }
    case 'inventory': {
      const result = await query(
        `SELECT sk.sku_code, w.code as warehouse_code, i.lot_number,
         i.available_qty, i.threshold_warning, i.threshold_critical
         FROM inventory i JOIN skus sk ON sk.id = i.sku_id JOIN warehouses w ON w.id = i.warehouse_id`
      );
      rows = result.rows;
      break;
    }
    case 'supplier-pricing': {
      const result = await query(
        `SELECT sk.sku_code, sup.name as supplier_name, ss.unit_price, ss.moq,
         ss.pack_size, ss.is_preferred, ss.is_taxable
         FROM sku_suppliers ss
         JOIN skus sk ON sk.id = ss.sku_id
         JOIN suppliers sup ON sup.id = ss.supplier_id
         ORDER BY sup.name, sk.sku_code`
      );
      rows = result.rows.map(r => ({
        ...r,
        is_preferred: r.is_preferred ? 'true' : 'false',
        is_taxable: r.is_taxable ? 'true' : 'false',
      }));
      break;
    }
  }

  for (const row of rows) {
    sheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
}
