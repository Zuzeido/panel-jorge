import crypto from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || 'local-dev-secret-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
}

export function createSessionToken(user) {
  const payload = base64UrlEncode(
    JSON.stringify({
      ...user,
      exp: Date.now() + SESSION_TTL_MS
    })
  );

  return `${payload}.${sign(payload)}`;
}

export function readSessionFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.exp || session.exp < Date.now()) {
      return null;
    }

    return {
      username: session.username,
      name: session.name,
      role: session.role
    };
  } catch {
    return null;
  }
}
