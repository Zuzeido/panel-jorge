import { demoCollections, demoLocationId, demoOrders, demoProducts } from './demo-store.js';
import { readShopifyConfig } from './config.js';
const tokenCache = new Map();
const MAX_THROTTLE_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
    const throttled = payload.errors.some((error) =>
      String(error.message || '').toLowerCase().includes('throttled')
    );
    const accessDenied = payload.errors.some(
      (error) => error.extensions?.code === 'ACCESS_DENIED'
    );

    if (throttled) {
      const throttleStatus = payload.extensions?.cost?.throttleStatus;
      const currentlyAvailable = Number(throttleStatus?.currentlyAvailable ?? 0);
      const restoreRate = Number(throttleStatus?.restoreRate ?? 50);
      const requestedCost = Number(payload.extensions?.cost?.requestedQueryCost ?? 100);
      const deficit = Math.max(requestedCost - currentlyAvailable, 1);
      const waitMs = Math.ceil((deficit / Math.max(restoreRate, 1)) * 1000) + 250;
      const error = new Error('Throttled');
      error.retryAfterMs = waitMs;
      throw error;
    }

    if (accessDenied) {
      throw new Error(
        'Shopify denego acceso por scopes insuficientes. Reinstala o publica la app con read_products, read_orders y read_locations.'
      );
    }

    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  return payload.data;
}

async function fetchConnectionPage(config, query, rootKey, variables = {}) {
  let attempt = 0;

  while (attempt <= MAX_THROTTLE_RETRIES) {
    try {
      const data = await shopifyGraphQL(config, query, variables);
      return data[rootKey];
    } catch (error) {
      if (error.message !== 'Throttled' || attempt === MAX_THROTTLE_RETRIES) {
        throw error;
      }

      await sleep(error.retryAfterMs || 1500);
      attempt += 1;
    }
  }

  throw new Error('No se pudo leer la conexion de Shopify.');
}

async function fetchAllConnectionNodes(config, query, rootKey, pageSize = 50) {
  const nodes = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const connection = await fetchConnectionPage(config, query, rootKey, {
      first: pageSize,
      after: cursor
    });
    nodes.push(...(connection?.nodes || []));
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor || null;
  }

  return nodes;
}

function getCurrentMonthStartIso() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function buildConnectionResult(nodes, hasNextPage = false, endCursor = null) {
  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor
    }
  };
}

function paginateDemoItems(items, after, first) {
  const startIndex = after ? Number(after) : 0;
  const nodes = items.slice(startIndex, startIndex + first);
  const endIndex = startIndex + nodes.length;
  return buildConnectionResult(nodes, endIndex < items.length, String(endIndex));
}

