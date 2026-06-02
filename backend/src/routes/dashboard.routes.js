/**
 * dashboard.routes.js — STUB ONLY. DO NOT ADD ROUTES HERE.
 *
 * Why this file exists as a stub:
 *   Both dashboard.routes.ts AND dashboard.routes.js existed in src/.
 *   TypeScript (allowJs:true) compiled BOTH to dist/routes/dashboard.routes.js,
 *   with the compiled .ts overwriting the .js copy every build.
 *
 * Fix applied:
 *   - Real agent dashboard routes moved to → dashboard-agent.routes.js
 *   - app.ts now requires dashboard-agent.routes.js directly
 *   - After `npm run build`, tsc compiles dashboard.routes.ts here correctly
 *   - This stub file is ignored at runtime (app.ts does not require it)
 */
module.exports = require('./dashboard-agent.routes.js');
