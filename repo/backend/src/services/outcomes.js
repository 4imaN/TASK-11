import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { encrypt, decrypt, maskCertificateNumber, computeFileChecksum } from '../utils/crypto.js';
import { logAudit } from '../utils/audit.js';
import fs from 'fs/promises';
import path from 'path';

const EVIDENCE_PATH = process.env.EVIDENCE_STORAGE_PATH || './evidence-storage';

export function checkDuplicateWarnings(title, certNumber, existingOutcomes) {
  const warnings = [];
  const normalizedTitle = normalizeText(title);
  const normalizedCert = certNumber ? normalizeText(certNumber) : null;

  for (const existing of existingOutcomes) {
    const existingTitle = normalizeText(existing.title);
    if (existingTitle === normalizedTitle) {
      warnings.push({ field: 'title', match_type: 'exact', existing_id: existing.id, existing_title: existing.title });
    } else if (trigramSimilarity(normalizedTitle, existingTitle) > 0.6) {
      warnings.push({ field: 'title', match_type: 'near', existing_id: existing.id, existing_title: existing.title });
    }

    if (normalizedCert && existing.certificate_number_encrypted) {
      const existingCert = normalizeText(decrypt(existing.certificate_number_encrypted) || '');
      if (existingCert === normalizedCert) {
        warnings.push({ field: 'certificate_number', match_type: 'exact', existing_id: existing.id, existing_title: existing.title });
      } else if (trigramSimilarity(normalizedCert, existingCert) > 0.7) {
        warnings.push({ field: 'certificate_number', match_type: 'near', existing_id: existing.id, existing_title: existing.title });
      }
    }
  }

  return warnings;
}

export function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);
  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }
  return intersection / Math.max(trigramsA.size, trigramsB.size);
}

function getTrigrams(str) {
  const trigrams = new Set();
  const padded = `  ${str} `;
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.substring(i, i + 3));
  }
  return trigrams;
}

export function validateContributionShares(projects) {
  if (!projects || projects.length === 0) return { valid: true, total: 0 };
  const total = projects.reduce((sum, p) => sum + parseFloat(p.contribution_share || 0), 0);
  const rounded = Math.round(total * 100) / 100;
  return { valid: Math.abs(rounded - 100) <= 0.02, total: rounded };
}

