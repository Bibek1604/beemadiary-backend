/**
 * Reusable opt-in pagination utilities.
 *
 * Design goal: 100% backward compatibility. A list endpoint stays byte-identical
 * (returns its plain array) UNLESS the client opts in by sending ?page or ?limit.
 * When opted in, the array is wrapped in the standard pagination envelope used
 * across the API: { results, page, limit, total, totalPages, count }.
 *
 * CommonJS so it can be `require()`d from both .js and .ts route files.
 */

/**
 * Parse pagination params. Returns null when the client did NOT supply any
 * pagination params (so the caller keeps its original, non-paginated behaviour).
 * @param {Record<string, any>} query  Express req.query
 * @returns {{ page: number, limit: number } | null}
 */
const getPagination = (query) => {
  const q = query || {};
  const hasPage = q.page !== undefined && String(q.page).trim() !== '';
  const hasLimit = q.limit !== undefined && String(q.limit).trim() !== '';
  if (!hasPage && !hasLimit) return null;
  const page = Math.min(100000, Math.max(1, parseInt(String(q.page || '1'), 10) || 1)); // cap depth: bounds MongoDB skip
  const limit = Math.min(100, Math.max(1, parseInt(String(q.limit || '20'), 10) || 20));
  return { page, limit };
};

/**
 * Wrap an already-materialized array in the standard pagination envelope.
 * @param {Array<any>} items
 * @param {{ page: number, limit: number }} pg
 */
const paginateArray = (items, pg) => {
  const list = Array.isArray(items) ? items : [];
  const start = (pg.page - 1) * pg.limit;
  const results = list.slice(start, start + pg.limit);
  return {
    results,
    page: pg.page,
    limit: pg.limit,
    total: list.length,
    totalPages: Math.ceil(list.length / pg.limit) || 0,
    count: results.length,
  };
};

/**
 * Backward-compatible list payload: returns the plain array unless the request
 * opted into pagination via ?page/?limit, in which case it returns the paginated
 * envelope. Default behaviour is unchanged.
 * @param {{ query?: Record<string, any> }} req  Express request
 * @param {Array<any>} items
 */
const maybePaginate = (req, items) => {
  const pg = getPagination(req && req.query);
  return pg ? paginateArray(items, pg) : items;
};

module.exports = { getPagination, paginateArray, maybePaginate };
