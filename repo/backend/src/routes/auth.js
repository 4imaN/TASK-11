import { login, logout, createUser, listUsers, updateUser, getRoles } from '../services/auth.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;
    const ipAddress = request.ip;
    const result = await login(username, password, ipAddress);

    reply.setCookie('petmed_session', result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60,
    });

    return { success: true, data: { user: result.user } };
  });

  fastify.post('/api/auth/logout', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    await logout(request.user.sessionId);
    reply.clearCookie('petmed_session', { path: '/' });
    return { success: true, data: null };
  });

  fastify.get('/api/auth/me', {
    preHandler: [authenticate],
  }, async (request) => {
    return { success: true, data: { user: request.user } };
  });

  // User management
  fastify.get('/api/users', {
    preHandler: [authenticate, requirePermission('user.*')],
  }, async (request) => {
    const users = await listUsers({
      status: request.query.status,
      role: request.query.role,
      search: request.query.search,
      page: request.query.page,
      limit: request.query.limit,
    });
    return { success: true, data: users };
  });

  fastify.post('/api/users', {
    preHandler: [authenticate, requirePermission('user.*')],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'display_name'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 },
          display_name: { type: 'string', minLength: 1 },
          email: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          scopes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['warehouse', 'department', 'store'] },
                id: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = await createUser(request.body, request.user.id);
    reply.code(201);
    return { success: true, data: user };
  });

  fastify.put('/api/users/:id', {
    preHandler: [authenticate, requirePermission('user.*')],
  }, async (request) => {
    const user = await updateUser(request.params.id, request.body, request.user.id);
    return { success: true, data: user };
  });

  fastify.get('/api/roles', {
    preHandler: [authenticate, requirePermission('user.*')],
  }, async () => {
    const roles = await getRoles();
    return { success: true, data: roles };
  });
}
