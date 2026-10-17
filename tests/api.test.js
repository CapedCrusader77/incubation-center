const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createApp, migrate, seed } = require('../server');
let pool, server, base;
async function request(path, method='GET', body) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgresql://root@127.0.0.1:26257/incubation_test?sslmode=disable' });
  await migrate(pool); await seed(pool);
  server = createApp(pool).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (pool) await pool.end(); });
test('dashboard and startup listing come from database', async () => {
  const result = await request('/api/dashboard'); assert.equal(result.status, 200); assert.ok(result.data.counts.startups >= 3);
  const listed = await request('/api/startups'); assert.ok(listed.data.some(s => s.name === 'Aarogya AI'));
});
test('startup and founder membership persist with constraints', async () => {
  const name = `Test Venture ${Date.now()}`;
  const created = await request('/api/startups', 'POST', { name, domain: 'FinTech', description: 'Test', stage: 'ideation', founded_on: '2025-01-01' });
  assert.equal(created.status, 201); assert.equal(created.data.name, name);
  const person = await request('/api/people', 'POST', { name: 'Test Founder', email: `founder${Date.now()}@example.org`, affiliation: 'Student' });
  assert.equal(person.status, 201);
  const membership = await request('/api/founders', 'POST', { startup_id: created.data.id, person_id: person.data.id, role: 'Co-founder' });
  assert.equal(membership.status, 201);
  const detail = await request(`/api/startups/${created.data.id}`);
  assert.ok(detail.data.founders.some(f => f.name === 'Test Founder'));
  const duplicate = await request('/api/founders', 'POST', { startup_id: created.data.id, person_id: person.data.id, role: 'Co-founder' });
  assert.equal(duplicate.status, 409);
  const invalid = await request('/api/startups', 'POST', { name: 'Bad Stage', domain: 'AI', stage: 'unknown' });
  assert.equal(invalid.status, 400);
});
test('funding and evaluations change reports', async () => {
  const startups = await request('/api/startups'); const id = startups.data[0].id;
  const investors = await request('/api/investors'); const investor = investors.data[0].id;
  const beforeReport = await request('/api/reports');
  const previous = Number(beforeReport.data.funding.find(x => x.id === id)?.total || 0);
  const investment = await request('/api/investments', 'POST', { startup_id: id, investor_id: investor, amount: 12345, round_name: 'Seed', invested_on: '2025-09-01' });
  assert.equal(investment.status, 201);
  const report = await request('/api/reports');
  assert.equal(Number(report.data.funding.find(x => x.id === id).total), previous + 12345);
  const mentors = await request('/api/mentors');
  const evaluation = await request('/api/evaluations', 'POST', { startup_id: id, mentor_id: mentors.data[0].id, metric: 'Market traction', score: 8, notes: 'Promising', evaluated_on: '2025-09-02' });
  assert.equal(evaluation.status, 201);
  const bad = await request('/api/evaluations', 'POST', { startup_id: id, mentor_id: mentors.data[0].id, metric: 'Test', score: 11, evaluated_on: '2025-09-02' });
  assert.equal(bad.status, 400);
});
