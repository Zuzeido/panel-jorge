import express from 'express';
import cors from 'cors';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStoreData, updateInventory, updateProduct } from './shopify.js';
import { createSessionToken, readSessionFromRequest } from './auth.js';
import { readUsersConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_PATH = path.join(ROOT_DIR, 'dist');
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 8765;
const IS_SERVERLESS = Boolean(process.env.VERCEL);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

if (!IS_SERVERLESS && fsSync.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH));
}

async function readUsers() {
  return readUsersConfig();
}

function requireAuth(req, res, next) {
  const session = readSessionFromRequest(req);

  if (!session) {
    return res.status(401).json({ error: 'Sesion no valida.' });
  }

  req.session = session;
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = await readUsers();
  const user = users.find(
    (candidate) => candidate.username === username && candidate.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
  }

  const safeUser = {
    username: user.username,
    name: user.name,
    role: user.role
  };

  const token = createSessionToken(safeUser);
  return res.json({ token, user: safeUser });
});

app.get('/api/auth/session', requireAuth, (req, res) => {
  res.json({ user: req.session });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, async (_req, res) => {
  try {
    const data = await getStoreData();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/products/:productId', requireAuth, async (req, res) => {
  try {
    const result = await updateProduct(req.params.productId, req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/inventory', requireAuth, async (req, res) => {
  try {
    const result = await updateInventory(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

if (!IS_SERVERLESS && fsSync.existsSync(DIST_PATH)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
}

if (!IS_SERVERLESS) {
  app.listen(PORT, HOST, () => {
    console.log(`Shopify CRM server listening on http://${HOST}:${PORT}`);
  });
}

export default app;
