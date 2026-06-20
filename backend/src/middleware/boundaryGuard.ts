import { Request, Response, NextFunction } from 'express';
const { createErrorResponse } = require('../utils/responseFormatter');

/**
 * BOUNDARY VALUE GUARD (BVA) — GLOBAL-003 mitigation.
 *
 * Centralized, system-wide max-length constraints for name/title-like fields.
 * Oversized payloads (e.g. 500+ chars in a Name/Title) previously hit the
 * database directly and surfaced as "Database connection issue" crashes.
 *
 * This guard rejects them up-front with a clean, structured 400 validation
 * response (same shape the frontend already handles), so bad input never
 * reaches the data layer.
 *
 * Notes:
 *  - Per-endpoint validators may enforce STRICTER limits (e.g. company/policy
 *    name = 100). This is a backstop, not a replacement.
 *  - Limits are intentionally generous so no legitimate, frontend-validated
 *    input is rejected — only abusive/oversized payloads are blocked.
 */
export const FIELD_MAX_LENGTHS: Record<string, number> = {
  // Name / Title fields (primary BVA targets)
  name: 255,
  title: 255,
  plan_name: 255,
  full_name: 255,
  label: 255,
  // Identifier-style short text
  plan_no: 100,
  first_name: 100,
  last_name: 100,
  username: 150,
  agent_code: 100,
  lic_agent_code: 100,
  policy_number: 100,
  period_name: 150,
  reference_number: 150,
  transaction_id: 150,
  payment_method: 100,
  // Profile descriptors
  branch: 150,
  branch_division: 150,
  qualification: 150,
  position_designation: 150,
};

/**
 * Collect boundary (max-length) violations for the guarded fields present on an
 * object. Reusable from route handlers that parse the body AFTER this global
 * middleware runs (e.g. multipart/form-data routes behind multer).
 */
export const collectBoundaryErrors = (
  obj: unknown
): Array<{ field: string; message: string }> => {
  const errors: Array<{ field: string; message: string }> = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return errors;

  const body = obj as Record<string, unknown>;
  for (const [field, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    const value = body[field];
    if (typeof value === 'string' && value.length > max) {
      errors.push({ field, message: `${field} must not exceed ${max} characters` });
    }
  }
  return errors;
};

/**
 * Global Express middleware. Validates JSON request bodies up-front.
 * (Multipart bodies are parsed later by multer; those routes call
 * collectBoundaryErrors() inside the handler instead.)
 */
export const boundaryGuard = (req: Request, res: Response, next: NextFunction) => {
  const errors = collectBoundaryErrors((req as any).body);
  if (errors.length > 0) {
    return res.status(400).json(createErrorResponse('Validation failed', errors, 400));
  }
  return next();
};

export default boundaryGuard;
