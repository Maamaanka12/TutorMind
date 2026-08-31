/**
 * INPUT VALIDATION HELPERS
 * Shared validation for all route handlers.
 * Prevents invalid/malicious input from reaching the database or AI.
 */

/**
 * Parse and validate an integer ID from request params or body.
 * Returns the parsed integer or null if invalid.
 */
export function parseId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 2147483647) return null;
  return parsed;
}

/**
 * Validate that a value is a non-empty string within a length limit.
 * Trims whitespace and truncates if needed.
 */
export function sanitizeString(value, maxLength = 5000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.substring(0, maxLength);
}

/**
 * Validate that a value is a safe integer within bounds.
 */
export function clampInt(value, min, max, defaultValue) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Validate that a value is one of the allowed options.
 */
export function oneOf(value, allowed, defaultValue) {
  if (allowed.includes(value)) return value;
  return defaultValue;
}

/**
 * Validate request body has required fields. Returns error message or null.
 */
export function requireFields(body, fields) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

/**
 * Middleware: validate that route param IDs are valid integers.
 * Usage: router.get('/:id', validateParamId('id'), handler)
 */
export function validateParamId(paramName) {
  return (req, res, next) => {
    const id = parseId(req.params[paramName]);
    if (id === null) {
      return res.status(400).json({ error: `Invalid ${paramName} parameter` });
    }
    req.params[paramName] = id;
    next();
  };
}

/**
 * Middleware: enforce rate limiting per student per endpoint.
 * Simple in-memory store. For production, use Redis-backed rate limiting.
 */
const rateLimitStore = new Map();

export function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = `${req.userId || req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    
    if (!entry || now - entry.start > windowMs) {
      rateLimitStore.set(key, { start: now, count: 1 });
      return next();
    }
    
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.start > 300000) rateLimitStore.delete(key);
  }
}, 300000).unref();