export async function listOutcomes(filters = {}, departmentFilter = null) {
  const conditions = [];
  const params = [];
  let idx = 1;

  let sql = `SELECT o.id, o.type, o.title, o.description, o.status, o.created_by, o.created_at, o.updated_at FROM outcomes o`;

  if (departmentFilter) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM outcome_projects op
      JOIN projects p ON p.id = op.project_id
      WHERE op.outcome_id = o.id
      AND (p.department_id IS NULL OR NOT (p.department_id = ANY($${idx++})))
    )`);
    params.push(departmentFilter);
    conditions.push(`EXISTS (
      SELECT 1 FROM outcome_projects op2
      WHERE op2.outcome_id = o.id
    )`);
  }

  if (filters.type) { conditions.push(`o.type = $${idx++}`); params.push(filters.type); }
  if (filters.status) { conditions.push(`o.status = $${idx++}`); params.push(filters.status); }
  if (filters.search) { conditions.push(`o.title ILIKE $${idx++}`); params.push(`%${filters.search}%`); }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` ORDER BY o.updated_at DESC`;

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function getOutcome(id) {
  const outcomeResult = await query('SELECT * FROM outcomes WHERE id = $1', [id]);
  if (outcomeResult.rows.length === 0) throw Errors.notFound('Outcome');
  const outcome = outcomeResult.rows[0];

  outcome.certificate_number_display = outcome.certificate_number_encrypted
    ? maskCertificateNumber(decrypt(outcome.certificate_number_encrypted))
    : null;
  delete outcome.certificate_number_encrypted;

  const projects = await query(
    `SELECT op.*, p.name as project_name, p.department_id FROM outcome_projects op
     JOIN projects p ON p.id = op.project_id
     WHERE op.outcome_id = $1`,
    [id]
  );

  const evidence = await query(
    'SELECT id, file_name, file_size, mime_type, checksum_sha256, uploaded_by, created_at FROM evidence WHERE outcome_id = $1',
    [id]
  );

  return { ...outcome, projects: projects.rows, evidence: evidence.rows };
}

export async function createOutcome(data, userId) {
  return transaction(async (client) => {
    if (!data.projects || data.projects.length === 0) {
      throw Errors.validation('At least one project link is required');
    }

    const shareValidation = validateContributionShares(data.projects);
    if (!shareValidation.valid) {
      throw Errors.validation(`Contribution shares must sum to 100% (current: ${shareValidation.total}%)`);
    }

    const certEncrypted = data.certificate_number ? encrypt(data.certificate_number) : null;

    const existing = await client.query('SELECT id, title, certificate_number_encrypted FROM outcomes');
    const duplicateWarnings = checkDuplicateWarnings(data.title, data.certificate_number, existing.rows);

    const result = await client.query(
      `INSERT INTO outcomes (type, title, certificate_number_encrypted, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, type, title, description, status, created_at`,
      [data.type, data.title, certEncrypted, data.description, 'draft', userId]
    );
    const outcome = result.rows[0];

    {
      // Validate project_ids exist
      const projectIds = data.projects.map(p => p.project_id).filter(Boolean);
      if (projectIds.length > 0) {
        const validProjects = await client.query('SELECT id FROM projects WHERE id = ANY($1)', [projectIds]);
        const validIds = new Set(validProjects.rows.map(p => p.id));
        const invalid = projectIds.filter(id => !validIds.has(id));
        if (invalid.length > 0) {
          throw Errors.validation('Unknown project IDs', { invalid_ids: invalid });
        }
      }
      for (const proj of data.projects) {
        await client.query(
          'INSERT INTO outcome_projects (outcome_id, project_id, contribution_share) VALUES ($1, $2, $3)',
          [outcome.id, proj.project_id, proj.contribution_share]
        );
      }
    }

    await logAudit(userId, 'outcome_created', 'outcome', outcome.id, { title: data.title }, null);

    return { outcome, duplicate_warnings: duplicateWarnings };
  });
}

export async function updateOutcome(id, data, userId) {
  return transaction(async (client) => {
    const existing = await client.query('SELECT * FROM outcomes WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw Errors.notFound('Outcome');

    const certEncrypted = data.certificate_number !== undefined
      ? (data.certificate_number ? encrypt(data.certificate_number) : null)
      : existing.rows[0].certificate_number_encrypted;

    await client.query(
      `UPDATE outcomes SET title = COALESCE($1, title), description = COALESCE($2, description),
       type = COALESCE($3, type), certificate_number_encrypted = $4, updated_at = NOW()
       WHERE id = $5`,
      [data.title, data.description, data.type, certEncrypted, id]
    );

    if (data.projects) {
      if (data.projects.length === 0) {
        throw Errors.validation('At least one project link is required');
      }
      const shareValidation = validateContributionShares(data.projects);
      if (!shareValidation.valid) {
        throw Errors.validation(`Contribution shares must sum to 100% (current: ${shareValidation.total}%)`);
      }
      const projectIds = data.projects.map(p => p.project_id).filter(Boolean);
      if (projectIds.length > 0) {
        const validProjects = await client.query('SELECT id FROM projects WHERE id = ANY($1)', [projectIds]);
        const validIds = new Set(validProjects.rows.map(p => p.id));
        const invalid = projectIds.filter(id => !validIds.has(id));
        if (invalid.length > 0) {
          throw Errors.validation('Unknown project IDs', { invalid_ids: invalid });
        }
      }
      await client.query('DELETE FROM outcome_projects WHERE outcome_id = $1', [id]);
      for (const proj of data.projects) {
        await client.query(
          'INSERT INTO outcome_projects (outcome_id, project_id, contribution_share) VALUES ($1, $2, $3)',
          [id, proj.project_id, proj.contribution_share]
        );
      }
    }

    const allOutcomes = await client.query(
      'SELECT id, title, certificate_number_encrypted FROM outcomes WHERE id != $1', [id]
    );
    const duplicateWarnings = checkDuplicateWarnings(
      data.title || existing.rows[0].title,
      data.certificate_number,
      allOutcomes.rows
    );

    await logAudit(userId, 'outcome_updated', 'outcome', id, { title: data.title }, null);

    return { outcome: await getOutcome(id), duplicate_warnings: duplicateWarnings };
  });
}

/**
 * Strip encrypted-at-rest fields from an outcome row and add masked display version.
 * Ensures no API response leaks raw encrypted data.
 */
export function sanitizeOutcomeRow(row) {
  if (!row) return row;
  const sanitized = { ...row };
  if ('certificate_number_encrypted' in sanitized) {
    sanitized.certificate_number_display = sanitized.certificate_number_encrypted
      ? maskCertificateNumber(decrypt(sanitized.certificate_number_encrypted))
      : null;
    delete sanitized.certificate_number_encrypted;
  }
  return sanitized;
}

export async function updateOutcomeStatus(id, newStatus, userId) {
  if (newStatus === 'submitted' || newStatus === 'published') {
    const projects = await query(
      'SELECT contribution_share FROM outcome_projects WHERE outcome_id = $1', [id]
    );
    if (projects.rows.length === 0) {
      throw Errors.validation('Outcome must have at least one project link before being submitted or published');
    }
    const validation = validateContributionShares(projects.rows);
    if (!validation.valid) {
      throw Errors.validation(
        `Contribution shares must sum to 100% (current: ${validation.total}%)`,
        { total: validation.total }
      );
    }
  }

  const result = await query(
    'UPDATE outcomes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [newStatus, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('Outcome');

  await logAudit(userId, `outcome_${newStatus}`, 'outcome', id, {}, null);
  return sanitizeOutcomeRow(result.rows[0]);
}

export async function uploadEvidence(outcomeId, file, userId) {
  const outcome = await query('SELECT id FROM outcomes WHERE id = $1', [outcomeId]);
  if (outcome.rows.length === 0) throw Errors.notFound('Outcome');

  await fs.mkdir(EVIDENCE_PATH, { recursive: true });

  const checksum = computeFileChecksum(file.buffer);
  const safeName = `${Date.now()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = path.join(EVIDENCE_PATH, safeName);

  await fs.writeFile(storagePath, file.buffer);

  const encryptedPath = encrypt(storagePath);

  const result = await query(
    `INSERT INTO evidence (outcome_id, file_name, storage_path_encrypted, file_size, mime_type, checksum_sha256, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, file_name, file_size, mime_type, checksum_sha256, created_at`,
    [outcomeId, file.filename, encryptedPath, file.buffer.length, file.mimetype, checksum, userId]
  );

  await logAudit(userId, 'evidence_uploaded', 'evidence', result.rows[0].id, { outcome_id: outcomeId, file_name: file.filename }, null);

  return result.rows[0];
}

export async function downloadEvidence(evidenceId, userId) {
  const result = await query(
    'SELECT * FROM evidence WHERE id = $1',
    [evidenceId]
  );
  if (result.rows.length === 0) throw Errors.notFound('Evidence');

  const evidence = result.rows[0];
  const storagePath = decrypt(evidence.storage_path_encrypted);

  const fileBuffer = await fs.readFile(storagePath);
  const currentChecksum = computeFileChecksum(fileBuffer);

  if (currentChecksum !== evidence.checksum_sha256) {
    throw Errors.serverError('File integrity check failed — possible tampering detected');
  }

  await logAudit(userId, 'evidence_downloaded', 'evidence', evidenceId, {}, null);

  return {
    buffer: fileBuffer,
    filename: evidence.file_name,
    mimetype: evidence.mime_type,
  };
}

export async function getEvidenceWithOutcomeProjects(evidenceId) {
  const evidenceResult = await query(
    'SELECT outcome_id FROM evidence WHERE id = $1',
    [evidenceId]
  );
  if (evidenceResult.rows.length === 0) throw Errors.notFound('Evidence');

  const outcomeId = evidenceResult.rows[0].outcome_id;
  const projects = await query(
    `SELECT p.department_id FROM outcome_projects op
     JOIN projects p ON p.id = op.project_id
     WHERE op.outcome_id = $1`,
    [outcomeId]
  );

  return { outcome_id: outcomeId, projects: projects.rows };
}

export async function listProjects(filters = {}, departmentFilter = null) {
  let sql = 'SELECT * FROM projects';
  const conditions = [];
  const params = [];
  let idx = 1;

  if (departmentFilter) {
    conditions.push(`department_id = ANY($${idx++})`);
    params.push(departmentFilter);
  }
  if (filters.department_id) { conditions.push(`department_id = $${idx++}`); params.push(filters.department_id); }
  if (filters.search) { conditions.push(`name ILIKE $${idx++}`); params.push(`%${filters.search}%`); }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY name';

  const result = await query(sql, params);
  return result.rows;
}

export async function createProject(data) {
  const result = await query(
    'INSERT INTO projects (name, description, department_id) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.description, data.department_id]
  );
  return result.rows[0];
}
