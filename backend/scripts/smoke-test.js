/**
 * End-to-end smoke test of the migrated MongoDB backend.
 *
 * Prerequisite: a MongoDB instance is reachable via .env (or MONGODB_URI).
 * Run with:  node scripts/smoke-test.js
 *
 * Exercises:
 *  1. /health
 *  2. POST /api/auth/login  (uses the seed agent: agent@test.com / Agent@123456)
 *  3. POST /api/client/enroll  (profile + policy + bank in one call)
 *  4. GET  /api/client/:id
 *  5. PUT  /api/client/:id
 *  6. POST /api/policy/bank-details
 *  7. GET  /api/client/search?query=John
 *  8. GET  /api/policies
 *  9. 404 path -> uses global error handler
 * 10. DELETE /api/client/:id
 */
require('dotenv/config');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function main() {
  console.log('=== Smoke Test: MongoDB Backend ===\n');

  const { prisma, MongoConnectionManager } = require('../src/config/db');
  await MongoConnectionManager.getInstance().connect();
  console.log('[connect] Mongo connection: OK');

  // Ensure a known agent exists for login
  const existing = await prisma.agent.findUnique({ where: { email: 'agent@test.com' } });
  let agentId;
  if (existing) {
    agentId = existing.id;
    console.log('[seed] agent exists:', agentId);
  } else {
    agentId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    await prisma.company.create({ data: { id: companyId, name: 'TestCo', email: `co-${Date.now()}@t.local`, phone_number: `+1${Date.now()}`, image: 'x', status: 'ACTIVE' } });
    const pwd = await bcrypt.hash('Agent@123456', 10);
    await prisma.agent.create({ data: { id: agentId, full_name: 'Test Agent', email: 'agent@test.com', phone_number: '9999999999', password_hash: pwd, status: 'ACTIVE', company_id: companyId } });
    console.log('[seed] agent created:', agentId);
  }

  const app = require('../src/app').default;
  console.log('[load] app loaded');

  // 1. Health
  let res = await request(app).get('/health');
  console.log('[1 ] /health:', res.statusCode, res.body.status);

  // 2. Login
  res = await request(app).post('/api/auth/login').send({ email: 'agent@test.com', password: 'Agent@123456' });
  console.log('[2 ] login:', res.statusCode, JSON.stringify(res.body).slice(0, 200));
  const token = res.body?.data?.tokens?.accessToken || res.body?.tokens?.accessToken || res.body?.accessToken;
  if (!token) {
    console.error('[2 ] FAILED to obtain access token; aborting');
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${token}` };

  // 3. Enroll client
  res = await request(app).post('/api/client/enroll').set(auth).send({
    full_name: 'John Doe',
    email: `john+${Date.now()}@example.com`,
    phone: String(Math.floor(9000000000 + Math.random() * 999999999)),
    address: '123 Main',
    plan_name: 'LIC Jeevan Anand',
    plan_no: '149',
    policy_term: '20 years',
    sum_assured: '500000',
    premium_amount: '10000',
    bank_name: 'HDFC',
    bank_account: '0123456789',
    bank_branch: 'Main Branch',
    premium_due_date: '2026-12-01',
    policy_status: 'ACTIVE',
  });
  console.log('[3 ] enroll:', res.statusCode, JSON.stringify(res.body).slice(0, 400));
  const clientUUID = res.body?.data?.client?.id;
  const policyId = res.body?.data?.policy?.id;

  // 4. Get client
  if (clientUUID) {
    res = await request(app).get(`/api/client/${clientUUID}`).set(auth);
    console.log('[4 ] get:', res.statusCode, JSON.stringify(res.body).slice(0, 200));

    // 5. Update
    res = await request(app).put(`/api/client/${clientUUID}`).set(auth).send({ address: '456 Updated' });
    console.log('[5 ] update:', res.statusCode, JSON.stringify(res.body).slice(0, 200));
  }

  // 6. Bank details
  if (policyId) {
    res = await request(app).post('/api/policy/bank-details').set(auth).send({
      policy_id: policyId,
      bank_name: 'SBI',
      bank_account: '9876543210',
      branch: 'Downtown',
      premium_due_date: '2027-01-01',
      premium_paid: 5000,
    });
    console.log('[6 ] bank-details:', res.statusCode, JSON.stringify(res.body).slice(0, 200));
  }

  // 7. Search
  res = await request(app).get('/api/client/search').set(auth).query({ query: 'John' });
  console.log('[7 ] search:', res.statusCode, JSON.stringify(res.body).slice(0, 200));

  // 8. Policies list
  res = await request(app).get('/api/policies').set(auth);
  console.log('[8 ] policies:', res.statusCode, JSON.stringify(res.body).slice(0, 200));

  // 9. 404 (tests global error handler)
  res = await request(app).get('/api/this/does/not/exist');
  console.log('[9 ] 404 path:', res.statusCode, JSON.stringify(res.body).slice(0, 200));

  // 10. Delete
  if (clientUUID) {
    res = await request(app).delete(`/api/client/${clientUUID}`).set(auth);
    console.log('[10] delete:', res.statusCode, JSON.stringify(res.body).slice(0, 200));
  }

  await MongoConnectionManager.getInstance().disconnect();
  console.log('\n=== Smoke Test Complete ===');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
