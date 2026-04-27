import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const USERS_PATH = path.join(ROOT_DIR, 'config', 'users.json');
const SHOPIFY_PATH = path.join(ROOT_DIR, 'config', 'shopify.json');

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function parseJsonEnv(name) {
  const value = process.env[name];
  if (!value) {
    return null;
  }

  return JSON.parse(value);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

export async function readUsersConfig() {
  const envConfig = parseJsonEnv('APP_USERS_JSON');
  if (envConfig?.users) {
    return envConfig.users;
  }

  const fileConfig = await readJsonFile(USERS_PATH);
  return fileConfig?.users || [];
}

export async function readShopifyConfig() {
  const envConfig = parseJsonEnv('SHOPIFY_CONFIG_JSON') || {};
  const fileConfig = (await readJsonFile(SHOPIFY_PATH)) || {};

  return {
    ...fileConfig,
    ...envConfig,
    storeDomain:
      process.env.SHOPIFY_STORE_DOMAIN ?? envConfig.storeDomain ?? fileConfig.storeDomain ?? '',
    apiKey: process.env.SHOPIFY_API_KEY ?? envConfig.apiKey ?? fileConfig.apiKey ?? '',
    apiSecret:
      process.env.SHOPIFY_API_SECRET ?? envConfig.apiSecret ?? fileConfig.apiSecret ?? '',
    accessToken:
      process.env.SHOPIFY_ACCESS_TOKEN ?? envConfig.accessToken ?? fileConfig.accessToken ?? '',
    apiVersion:
      process.env.SHOPIFY_API_VERSION ??
      envConfig.apiVersion ??
      fileConfig.apiVersion ??
      '2025-10',
    locationId:
      process.env.SHOPIFY_LOCATION_ID ?? envConfig.locationId ?? fileConfig.locationId ?? '',
    useDemoDataWhenMissingCredentials: parseBoolean(
      process.env.SHOPIFY_USE_DEMO_DATA_WHEN_MISSING_CREDENTIALS,
      envConfig.useDemoDataWhenMissingCredentials ??
        fileConfig.useDemoDataWhenMissingCredentials ??
        true
    )
  };
}
