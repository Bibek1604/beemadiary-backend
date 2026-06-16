/**
 * Smoke tests for the API response utilities.
 * Pure functions only — no DB, network, or env required.
 */
const ApiResponse = require('../src/utils/apiResponse');
const {
  createSuccessResponse,
  createErrorResponse,
} = require('../src/utils/responseFormatter');

describe('ApiResponse envelope', () => {
  test('success() returns a well-formed success envelope', () => {
    const res = ApiResponse.success('Loaded', { id: 1 }, 200);
    expect(res.success).toBe(true);
    expect(res.status).toBe(true);
    expect(res.message).toBe('Loaded');
    expect(res.data).toEqual({ id: 1 });
    expect(res.code).toBe(200);
  });

  test('error() returns a well-formed error envelope', () => {
    const res = ApiResponse.error('Invalid input', ['name required'], 400);
    expect(res.success).toBe(false);
    expect(res.status).toBe(false);
    expect(res.code).toBe(400);
    expect(res.message).toBe('Invalid input');
  });
});

describe('responseFormatter safety', () => {
  test('does not leak technical 500 internals to clients', () => {
    const res = createErrorResponse(
      'PrismaClientKnownRequestError: connect ECONNREFUSED',
      [],
      500
    );
    expect(res.message.toLowerCase()).not.toContain('prisma');
    expect(res.message.toLowerCase()).not.toContain('econnrefused');
    expect(res.code).toBe(500);
  });

  test('preserves safe client-facing messages', () => {
    const res = createSuccessResponse('All good', {}, 200);
    expect(res.message).toBe('All good');
  });
});
