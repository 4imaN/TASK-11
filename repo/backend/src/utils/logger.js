const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;

function formatLog(level, category, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...meta,
  });
}

export const logger = {
  error: (category, message, meta) => {
    if (currentLevel >= LOG_LEVELS.error) console.error(formatLog('error', category, message, meta));
  },
  warn: (category, message, meta) => {
    if (currentLevel >= LOG_LEVELS.warn) console.error(formatLog('warn', category, message, meta));
  },
  info: (category, message, meta) => {
    if (currentLevel >= LOG_LEVELS.info) console.log(formatLog('info', category, message, meta));
  },
  debug: (category, message, meta) => {
    if (currentLevel >= LOG_LEVELS.debug) console.log(formatLog('debug', category, message, meta));
  },
};
