import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';

// ---- Categories ----

export async function listCategories(flat = false) {
  const result = await query(
    'SELECT id, name, slug, parent_id, sort_order, status FROM categories ORDER BY sort_order, name'
  );
  if (flat) return result.rows;
  return buildTree(result.rows);
}

function buildTree(categories, parentId = null) {
  return categories
    .filter(c => c.parent_id === parentId)
    .map(c => ({ ...c, children: buildTree(categories, c.id) }));
}

export async function createCategory(data) {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = await query(
    `INSERT INTO categories (name, slug, parent_id, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, slug, data.parent_id || null, data.sort_order || 0]
  );
  return result.rows[0];
}

export async function updateCategory(id, data) {
  const result = await query(
    `UPDATE categories SET name = COALESCE($1, name), sort_order = COALESCE($2, sort_order),
     status = COALESCE($3, status) WHERE id = $4 RETURNING *`,
    [data.name, data.sort_order, data.status, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('Category');
  return result.rows[0];
}

// ---- Tags ----

export async function listTags(search) {
  let sql = 'SELECT id, name, slug FROM tags';
  const params = [];
  if (search) {
    sql += ' WHERE name ILIKE $1';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY name';
  const result = await query(sql, params);
  return result.rows;
}

export async function createTag(data) {
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = await query(
    'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING *',
    [data.name, slug]
  );
  return result.rows[0];
}

// ---- SPU ----

export async function listSPUs(filters = {}) {
  let sql = `
    SELECT s.id, s.name, s.description, s.category_id, s.status, s.created_at, s.updated_at,
           c.name as category_name,
           (SELECT image_url FROM spu_images WHERE spu_id = s.id AND is_primary = true LIMIT 1) as primary_image,
           (SELECT COUNT(*) FROM skus WHERE spu_id = s.id) as sku_count,
           array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as tags
    FROM spus s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN spu_tags st ON st.spu_id = s.id
    LEFT JOIN tags t ON t.id = st.tag_id
  `;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.category_id) {
    conditions.push(`s.category_id = $${idx++}`);
    params.push(filters.category_id);
  }
  if (filters.published_only) {
    conditions.push(`s.status = 'published'`);
  } else if (filters.status) {
    conditions.push(`s.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`s.name ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }
  if (filters.tag) {
    conditions.push(`t.slug = $${idx++}`);
    params.push(filters.tag);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' GROUP BY s.id, c.name';
  sql += ' ORDER BY s.updated_at DESC';

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);

  const countSql = `SELECT COUNT(DISTINCT s.id) FROM spus s
    LEFT JOIN spu_tags st ON st.spu_id = s.id
    LEFT JOIN tags t ON t.id = st.tag_id
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}`;
  const countResult = await query(countSql, params.slice(0, -2));
  const total = parseInt(countResult.rows[0].count);

  return { items: result.rows, total, page, limit };
}

export async function getSPU(id, publishedOnly = false) {
  const spuResult = await query(
    `SELECT s.*, c.name as category_name FROM spus s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.id = $1`,
    [id]
  );
  if (spuResult.rows.length === 0) throw Errors.notFound('SPU');
  const spu = spuResult.rows[0];

  const [images, tags, specs, skus] = await Promise.all([
    query('SELECT * FROM spu_images WHERE spu_id = $1 ORDER BY sort_order', [id]),
    query('SELECT t.* FROM tags t JOIN spu_tags st ON st.tag_id = t.id WHERE st.spu_id = $1', [id]),
    query('SELECT * FROM spec_attributes WHERE spu_id = $1', [id]),
    publishedOnly
      ? query("SELECT * FROM skus WHERE spu_id = $1 AND status = 'published' ORDER BY sku_code", [id])
      : query('SELECT * FROM skus WHERE spu_id = $1 ORDER BY sku_code', [id]),
  ]);

  return {
    ...spu,
    images: images.rows,
    tags: tags.rows,
    spec_attributes: specs.rows,
    skus: skus.rows,
  };
}

export async function createSPU(data, userId) {
  return transaction(async (client) => {
    const spuResult = await client.query(
      `INSERT INTO spus (name, description, category_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.description, data.category_id, data.status || 'draft']
    );
    const spu = spuResult.rows[0];

    if (data.tags && data.tags.length > 0) {
      for (const tagId of data.tags) {
        await client.query('INSERT INTO spu_tags (spu_id, tag_id) VALUES ($1, $2)', [spu.id, tagId]);
      }
    }

    if (data.images && data.images.length > 0) {
      for (const img of data.images) {
        await client.query(
          'INSERT INTO spu_images (spu_id, image_url, sort_order, is_primary) VALUES ($1, $2, $3, $4)',
          [spu.id, img.image_url || img.url, img.sort_order || 0, img.is_primary || false]
        );
      }
    }

    if (data.spec_attributes && data.spec_attributes.length > 0) {
      for (const spec of data.spec_attributes) {
        await client.query(
          'INSERT INTO spec_attributes (spu_id, name, values) VALUES ($1, $2, $3)',
          [spu.id, spec.name, JSON.stringify(spec.values)]
        );
      }
    }

    await logAudit(userId, 'spu_created', 'spu', spu.id, { name: data.name }, null);
    return spu;
  });
}

