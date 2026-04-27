import { demoLocationId, demoOrders, demoProducts } from './demo-store.js';
import { readShopifyConfig } from './config.js';
const tokenCache = new Map();

function hasCredentials(config) {
  return Boolean(
    config.storeDomain && (config.accessToken || (config.apiKey && config.apiSecret))
  );
}

async function getAccessToken(config) {
  if (config.accessToken) {
    return config.accessToken;
  }

  const cacheKey = `${config.storeDomain}:${config.apiKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.apiKey,
      client_secret: config.apiSecret
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token error (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Shopify no devolvio access_token.');
  }

  if (!payload.scope) {
    throw new Error(
      'La app de Shopify no tiene scopes concedidos. Publica e instala permisos como read_products, read_orders y read_locations.'
    );
  }

  const expiresInSeconds = Number(payload.expires_in || 86399);
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000
  });

  return payload.access_token;
}

async function shopifyGraphQL(config, query, variables = {}) {
  const accessToken = await getAccessToken(config);
  const response = await fetch(
    `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({ query, variables })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error (${response.status}): ${text}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    const accessDenied = payload.errors.some(
      (error) => error.extensions?.code === 'ACCESS_DENIED'
    );

    if (accessDenied) {
      throw new Error(
        'Shopify denego acceso por scopes insuficientes. Reinstala o publica la app con read_products, read_orders y read_locations.'
      );
    }

    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  return payload.data;
}

function mapProduct(node) {
  return {
    id: node.id,
    title: node.title,
    productType: node.productType || 'Sin categoria',
    vendor: node.vendor || 'Sin proveedor',
    status: node.status,
    totalInventory: node.totalInventory ?? 0,
    updatedAt: node.updatedAt,
    tags: node.tags || [],
    imageUrl: node.featuredImage?.url || '',
    variants: (node.variants?.nodes || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku || 'Sin SKU',
      price: variant.price,
      inventoryQuantity: variant.inventoryQuantity ?? 0,
      inventoryItemId: variant.inventoryItem?.id || ''
    }))
  };
}

function mapOrder(node) {
  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    displayFulfillmentStatus: node.displayFulfillmentStatus,
    displayFinancialStatus: node.displayFinancialStatus,
    totalAmount: node.totalPriceSet?.shopMoney?.amount || '0.00',
    currencyCode: node.totalPriceSet?.shopMoney?.currencyCode || 'EUR',
    customerName: node.customer?.displayName || 'Cliente sin nombre',
    lineItems: (node.lineItems?.nodes || []).map((item) => ({
      title: item.title,
      quantity: item.quantity
    }))
  };
}

function buildCategories(products) {
  const map = new Map();

  for (const product of products) {
    const key = product.productType || 'Sin categoria';
    const current = map.get(key) || {
      id: key.toLowerCase().replace(/\s+/g, '-'),
      name: key,
      productsCount: 0,
      totalInventory: 0,
      statuses: new Set()
    };

    current.productsCount += 1;
    current.totalInventory += product.totalInventory || 0;
    current.statuses.add(product.status);
    map.set(key, current);
  }

  return Array.from(map.values()).map((category) => ({
    id: category.id,
    name: category.name,
    productsCount: category.productsCount,
    totalInventory: category.totalInventory,
    statuses: Array.from(category.statuses)
  }));
}

export async function getStoreData() {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    if (config.useDemoDataWhenMissingCredentials) {
      return {
        source: 'demo',
        locationId: config.locationId || demoLocationId,
        products: demoProducts,
        categories: buildCategories(demoProducts),
        orders: demoOrders
      };
    }

    throw new Error(
      'Faltan credenciales de Shopify en config/shopify.json. Usa accessToken o apiKey + apiSecret.'
    );
  }

  const data = await shopifyGraphQL(
    config,
    `
      query DashboardData {
        products(first: 100, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            productType
            vendor
            status
            totalInventory
            updatedAt
            tags
            featuredImage {
              url
            }
            variants(first: 20) {
              nodes {
                id
                title
                sku
                price
                inventoryQuantity
                inventoryItem {
                  id
                }
              }
            }
          }
        }
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFulfillmentStatus
            displayFinancialStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              displayName
            }
            lineItems(first: 5) {
              nodes {
                title
                quantity
              }
            }
          }
        }
        locations(first: 10) {
          nodes {
            id
          }
        }
      }
    `
  );

  const products = data.products.nodes.map(mapProduct);
  return {
    source: 'shopify',
    locationId: config.locationId || data.locations.nodes[0]?.id || '',
    products,
    categories: buildCategories(products),
    orders: data.orders.nodes.map(mapOrder)
  };
}

export async function updateProduct(productId, payload) {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    return {
      mode: 'demo',
      updated: {
        id: productId,
        ...payload
      }
    };
  }

  const data = await shopifyGraphQL(
    config,
    `
      mutation UpdateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            title
            productType
            status
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        id: productId,
        title: payload.title,
        productType: payload.productType,
        status: payload.status,
        tags: payload.tags || []
      }
    }
  );

  const result = data.productUpdate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(', '));
  }

  return {
    mode: 'shopify',
    updated: result.product
  };
}

export async function updateInventory(payload) {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    return {
      mode: 'demo',
      updated: payload
    };
  }

  const locationId = config.locationId || payload.locationId;
  if (!locationId) {
    throw new Error('No hay locationId configurado para actualizar stock.');
  }

  const data = await shopifyGraphQL(
    config,
    `
      mutation SetInventory($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup {
            reason
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: 'codex://shopify-crm-panel/manual-adjustment',
        quantities: [
          {
            inventoryItemId: payload.inventoryItemId,
            locationId,
            quantity: Number(payload.quantity)
          }
        ]
      }
    }
  );

  const result = data.inventorySetQuantities;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(', '));
  }

  return {
    mode: 'shopify',
    updated: {
      inventoryItemId: payload.inventoryItemId,
      quantity: Number(payload.quantity),
      locationId
    }
  };
}
