const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vercelHandler = require('../api/index');
const { getPool } = require('../server');

let server, base;

before(async () => {
  server = http.createServer((req, res) => {
    vercelHandler(req, res);
  });
  await new Promise(resolve => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  const pool = getPool();
  if (pool) await pool.end();
});

test('vercel serverless handler responds to /api/health', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.database);
});

test('vercel serverless handler responds to /api/dashboard', async () => {
  const res = await fetch(`${base}/api/dashboard`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.counts);
  assert.ok(data.stages);
  assert.ok(data.domains);
});

test('vercel serverless handler responds to /api/startups', async () => {
  const res = await fetch(`${base}/api/startups`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
});

test('unconfigured database returns 503 with error message instead of crashing', async () => {
  const { createApp } = require('../server');
  const dummyApp = createApp(null);
  const dummyServer = dummyApp.listen(0);
  await new Promise(r => dummyServer.once('listening', r));
  const dummyUrl = `http://localhost:${dummyServer.address().port}`;
  try {
    const res = await fetch(`${dummyUrl}/api/health`);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.database, 'unconfigured');

    const dashRes = await fetch(`${dummyUrl}/api/dashboard`);
    assert.equal(dashRes.status, 503);
    const dashData = await dashRes.json();
    assert.ok(dashData.error);
  } finally {
    await new Promise(r => dummyServer.close(r));
  }
});