export async function updateSPU(id, data, userId) {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE spus SET name = COALESCE($1, name), description = COALESCE($2, description),
       category_id = COALESCE($3, category_id), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [data.name, data.description, data.category_id, id]
    );
    if (result.rows.length === 0) throw Errors.notFound('SPU');

    if (data.tags) {
      await client.query('DELETE FROM spu_tags WHERE spu_id = $1', [id]);
      for (const tagId of data.tags) {
        await client.query('INSERT INTO spu_tags (spu_id, tag_id) VALUES ($1, $2)', [id, tagId]);
      }
    }

    if (data.images) {
      await client.query('DELETE FROM spu_images WHERE spu_id = $1', [id]);
      for (const img of data.images) {
        await client.query(
          'INSERT INTO spu_images (spu_id, image_url, sort_order, is_primary) VALUES ($1, $2, $3, $4)',
          [id, img.image_url || img.url, img.sort_order || 0, img.is_primary || false]
        );
      }
    }

    if (data.spec_attributes) {
      await client.query('DELETE FROM spec_attributes WHERE spu_id = $1', [id]);
      for (const spec of data.spec_attributes) {
        await client.query(
          'INSERT INTO spec_attributes (spu_id, name, values) VALUES ($1, $2, $3)',
          [id, spec.name, JSON.stringify(spec.values)]
        );
      }
    }

    await logAudit(userId, 'spu_updated', 'spu', id, { name: data.name }, null);
    return result.rows[0];
  });
}

export async function updateSPUStatus(id, status, userId) {
  const result = await query(
    'UPDATE spus SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('SPU');
  await logAudit(userId, `spu_${status}`, 'spu', id, { status }, null);
  return result.rows[0];
}

// ---- SKU ----

export async function listSKUs(spuId, publishedOnly = false) {
  const sql = publishedOnly
    ? "SELECT * FROM skus WHERE spu_id = $1 AND status = 'published' ORDER BY sku_code"
    : 'SELECT * FROM skus WHERE spu_id = $1 ORDER BY sku_code';
  const result = await query(sql, [spuId]);
  return result.rows;
}

export async function createSKU(spuId, data) {
  const existing = await query('SELECT id FROM skus WHERE sku_code = $1', [data.sku_code]);
  if (existing.rows.length > 0) throw Errors.duplicate('SKU code already exists');

  const result = await query(
    `INSERT INTO skus (spu_id, sku_code, spec_combination, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [spuId, data.sku_code, JSON.stringify(data.spec_combination || {}), data.status || 'draft']
  );
  return result.rows[0];
}

export async function updateSKU(id, data) {
  const result = await query(
    `UPDATE skus SET spec_combination = COALESCE($1, spec_combination),
     status = COALESCE($2, status), updated_at = NOW() WHERE id = $3 RETURNING *`,
    [data.spec_combination ? JSON.stringify(data.spec_combination) : null, data.status, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('SKU');
  return result.rows[0];
}

export async function updateSKUStatus(id, status) {
  const result = await query(
    'UPDATE skus SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('SKU');
  return result.rows[0];
}
