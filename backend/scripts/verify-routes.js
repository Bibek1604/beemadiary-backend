require('dotenv/config');
const path = require('path');
require('ts-node/register/transpile-only');

const appModule = require(path.join(__dirname, '..', 'src', 'app'));
const app = appModule.default || appModule;

const router = app._router;
const routes = [];
function collect(stack, prefix) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase()).join(',');
      routes.push(methods + ' ' + prefix + (layer.route.path || ''));
    } else if (layer.handle && layer.handle.stack) {
      collect(layer.handle.stack, prefix);
    }
  }
}
collect(router.stack, '');
console.log('Total handlers:', routes.length);
console.log('\nEnrollment + Auth + Health routes:');
const filt = routes.filter(r => /client|policy|enroll|document|bank|auth|health/i.test(r));
filt.forEach(r => console.log('  ', r));
console.log('\nAll routes with :id params:');
routes.filter(r => r.includes(':')).forEach(r => console.log('  ', r));
