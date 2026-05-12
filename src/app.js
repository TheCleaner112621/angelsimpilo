const http = require('node:http');
const crypto = require('node:crypto');
const { config } = require('./config');
const { ApiError, notFound } = require('./errors');
const { hashPassword, signToken, verifyPassword, verifyToken } = require('./security');
const { store } = require('./store');
const { parseAsset, parseComment, parseLogin, parseRegister, parseWorkOrder } = require('./validation');

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function send(res, statusCode, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function requireAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError(401, 'Authentication token is required');
  const payload = verifyToken(token);
  const user = store.users().find((candidate) => candidate.id === payload.sub);
  if (!user) throw new ApiError(401, 'Authentication token is invalid');
  req.user = user;
  return user;
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw new ApiError(403, 'You do not have permission to perform this action');
}

function match(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = pathParts[i];
    else if (patternParts[i] !== pathParts[i]) return null;
  }
  return params;
}

function assertReferences(assetId, assigneeId) {
  if (assetId && !store.assets().some((asset) => asset.id === assetId)) throw notFound('Asset');
  if (assigneeId && !store.users().some((user) => user.id === assigneeId)) throw notFound('Assignee');
}

function canView(workOrder, user) {
  return ['admin', 'manager'].includes(user.role) || workOrder.requesterId === user.id || workOrder.assigneeId === user.id;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 204);
  if (method === 'GET' && pathname === '/health') {
    return send(res, 200, { status: 'ok', service: 'angelsimpilo-maintenance-backend' });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const input = parseLogin(await readBody(req));
    const user = store.users().find((candidate) => candidate.email === input.email);
    if (!user || !verifyPassword(input.password, user.passwordHash)) throw new ApiError(401, 'Invalid email or password');
    return send(res, 200, { token: signToken(user), user: publicUser(user) });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    return send(res, 200, { user: publicUser(requireAuth(req)) });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    const actor = requireAuth(req);
    requireRole(actor, ['admin', 'manager']);
    const input = parseRegister(await readBody(req));
    if (input.role === 'admin' && actor.role !== 'admin') throw new ApiError(403, 'Only administrators can create administrator accounts');
    const users = store.users();
    if (users.some((user) => user.email === input.email)) throw new ApiError(409, 'A user with that email already exists');
    const now = new Date().toISOString();
    const user = { id: crypto.randomUUID(), name: input.name, email: input.email, passwordHash: hashPassword(input.password), role: input.role, createdAt: now, updatedAt: now };
    users.push(user);
    store.save();
    return send(res, 201, { user: publicUser(user) });
  }

  if (method === 'GET' && pathname === '/api/users') {
    const user = requireAuth(req);
    requireRole(user, ['admin', 'manager']);
    return send(res, 200, { users: store.users().map(publicUser) });
  }

  if (pathname === '/api/assets') {
    const user = requireAuth(req);
    if (method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const assets = store.assets().filter((asset) => !q || [asset.name, asset.tag, asset.location, asset.category, asset.serialNumber].filter(Boolean).some((value) => value.toLowerCase().includes(q)));
      return send(res, 200, { assets });
    }
    if (method === 'POST') {
      requireRole(user, ['admin', 'manager']);
      const input = parseAsset(await readBody(req));
      const assets = store.assets();
      if (assets.some((asset) => asset.tag.toLowerCase() === input.tag.toLowerCase())) throw new ApiError(409, 'An asset with that tag already exists');
      const now = new Date().toISOString();
      const asset = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
      assets.push(asset);
      store.save();
      return send(res, 201, { asset });
    }
  }

  let params = match(pathname, '/api/assets/:id');
  if (params) {
    const user = requireAuth(req);
    const assets = store.assets();
    const asset = assets.find((candidate) => candidate.id === params.id);
    if (!asset) throw notFound('Asset');
    if (method === 'GET') return send(res, 200, { asset });
    if (method === 'PATCH') {
      requireRole(user, ['admin', 'manager']);
      const input = parseAsset(await readBody(req), true);
      if (input.tag && assets.some((candidate) => candidate.id !== asset.id && candidate.tag.toLowerCase() === input.tag.toLowerCase())) throw new ApiError(409, 'An asset with that tag already exists');
      Object.assign(asset, input, { updatedAt: new Date().toISOString() });
      store.save();
      return send(res, 200, { asset });
    }
    if (method === 'DELETE') {
      requireRole(user, ['admin']);
      assets.splice(assets.indexOf(asset), 1);
      store.save();
      return send(res, 204);
    }
  }

  if (pathname === '/api/work-orders') {
    const user = requireAuth(req);
    if (method === 'GET') {
      const filters = ['status', 'priority', 'assigneeId', 'requesterId'];
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const workOrders = store.workOrders().filter((workOrder) => {
        if (!canView(workOrder, user)) return false;
        for (const filter of filters) if (url.searchParams.get(filter) && workOrder[filter] !== url.searchParams.get(filter)) return false;
        return !q || [workOrder.title, workOrder.description, workOrder.location].some((value) => value.toLowerCase().includes(q));
      });
      return send(res, 200, { workOrders });
    }
    if (method === 'POST') {
      const input = parseWorkOrder(await readBody(req));
      assertReferences(input.assetId, input.assigneeId);
      if (input.assigneeId && !['admin', 'manager'].includes(user.role)) throw new ApiError(403, 'Only administrators and managers can assign work orders on create');
      const now = new Date().toISOString();
      const workOrder = { id: crypto.randomUUID(), ...input, status: input.assigneeId ? 'assigned' : 'open', requesterId: user.id, comments: [], createdAt: now, updatedAt: now };
      store.workOrders().push(workOrder);
      store.save();
      return send(res, 201, { workOrder });
    }
  }

  params = match(pathname, '/api/work-orders/:id');
  if (params) {
    const user = requireAuth(req);
    const workOrders = store.workOrders();
    const workOrder = workOrders.find((candidate) => candidate.id === params.id);
    if (!workOrder || !canView(workOrder, user)) throw notFound('Work order');
    if (method === 'GET') return send(res, 200, { workOrder });
    if (method === 'PATCH') {
      const input = parseWorkOrder(await readBody(req), true);
      const privileged = ['admin', 'manager'].includes(user.role);
      const assignee = workOrder.assigneeId === user.id;
      if (!privileged && !assignee && (Object.keys(input).some((field) => field !== 'status') || input.status !== 'cancelled')) throw new ApiError(403, 'Requesters can only cancel their own work orders');
      if (!privileged && assignee && Object.keys(input).some((field) => !['status', 'description'].includes(field))) throw new ApiError(403, 'Technicians can only update status and notes');
      assertReferences(input.assetId, input.assigneeId);
      Object.assign(workOrder, input, {
        assetId: input.assetId === null ? undefined : input.assetId ?? workOrder.assetId,
        assigneeId: input.assigneeId === null ? undefined : input.assigneeId ?? workOrder.assigneeId,
        dueDate: input.dueDate === null ? undefined : input.dueDate ?? workOrder.dueDate,
        completedAt: input.status === 'completed' ? new Date().toISOString() : workOrder.completedAt,
        updatedAt: new Date().toISOString()
      });
      if (workOrder.assigneeId && workOrder.status === 'open') workOrder.status = 'assigned';
      store.save();
      return send(res, 200, { workOrder });
    }
    if (method === 'DELETE') {
      requireRole(user, ['admin', 'manager']);
      workOrders.splice(workOrders.indexOf(workOrder), 1);
      store.save();
      return send(res, 204);
    }
  }

  params = match(pathname, '/api/work-orders/:id/comments');
  if (params && method === 'POST') {
    const user = requireAuth(req);
    const workOrder = store.workOrders().find((candidate) => candidate.id === params.id);
    if (!workOrder || !canView(workOrder, user)) throw notFound('Work order');
    const input = parseComment(await readBody(req));
    const comment = { id: crypto.randomUUID(), authorId: user.id, body: input.body, createdAt: new Date().toISOString() };
    workOrder.comments.push(comment);
    workOrder.updatedAt = comment.createdAt;
    store.save();
    return send(res, 201, { comment });
  }

  throw new ApiError(404, 'Route was not found');
}

function createApp() {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (error instanceof SyntaxError) return send(res, 400, { error: 'Request body must be valid JSON' });
      if (error instanceof ApiError) return send(res, error.statusCode, { error: error.message, details: error.details });
      console.error(error);
      return send(res, 500, { error: 'Internal server error' });
    }
  });
}

module.exports = { createApp };
