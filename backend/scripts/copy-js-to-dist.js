/**
 * copy-js-to-dist.js
 *
 * Runs after `tsc --noCheck` as part of `npm run build`.
 *
 * Problem being solved:
 *   TypeScript (allowJs:true) compiles BOTH .ts and .js files to dist/.
 *   When a file exists as BOTH foo.ts and foo.js in src/, the compiled .ts
 *   version overwrites the .js copy in dist/. At runtime, require('./foo.js')
 *   then loads the wrong (TS-compiled) module instead of the original JS one.
 *
 * These files are excluded from tsc via tsconfig.json "exclude" and must
 * be copied here manually so they exist correctly in dist/:
 *
 *   src/controllers/auth.controller.js      → dist/controllers/auth.controller.js
 *   src/routes/auth.routes.js               → dist/routes/auth.routes.js
 *   src/routes/dashboard-agent.routes.js    → dist/routes/dashboard-agent.routes.js
 *   src/services/auth.service.js            → dist/services/auth.service.js
 *   src/docs/swagger.js                     → dist/docs/swagger.js
 *
 * Note: dashboard.routes.js was renamed to dashboard-agent.routes.js to avoid
 * collision with dashboard.routes.ts (both would compile to dashboard.routes.js).
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'controllers/auth.controller.js',
  'routes/auth.routes.js',
  'routes/dashboard-agent.routes.js',
  'services/auth.service.js',
  'docs/swagger.js',
];

let ok = 0;
let failed = 0;

for (const rel of FILES) {
  const src  = path.join(SRC, rel);
  const dest = path.join(DIST, rel);

  if (!fs.existsSync(src)) {
    console.error(`[copy-js] MISSING source: src/${rel}`);
    failed++;
    continue;
  }

  // Ensure destination directory exists
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  fs.copyFileSync(src, dest);
  console.log(`[copy-js] ✓  src/${rel}  →  dist/${rel}`);
  ok++;
}

console.log(`\n[copy-js] Done: ${ok} copied, ${failed} failed.\n`);

if (failed > 0) {
  process.exit(1);
}
