import { authenticate, requirePermission, getScopeFilter } from '../middleware/auth.js';
import * as outcomesService from '../services/outcomes.js';
import { query } from '../db/pool.js';
import { Errors } from '../utils/errors.js';

/**
 * Centralized department scope check for outcomes.
 * Policy: if user has department scopes, ALL linked project departments must be in scope.
 * Outcomes with no linked projects are denied to scoped users.
 */
function enforceOutcomeDepartmentScope(departmentFilter, linkedDepts) {
  if (!departmentFilter) return; // admins / unscoped users pass through
  // Deny if any linked project has null department
  if (linkedDepts.some(d => !d)) {
    throw Errors.scopeDenied();
  }
  if (linkedDepts.length === 0 || !linkedDepts.every(dId => departmentFilter.includes(dId))) {
    throw Errors.scopeDenied();
  }
}

export default async function outcomesRoutes(fastify) {
  fastify.get('/api/outcomes', {
    preHandler: [authenticate, requirePermission('outcomes.*')],
  }, async (request) => {
    const departmentFilter = getScopeFilter(request.user, 'department');
    const outcomes = await outcomesService.listOutcomes(request.query, departmentFilter);
    return { success: true, data: outcomes };
  });

  fastify.get('/api/outcomes/:id', {
    preHandler: [authenticate, requirePermission('outcomes.*')],
  }, async (request) => {
    const outcome = await outcomesService.getOutcome(request.params.id);
    const departmentFilter = getScopeFilter(request.user, 'department');
    enforceOutcomeDepartmentScope(departmentFilter, (outcome.projects || []).map(p => p.department_id));
    return { success: true, data: outcome };
  });

  fastify.post('/api/outcomes', {
    preHandler: [authenticate, requirePermission('outcomes.*')],
    schema: {
      body: {
        type: 'object',
        required: ['type', 'title', 'projects'],
        properties: {
          type: { type: 'string', enum: ['study', 'patent', 'award', 'copyright'] },
          title: { type: 'string', minLength: 1 },
          certificate_number: { type: 'string' },
          description: { type: 'string' },
          projects: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['project_id', 'contribution_share'],
              properties: {
                project_id: { type: 'string' },
                contribution_share: { type: 'number', minimum: 0.01, maximum: 100 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Verify department scope BEFORE creation
    const departmentFilter = getScopeFilter(request.user, 'department');
    if (departmentFilter) {
      if (!request.body.projects || request.body.projects.length === 0) {
        throw Errors.validation('Scoped users must link at least one project to an outcome');
      }
      const projectIds = request.body.projects.map(p => p.project_id).filter(Boolean);
      if (projectIds.length > 0) {
        const projectsResult = await query(
          'SELECT id, department_id FROM projects WHERE id = ANY($1)',
          [projectIds]
        );
        const nullDeptProjects = projectsResult.rows.filter(p => !p.department_id);
        if (nullDeptProjects.length > 0) {
          throw Errors.validation('All linked projects must have a department_id for scoped users');
        }
        const linkedDepts = projectsResult.rows.map(p => p.department_id);
        if (!linkedDepts.every(dId => departmentFilter.includes(dId))) {
          throw Errors.scopeDenied();
        }
      }
    }
    const result = await outcomesService.createOutcome(request.body, request.user.id);
    reply.code(201);
    return { success: true, data: result };
  });

  fastify.put('/api/outcomes/:id', {
    preHandler: [authenticate, requirePermission('outcomes.*')],
  }, async (request) => {
    const departmentFilter = getScopeFilter(request.user, 'department');
    // Check scope on existing linked projects
    const existing = await outcomesService.getOutcome(request.params.id);
    enforceOutcomeDepartmentScope(departmentFilter, (existing.projects || []).map(p => p.department_id));
    // Also validate incoming project links against scope
    if (departmentFilter && request.body.projects && request.body.projects.length > 0) {
      const incomingProjectIds = request.body.projects.map(p => p.project_id).filter(Boolean);
      if (incomingProjectIds.length > 0) {
        const projResult = await query(
          'SELECT id, department_id FROM projects WHERE id = ANY($1)',
          [incomingProjectIds]
        );
        const incomingDepts = projResult.rows.map(p => p.department_id);
        enforceOutcomeDepartmentScope(departmentFilter, incomingDepts);
        // Reject unknown project IDs
        const foundIds = new Set(projResult.rows.map(p => p.id));
        const missing = incomingProjectIds.filter(id => !foundIds.has(id));
        if (missing.length > 0) {
          throw Errors.validation('Unknown project IDs', { missing });
        }
      }
    }
    const result = await outcomesService.updateOutcome(request.params.id, request.body, request.user.id);
    return { success: true, data: result };
  });

  fastify.patch('/api/outcomes/:id/status', {
    preHandler: [authenticate, requirePermission('outcomes.*')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['draft', 'submitted', 'published'] },
        },
      },
    },
  }, async (request) => {
    const departmentFilter = getScopeFilter(request.user, 'department');
    const existing = await outcomesService.getOutcome(request.params.id);
    enforceOutcomeDepartmentScope(departmentFilter, (existing.projects || []).map(p => p.department_id));
    if ((request.body.status === 'submitted' || request.body.status === 'published') &&
        (!existing.projects || existing.projects.length === 0)) {
      throw Errors.validation('Outcome must have at least one project link before being submitted or published');
    }
    const outcome = await outcomesService.updateOutcomeStatus(
      request.params.id, request.body.status, request.user.id
    );
    return { success: true, data: outcome };
  });

  fastify.post('/api/outcomes/:id/evidence', {
    preHandler: [authenticate, requirePermission('evidence.*')],
  }, async (request, reply) => {
    // Check department scope before evidence upload
    const departmentFilter = getScopeFilter(request.user, 'department');
    const existing = await outcomesService.getOutcome(request.params.id);
    enforceOutcomeDepartmentScope(departmentFilter, (existing.projects || []).map(p => p.department_id));
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const buffer = await file.toBuffer();
    const evidence = await outcomesService.uploadEvidence(
      request.params.id,
      { buffer, filename: file.filename, mimetype: file.mimetype },
      request.user.id
    );
    return { success: true, data: evidence };
  });

  fastify.get('/api/evidence/:id/download', {
    preHandler: [authenticate, requirePermission('evidence.*')],
  }, async (request, reply) => {
    const departmentFilter = getScopeFilter(request.user, 'department');
    const evidenceOutcome = await outcomesService.getEvidenceWithOutcomeProjects(request.params.id);
    enforceOutcomeDepartmentScope(departmentFilter, (evidenceOutcome.projects || []).map(p => p.department_id));
    const file = await outcomesService.downloadEvidence(request.params.id, request.user.id);
    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    reply.header('Content-Type', file.mimetype || 'application/octet-stream');
    return reply.send(file.buffer);
  });

  // Projects
  fastify.get('/api/projects', {
    preHandler: [authenticate, requirePermission('projects.*')],
  }, async (request) => {
    const departmentFilter = getScopeFilter(request.user, 'department');
    const projects = await outcomesService.listProjects(request.query, departmentFilter);
    return { success: true, data: projects };
  });

  fastify.post('/api/projects', {
    preHandler: [authenticate, requirePermission('projects.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          department_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    // Enforce department scope on project creation
    const departmentFilter = getScopeFilter(request.user, 'department');
    if (departmentFilter) {
      if (!request.body.department_id) {
        throw Errors.validation('department_id is required for scoped users');
      }
      if (!departmentFilter.includes(request.body.department_id)) {
        throw Errors.scopeDenied();
      }
    }
    const project = await outcomesService.createProject(request.body);
    reply.code(201);
    return { success: true, data: project };
  });
}
