export class AppError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const Errors = {
  authRequired: () => new AppError('AUTH_REQUIRED', 'Authentication required', 401),
  authInvalid: () => new AppError('AUTH_INVALID', 'Invalid credentials', 401),
  authLocked: (until) => new AppError('AUTH_LOCKED', 'Account locked', 423, { locked_until: until }),
  forbidden: (msg) => new AppError('FORBIDDEN', msg || 'Insufficient permissions', 403),
  scopeDenied: () => new AppError('SCOPE_DENIED', 'Data scope violation', 403),
  notFound: (entity) => new AppError('NOT_FOUND', `${entity || 'Resource'} not found`, 404),
  conflict: (msg) => new AppError('CONFLICT', msg || 'Concurrency conflict', 409),
  duplicate: (msg) => new AppError('DUPLICATE', msg || 'Duplicate resource', 409),
  validation: (msg, details) => new AppError('VALIDATION', msg || 'Validation error', 400, details),
  driftDetected: (data) => new AppError('DRIFT_DETECTED', 'Price or inventory drift detected', 409, data),
  rateLimited: () => new AppError('RATE_LIMITED', 'Rate limit exceeded', 429),
  serverError: () => new AppError('SERVER_ERROR', 'Internal server error', 500),
};
