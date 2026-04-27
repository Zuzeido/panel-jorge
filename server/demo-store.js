export const demoProducts = [
  {
    id: 'gid://shopify/Product/1',
    title: 'Sudadera Essential',
    productType: 'Sudaderas',
    vendor: 'Northwind',
    status: 'ACTIVE',
    totalInventory: 42,
    updatedAt: '2026-04-25T10:15:00Z',
    tags: ['destacado', 'invierno'],
    imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
    collections: ['Drop Primavera', 'Best Sellers'],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/11',
        title: 'Negro / M',
        sku: 'SUD-ESS-BLK-M',
        price: '59.90',
        inventoryQuantity: 18,
        inventoryItemId: 'gid://shopify/InventoryItem/111'
      },
      {
        id: 'gid://shopify/ProductVariant/12',
        title: 'Negro / L',
        sku: 'SUD-ESS-BLK-L',
        price: '59.90',
        inventoryQuantity: 24,
        inventoryItemId: 'gid://shopify/InventoryItem/112'
      }
    ]
  },
  {
    id: 'gid://shopify/Product/2',
    title: 'Camiseta Wave',
    productType: 'Camisetas',
    vendor: 'Northwind',
    status: 'DRAFT',
    totalInventory: 9,
    updatedAt: '2026-04-24T12:40:00Z',
    tags: ['rebajas', 'verano'],
    imageUrl: 'https://images.unsplash.com/photo-1527719327859-c6ce80353573?auto=format&fit=crop&w=800&q=80',
    collections: ['HDLR'],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/21',
        title: 'Blanco / S',
        sku: 'CAM-WAV-WHT-S',
        price: '24.50',
        inventoryQuantity: 4,
        inventoryItemId: 'gid://shopify/InventoryItem/211'
      },
      {
        id: 'gid://shopify/ProductVariant/22',
        title: 'Blanco / M',
        sku: 'CAM-WAV-WHT-M',
        price: '24.50',
        inventoryQuantity: 5,
        inventoryItemId: 'gid://shopify/InventoryItem/212'
      }
    ]
  },
  {
    id: 'gid://shopify/Product/3',
    title: 'Gorra Signature',
    productType: 'Accesorios',
    vendor: 'Urban Peak',
    status: 'ACTIVE',
    totalInventory: 67,
    updatedAt: '2026-04-26T08:05:00Z',
    tags: ['nuevo'],
    imageUrl: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=800&q=80',
    collections: ['Accesorios', 'Drop Primavera'],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/31',
        title: 'Talla unica',
        sku: 'GOR-SIG-BLK',
        price: '19.99',
        inventoryQuantity: 67,
        inventoryItemId: 'gid://shopify/InventoryItem/311'
      }
    ]
  }
];

export const demoOrders = [
  {
    id: 'gid://shopify/Order/1',
    name: '#1001',
    createdAt: '2026-04-26T18:30:00Z',
    displayFulfillmentStatus: 'UNFULFILLED',
    displayFinancialStatus: 'PAID',
    totalAmount: '119.80',
    currencyCode: 'EUR',
    customerName: 'Lucia Ramos',
    lineItems: [
      {
        title: 'Sudadera Essential',
        quantity: 2,
        totalAmount: '99.81',
        currencyCode: 'EUR',
        productType: 'Sudaderas',
        productTitle: 'Sudadera Essential',
        collections: ['Drop Primavera', 'Best Sellers']
      },
      {
        title: 'Gorra Signature',
        quantity: 1,
        totalAmount: '19.99',
        currencyCode: 'EUR',
        productType: 'Accesorios',
        productTitle: 'Gorra Signature',
        collections: ['Accesorios', 'Drop Primavera']
      }
    ]
  },
  {
    id: 'gid://shopify/Order/2',
    name: '#1000',
    createdAt: '2026-04-25T16:10:00Z',
    displayFulfillmentStatus: 'FULFILLED',
    displayFinancialStatus: 'PAID',
    totalAmount: '24.50',
    currencyCode: 'EUR',
    customerName: 'Carlos Vega',
    lineItems: [
      {
        title: 'Camiseta Wave',
        quantity: 1,
        totalAmount: '24.50',
        currencyCode: 'EUR',
        productType: 'HDLR',
        productTitle: 'Camiseta Wave',
        collections: ['HDLR']
      }
    ]
  }
];

export const demoCollections = [
  {
    id: 'gid://shopify/Collection/1',
    name: 'Drop Primavera',
    handle: 'drop-primavera',
    productsCount: 12,
    type: 'Manual',
    updatedAt: '2026-04-26T09:20:00Z'
  },
  {
    id: 'gid://shopify/Collection/2',
    name: 'HDLR',
    handle: 'hdlr',
    productsCount: 8,
    type: 'Smart',
    updatedAt: '2026-04-25T14:10:00Z'
  },
  {
    id: 'gid://shopify/Collection/3',
    name: 'Accesorios',
    handle: 'accesorios',
    productsCount: 5,
    type: 'Manual',
    updatedAt: '2026-04-24T11:00:00Z'
  }
];

export const demoLocationId = 'gid://shopify/Location/1';
