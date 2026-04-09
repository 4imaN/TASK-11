import { authenticate, requirePermission } from '../middleware/auth.js';
import * as excelService from '../services/excel.js';

export default async function excelRoutes(fastify) {
  fastify.get('/api/import/templates/:type', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request, reply) => {
    const buffer = await excelService.generateTemplate(request.params.type);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${request.params.type}-template.xlsx"`);
    return reply.send(Buffer.from(buffer));
  });

  fastify.post('/api/import/:type', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const buffer = await file.toBuffer();
    const result = await excelService.validateImport(request.params.type, buffer, request.user.id);
    return { success: true, data: result };
  });

  fastify.post('/api/import/:type/commit', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['import_session_id'],
        properties: {
          import_session_id: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const result = await excelService.commitImport(request.body.import_session_id, request.user.id, request.user);
    return { success: true, data: result };
  });

  fastify.get('/api/export/:type', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request, reply) => {
    const buffer = await excelService.exportData(request.params.type, request.query);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${request.params.type}-export.xlsx"`);
    return reply.send(Buffer.from(buffer));
  });
}
