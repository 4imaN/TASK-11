import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { AppError } from './utils/errors.js';
import { releaseExpiredHolds } from './services/holds.js';
import { processIngestionJobs } from './services/integration.js';
import { recomputeWorkerMetrics } from './services/tasks.js';
import { query } from './db/pool.js';

import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import supplierRoutes from './routes/supplier.js';
import inventoryRoutes from './routes/inventory.js';
import cartRoutes from './routes/cart.js';
import holdsRoutes from './routes/holds.js';
import taskRoutes from './routes/tasks.js';
import outcomesRoutes from './routes/outcomes.js';
import integrationRoutes from './routes/integration.js';
import excelRoutes from './routes/excel.js';
import configRoutes from './routes/config.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Plugins
await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS || 'http://localhost:5175').split(',')
    : true,
  credentials: true,
});

await fastify.register(cookie, {
  secret: process.env.SESSION_SECRET || 'dev-secret',
});

await fastify.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error.validation) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION',
        message: 'Validation error',
        details: error.validation,
      },
    });
    return;
  }

  if (error.code === '23503') {
    // FK violation
    reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION', message: 'Referenced resource does not exist', details: error.detail },
    });
    return;
  }
  if (error.code === '23505') {
    // Unique violation
    reply.status(409).send({
      success: false,
      error: { code: 'DUPLICATE', message: 'Resource already exists', details: error.detail },
    });
    return;
  }
  if (error.code === '23514') {
    // Check constraint violation
    reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION', message: 'Constraint violation', details: error.detail },
    });
    return;
  }

  fastify.log.error(error);
  reply.status(500).send({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'Internal server error',
    },
  });
});

// Routes
await fastify.register(authRoutes);
await fastify.register(catalogRoutes);
await fastify.register(supplierRoutes);
await fastify.register(inventoryRoutes);
await fastify.register(cartRoutes);
await fastify.register(holdsRoutes);
await fastify.register(taskRoutes);
await fastify.register(outcomesRoutes);
await fastify.register(integrationRoutes);
await fastify.register(excelRoutes);
await fastify.register(configRoutes);

// Health check
fastify.get('/api/health', async () => {
  try {
    await query('SELECT 1');
    return { success: true, data: { status: 'ok', timestamp: new Date().toISOString() } };
  } catch {
    return { success: false, data: { status: 'degraded', timestamp: new Date().toISOString() } };
  }
});

// Background jobs
let holdCleanupInterval;
let ingestionInterval;
let metricsInterval;
let sessionCleanupInterval;

function startBackgroundJobs() {
  // Release expired holds every 60 seconds
  holdCleanupInterval = setInterval(async () => {
    try {
      await releaseExpiredHolds();
    } catch (err) {
      fastify.log.error('Hold cleanup error:', err.message);
    }
  }, 60 * 1000);

  // Process ingestion jobs every 30 seconds
  ingestionInterval = setInterval(async () => {
    try {
      await processIngestionJobs();
    } catch (err) {
      fastify.log.error('Ingestion processing error:', err.message);
    }
  }, 30 * 1000);

  // Recompute worker metrics every 5 minutes
  metricsInterval = setInterval(async () => {
    try {
      await recomputeWorkerMetrics();
    } catch (err) {
      fastify.log.error('Metrics recompute error:', err.message);
    }
  }, 5 * 60 * 1000);

  // Clean expired sessions every 15 minutes
  sessionCleanupInterval = setInterval(async () => {
    try {
      await query('DELETE FROM sessions WHERE expires_at < NOW()');
    } catch (err) {
      fastify.log.error('Session cleanup error:', err.message);
    }
  }, 15 * 60 * 1000);

  fastify.log.info('Background jobs started');
}

// Production secret validation — fail-fast on insecure configuration
if (process.env.NODE_ENV === 'production') {
  const sessionSecret = process.env.SESSION_SECRET || '';
  if (!sessionSecret || sessionSecret.includes('dev') || sessionSecret.includes('change') || sessionSecret.length < 32) {
    console.error('FATAL: SESSION_SECRET must be a strong secret (32+ chars) in production');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('FATAL: ENCRYPTION_KEY must be set in production');
    process.exit(1);
  }
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    console.error('FATAL: ENCRYPTION_KEY must be at least 32 characters');
    process.exit(1);
  }
}

// Start
const port = parseInt(process.env.PORT || '3000');
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  startBackgroundJobs();
  fastify.log.info(`PetMed Backend running on ${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async () => {
  clearInterval(holdCleanupInterval);
  clearInterval(ingestionInterval);
  clearInterval(metricsInterval);
  clearInterval(sessionCleanupInterval);
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
