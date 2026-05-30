const DEFAULT_MESSAGES = {
  success: 'Operation completed successfully',
  validation: 'Validation failed',
  unauthorized: 'Unauthorized access',
  forbidden: 'Permission denied',
  notFound: 'Resource not found',
  conflict: 'Resource already exists',
  internal: 'Something went wrong. Please try again later.',
  unavailable: 'Service temporarily unavailable. Please try again later.',
};

const TECHNICAL_PATTERNS = [
  /casterror/i,
  /bsonerror/i,
  /objectid/i,
  /cannot read (property|properties)/i,
  /cannot destructure/i,
  /undefined is not an object/i,
  /prisma/i,
  /mongoserver/i,
  /mongo/i,
  /econnrefused/i,
  /etimedout/i,
  /socket hang up/i,
];

const getFallbackMessage = (code = 500) => {
  if (code === 400 || code === 422) return DEFAULT_MESSAGES.validation;
  if (code === 401) return DEFAULT_MESSAGES.unauthorized;
  if (code === 403) return DEFAULT_MESSAGES.forbidden;
  if (code === 404) return DEFAULT_MESSAGES.notFound;
  if (code === 409) return DEFAULT_MESSAGES.conflict;
  if (code === 503) return DEFAULT_MESSAGES.unavailable;
  return DEFAULT_MESSAGES.internal;
};

const toSafeMessage = (value, code = 500) => {
  const fallback = getFallbackMessage(code);

  if (value === null || value === undefined) {
    return fallback;
  }

  const message = String(value).trim();
  if (!message) {
    return fallback;
  }

  if (code >= 500 || TECHNICAL_PATTERNS.some((pattern) => pattern.test(message))) {
    if (/duplicate|already exists|11000/i.test(message)) {
      return DEFAULT_MESSAGES.conflict;
    }
    if (/record not found|not found|no such document/i.test(message)) {
      return DEFAULT_MESSAGES.notFound;
    }
    if (/invalid.*id|objectid|casterror|bsonerror/i.test(message)) {
      return 'Invalid record identifier provided.';
    }
    if (/cannot read|cannot destructure|undefined/i.test(message)) {
      return 'Requested information could not be processed.';
    }
    if (/token|jwt/i.test(message)) {
      return DEFAULT_MESSAGES.unauthorized;
    }
    if (/file|upload/i.test(message)) {
      return 'File upload failed. Please try again.';
    }
    if (/database|mongo|connection|network|timeout/i.test(message)) {
      return DEFAULT_MESSAGES.unavailable;
    }
    return fallback;
  }

  return message;
};

const normalizeErrorItem = (item, code = 500) => {
  if (item === null || item === undefined) {
    return null;
  }

  if (item instanceof Error) {
    return { message: toSafeMessage(item.message, code) };
  }

  if (typeof item === 'string') {
    return { message: toSafeMessage(item, code) };
  }

  if (typeof item === 'object') {
    const field = item.field || item.path || item.name || item.key;
    const message = toSafeMessage(item.message || item.msg || item.error || item.detail || String(item), code);
    return field ? { field, message } : { message };
  }

  return { message: toSafeMessage(String(item), code) };
};

const normalizeErrors = (errors, code = 500) => {
  if (errors === null || errors === undefined || errors === '') {
    return undefined;
  }

  const list = Array.isArray(errors) ? errors : [errors];
  const normalized = list.map((item) => normalizeErrorItem(item, code)).filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
};

const createSuccessResponse = (message = DEFAULT_MESSAGES.success, data = {}, code = 200, extra = {}) => ({
  success: true,
  status: true,
  message: toSafeMessage(message, code),
  data: data === undefined ? {} : data,
  code,
  ...extra,
});

const createErrorResponse = (message = DEFAULT_MESSAGES.internal, errors = [], code = 500, extra = {}) => {
  const normalizedErrors = normalizeErrors(errors, code);

  return {
    success: false,
    status: false,
    message: toSafeMessage(message, code),
    ...(normalizedErrors ? { errors: normalizedErrors } : {}),
    code,
    ...extra,
  };
};

module.exports = {
  DEFAULT_MESSAGES,
  toSafeMessage,
  normalizeErrorItem,
  normalizeErrors,
  createSuccessResponse,
  createErrorResponse,
};