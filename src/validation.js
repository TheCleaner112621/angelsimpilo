const { ApiError } = require('./errors');

const roles = ['admin', 'manager', 'technician', 'requester'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled'];

function requireString(body, field, min = 1) {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new ApiError(422, 'Validation failed', { [field]: `Must be at least ${min} characters` });
  }
  return value.trim();
}

function optionalString(body, field) {
  return typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : undefined;
}

function email(value) {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function uuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function datetime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseRegister(body) {
  const name = requireString(body, 'name', 2);
  if (!email(body.email)) throw new ApiError(422, 'Validation failed', { email: 'Must be a valid email' });
  const password = requireString(body, 'password', 8);
  const role = body.role || 'requester';
  if (!roles.includes(role)) throw new ApiError(422, 'Validation failed', { role: `Must be one of ${roles.join(', ')}` });
  return { name, email: body.email.toLowerCase(), password, role };
}

function parseLogin(body) {
  if (!email(body.email)) throw new ApiError(422, 'Validation failed', { email: 'Must be a valid email' });
  return { email: body.email.toLowerCase(), password: requireString(body, 'password') };
}

function parseAsset(body, partial = false) {
  const output = {};
  for (const [field, min] of Object.entries({ name: 2, tag: 1, location: 2 })) {
    if (body[field] !== undefined || !partial) output[field] = requireString(body, field, min);
  }
  for (const field of ['category', 'serialNumber', 'notes']) {
    if (body[field] !== undefined) output[field] = optionalString(body, field);
  }
  return output;
}

function parseWorkOrder(body, partial = false) {
  const output = {};
  for (const [field, min] of Object.entries({ title: 3, description: 5, location: 2 })) {
    if (body[field] !== undefined || !partial) output[field] = requireString(body, field, min);
  }
  if (body.priority !== undefined || !partial) {
    output.priority = body.priority || 'medium';
    if (!priorities.includes(output.priority)) throw new ApiError(422, 'Validation failed', { priority: `Must be one of ${priorities.join(', ')}` });
  }
  if (body.status !== undefined) {
    if (!statuses.includes(body.status)) throw new ApiError(422, 'Validation failed', { status: `Must be one of ${statuses.join(', ')}` });
    output.status = body.status;
  }
  for (const field of ['assetId', 'assigneeId']) {
    if (body[field] !== undefined) {
      if (body[field] === null && partial) output[field] = null;
      else if (uuid(body[field])) output[field] = body[field];
      else throw new ApiError(422, 'Validation failed', { [field]: 'Must be a UUID' });
    }
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null && partial) output.dueDate = null;
    else if (datetime(body.dueDate)) output.dueDate = new Date(body.dueDate).toISOString();
    else throw new ApiError(422, 'Validation failed', { dueDate: 'Must be an ISO date' });
  }
  return output;
}

function parseComment(body) {
  const bodyText = requireString(body, 'body', 1);
  if (bodyText.length > 2000) throw new ApiError(422, 'Validation failed', { body: 'Must be 2000 characters or less' });
  return { body: bodyText };
}

module.exports = { parseRegister, parseLogin, parseAsset, parseWorkOrder, parseComment };