const PRODUCT_PAGE_QUERY = `
  query ProductsPage($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
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
        collections(first: 10) {
          nodes {
            title
          }
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const COLLECTION_PAGE_QUERY = `
  query CollectionsPage($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        updatedAt
        ruleSet {
          appliedDisjunctively
        }
        productsCount {
          count
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const ORDER_PAGE_QUERY = `
  query OrdersPage($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
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
        lineItems(first: 50) {
          nodes {
            title
            quantity
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            variant {
              product {
                title
                productType
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function mapProduct(node) {
  const variants = (node.variants?.nodes || []).map((variant) => ({
    id: variant.id,
    title: variant.title,
    sku: variant.sku || 'Sin SKU',
    price: variant.price,
    inventoryQuantity: variant.inventoryQuantity ?? 0,
    inventoryItemId: variant.inventoryItem?.id || ''
  }));

  return {
    id: node.id,
    title: node.title,
    productType: node.productType || 'Sin categoria',
    status: node.status,
    totalInventory: node.totalInventory ?? 0,
    updatedAt: node.updatedAt,
    tags: node.tags || [],
    imageUrl: node.featuredImage?.url || '',
    collections: (node.collections?.nodes || []).map((collection) => collection.title).filter(Boolean),
    price: variants[0]?.price || '0.00',
    variants
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
      quantity: item.quantity,
      totalAmount: item.discountedTotalSet?.shopMoney?.amount || '0.00',
      currencyCode: item.discountedTotalSet?.shopMoney?.currencyCode || 'EUR',
      productType: item.variant?.product?.productType || '',
      productTitle: item.variant?.product?.title || item.title,
      collections: (item.variant?.product?.collections?.nodes || [])
        .map((collection) => collection.title)
        .filter(Boolean)
    }))
  };
}

function mapCollection(node) {
  return {
    id: node.id,
    name: node.title,
    handle: node.handle,
    productsCount: node.productsCount?.count ?? 0,
    type: node.ruleSet ? 'Smart' : 'Manual',
    updatedAt: node.updatedAt
  };
}

export async function getStoreData() {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    if (config.useDemoDataWhenMissingCredentials) {
      return {
        source: 'demo',
        locationId: config.locationId || demoLocationId,
        products: demoProducts.slice(0, 4),
        collections: demoCollections,
        orders: demoOrders
      };
    }

    throw new Error(
      'Faltan credenciales de Shopify en config/shopify.json. Usa accessToken o apiKey + apiSecret.'
    );
  }

  const recentProductsConnection = await fetchConnectionPage(
    config,
    PRODUCT_PAGE_QUERY,
    'products',
    {
      first: 4,
      after: null,
      query: null
    }
  );

  const orderNodes = await fetchAllConnectionNodes(
    config,
    `
      query DashboardOrders($first: Int!, $after: String) {
        orders(
          first: $first
          after: $after
          sortKey: CREATED_AT
          reverse: true
          query: "created_at:>=${getCurrentMonthStartIso()}"
        ) {
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
            lineItems(first: 50) {
              nodes {
                title
                quantity
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  product {
                    title
                    productType
                    collections(first: 10) {
                      nodes {
                        title
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    'orders',
    25
  );

  const collectionNodes = await fetchAllConnectionNodes(
    config,
    COLLECTION_PAGE_QUERY,
    'collections',
    50
  );

  const locationData = await shopifyGraphQL(
    config,
    `
      query DashboardLocations {
        locations(first: 10) {
          nodes {
            id
          }
        }
      }
    `
  );

  const products = (recentProductsConnection?.nodes || []).map(mapProduct);
  return {
    source: 'shopify',
    locationId: config.locationId || locationData.locations.nodes[0]?.id || '',
    products,
    collections: collectionNodes.map(mapCollection),
    orders: orderNodes.map(mapOrder)
  };
}

export async function getProductsPage({ after = null, first = 50, search = '' } = {}) {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    const filtered = !search
      ? demoProducts
      : demoProducts.filter((product) => {
          const term = search.toLowerCase();
          return (
            product.title.toLowerCase().includes(term) ||
            product.collections.join(' ').toLowerCase().includes(term)
          );
        });

    return {
      source: 'demo',
      ...paginateDemoItems(filtered, after, first)
    };
  }

  const connection = await fetchConnectionPage(config, PRODUCT_PAGE_QUERY, 'products', {
    first,
    after,
    query: search || null
  });

  return {
    source: 'shopify',
    nodes: (connection?.nodes || []).map(mapProduct),
    pageInfo: connection?.pageInfo || { hasNextPage: false, endCursor: null }
  };
}

export async function getOrdersPage({ after = null, first = 50, search = '' } = {}) {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    const filtered = !search
      ? demoOrders
      : demoOrders.filter((order) => {
          const term = search.toLowerCase();
          const lines = order.lineItems.map((item) => item.title).join(' ').toLowerCase();
          return (
            order.name.toLowerCase().includes(term) ||
            order.customerName.toLowerCase().includes(term) ||
            lines.includes(term)
          );
        });

    return {
      source: 'demo',
      ...paginateDemoItems(filtered, after, first)
    };
  }

  const connection = await fetchConnectionPage(config, ORDER_PAGE_QUERY, 'orders', {
    first,
    after,
    query: search || null
  });

  return {
    source: 'shopify',
    nodes: (connection?.nodes || []).map(mapOrder),
    pageInfo: connection?.pageInfo || { hasNextPage: false, endCursor: null }
  };
}

export async function getStockReportData() {
  const config = await readShopifyConfig();

  if (!hasCredentials(config)) {
    return {
      generatedAt: new Date().toISOString(),
      products: demoProducts
    };
  }

  const productNodes = await fetchAllConnectionNodes(config, PRODUCT_PAGE_QUERY, 'products', 25);
  return {
    generatedAt: new Date().toISOString(),
    products: productNodes.map(mapProduct)
  };
}

export async function getMonthlySalesReportData() {
  return getMonthlySalesReportDataBase({ excludeHdlr: false });
}

export async function getMonthlySalesReportWithoutHdlrData() {
  return getMonthlySalesReportDataBase({ excludeHdlr: true });
}

async function getMonthlySalesReportDataBase({ excludeHdlr }) {
  const config = await readShopifyConfig();
  const generatedAt = new Date().toISOString();

  const orders = !hasCredentials(config)
    ? demoOrders
    : (
        await fetchAllConnectionNodes(
          config,
          `
            query MonthlyReportOrders($first: Int!, $after: String) {
              orders(
                first: $first
                after: $after
                sortKey: CREATED_AT
                reverse: true
                query: "created_at:>=${getCurrentMonthStartIso()}"
              ) {
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
                  lineItems(first: 50) {
                    nodes {
                      title
                      quantity
                      discountedTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      variant {
                        product {
                          title
                          productType
                          collections(first: 10) {
                            nodes {
                              title
                            }
                          }
                        }
                      }
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `,
          'orders',
          25
        )
      ).map(mapOrder);

  const map = new Map();
  let units = 0;
  let revenue = 0;
  const currencyCode = orders[0]?.currencyCode || 'EUR';

  for (const order of orders) {
    for (const item of order.lineItems || []) {
      const isHdlr =
        item.productType?.toLowerCase() === 'hdlr' ||
        item.collections?.some((collection) => collection.toLowerCase() === 'hdlr');

      if (excludeHdlr && isHdlr) {
        continue;
      }

      const key = item.productTitle || item.title;
      const current = map.get(key) || {
        name: key,
        orders: new Set(),
        ordersCount: 0,
        units: 0,
        revenue: 0,
        currencyCode: item.currencyCode || currencyCode
      };

      current.orders.add(order.id);
      current.units += Number(item.quantity || 0);
      current.revenue += Number(item.totalAmount || 0);
      map.set(key, current);
      units += Number(item.quantity || 0);
      revenue += Number(item.totalAmount || 0);
    }
  }

  const rows = Array.from(map.values())
    .map((row) => ({
      name: row.name,
      ordersCount: row.orders.size,
      units: row.units,
      revenue: row.revenue,
      currencyCode: row.currencyCode
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es'));

  return {
    generatedAt,
    rows,
    summary: {
      ordersCount: orders.length,
      units,
      revenue,
      currencyCode,
      excludeHdlr
    }
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
