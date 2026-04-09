import { authenticate, requirePermission } from '../middleware/auth.js';
import * as integrationService from '../services/integration.js';

export default async function integrationRoutes(fastify) {
  // Public integration endpoint (token auth, not session auth)
  fastify.post('/api/integration/ingest', async (request, reply) => {
    const tokenValue = request.headers['x-api-token'];
    const signature = request.headers['x-request-signature'];
    const timestamp = request.headers['x-timestamp'];

    if (!tokenValue || !signature || !timestamp) {
      reply.code(401);
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Missing integration auth headers' } };
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      reply.code(401);
      return { success: false, error: { code: 'AUTH_INVALID', message: 'Invalid timestamp format' } };
    }
    const tsAge = Math.abs(Date.now() - tsNum);
    if (tsAge > 5 * 60 * 1000) {
      reply.code(401);
      return { success: false, error: { code: 'AUTH_INVALID', message: 'Timestamp too old' } };
    }

    const token = await integrationService.verifySignature(
      tokenValue, timestamp, request.body, signature
    );

    await integrationService.checkRateLimit(token.id, token.rate_limit);

    const job = await integrationService.createIngestionJob(token.id, request.body);

    reply.code(202);
    return { success: true, data: { job_id: job.id, status: 'accepted' } };
  });

  // Admin: token management
  fastify.get('/api/integration/tokens', {
    preHandler: [authenticate, requirePermission('integration.*')],
  }, async () => {
    const tokens = await integrationService.listIntegrationTokens();
    return { success: true, data: tokens };
  });

  fastify.post('/api/integration/tokens', {
    preHandler: [authenticate, requirePermission('integration.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const result = await integrationService.createIntegrationToken(request.body.name);
    reply.code(201);
    return { success: true, data: result };
  });

  // Admin: dead-letter management
  fastify.get('/api/integration/dead-letter', {
    preHandler: [authenticate, requirePermission('integration.*')],
  }, async (request) => {
    const jobs = await integrationService.listDeadLetterJobs(request.query);
    return { success: true, data: jobs };
  });

  fastify.post('/api/integration/dead-letter/:id/retry', {
    preHandler: [authenticate, requirePermission('integration.*')],
  }, async (request) => {
    const job = await integrationService.retryDeadLetterJob(request.params.id);
    return { success: true, data: job };
  });
}
