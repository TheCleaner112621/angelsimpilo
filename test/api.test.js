const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tempFile = path.join(os.tmpdir(), `maintenance-api-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.DATA_FILE = tempFile;
process.env.JWT_SECRET = 'test-secret';
process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
process.env.SEED_ADMIN_PASSWORD = 'Password123!';

const { createApp } = require('../src/app');
const { store } = require('../src/store');

async function withServer(fn) {
  store.reset({ users: [], assets: [], workOrders: [] });
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function api(baseUrl, method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function login(baseUrl) {
  const response = await api(baseUrl, 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'Password123!' });
  assert.equal(response.status, 200);
  return response.body.token;
}

test.after(() => {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
});

test('serves a health endpoint', async () => {
  await withServer(async (baseUrl) => {
    const response = await api(baseUrl, 'GET', '/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', service: 'angelsimpilo-maintenance-backend' });
  });
});

test('authenticates the seeded administrator', async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl);
    assert.equal(typeof token, 'string');
  });
});

test('creates users, assets, work orders, and comments', async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl);

    const technician = await api(baseUrl, 'POST', '/api/auth/register', {
      name: 'Tech User',
      email: 'tech@example.com',
      password: 'Password123!',
      role: 'technician'
    }, adminToken);
    assert.equal(technician.status, 201);

    const asset = await api(baseUrl, 'POST', '/api/assets', {
      name: 'Generator',
      tag: 'GEN-001',
      location: 'Clinic A',
      category: 'Power'
    }, adminToken);
    assert.equal(asset.status, 201);

    const workOrder = await api(baseUrl, 'POST', '/api/work-orders', {
      title: 'Generator inspection',
      description: 'Monthly service and safety inspection',
      location: 'Clinic A',
      priority: 'high',
      assetId: asset.body.asset.id,
      assigneeId: technician.body.user.id
    }, adminToken);
    assert.equal(workOrder.status, 201);
    assert.equal(workOrder.body.workOrder.status, 'assigned');

    const comment = await api(baseUrl, 'POST', `/api/work-orders/${workOrder.body.workOrder.id}/comments`, {
      body: 'Assigned for this week.'
    }, adminToken);
    assert.equal(comment.status, 201);
    assert.equal(comment.body.comment.body, 'Assigned for this week.');
  });
});

test('prevents unauthenticated access to protected resources', async () => {
  await withServer(async (baseUrl) => {
    const response = await api(baseUrl, 'GET', '/api/assets');
    assert.equal(response.status, 401);
  });
});
