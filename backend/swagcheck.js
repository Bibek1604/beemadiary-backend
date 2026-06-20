const swaggerJsdoc = require('swagger-jsdoc');
const spec = swaggerJsdoc({
  definition: { openapi:'3.0.0', info:{title:'t',version:'1'} },
  apis: ['src/routes/**/*.ts','src/routes/**/*.js'],
});
const paths = spec.paths || {};
let ops=0; for (const p of Object.keys(paths)) ops += Object.keys(paths[p]).length;
console.log('paths:', Object.keys(paths).length, '| operations:', ops);
