import { useEffect, useMemo, useState } from 'react';
import {
  clearToken,
  fetchDashboard,
  fetchOrdersPage,
  fetchProductsPage,
  getToken,
  loadSession,
  login,
  logout
} from './api';

const BRAND_NAME = 'Recycled J';
const EXCLUDED_CATEGORY = 'HDLR';
const TABLE_PAGE_SIZE = 50;

const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'colecciones', label: 'Colecciones' },
  { id: 'productos', label: 'Productos' },
  { id: 'pedidos', label: 'Pedidos' }
];

function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatMoney(value, currencyCode = 'EUR') {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currencyCode
  }).format(Number(value || 0));
}

function formatCompactMoney(value, currencyCode = 'EUR') {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isExcludedCategory(value) {
  return normalizeText(value) === normalizeText(EXCLUDED_CATEGORY);
}

function getOrderNonExcludedRevenue(order) {
  const lineItems = order.lineItems || [];
  if (!lineItems.length) {
    return Number(order.totalAmount || 0);
  }

  return lineItems.reduce((sum, item) => {
    if (isExcludedCategory(item.productType)) {
      return sum;
    }

    return sum + Number(item.totalAmount || 0);
  }, 0);
}

function getOrderExcludedRevenue(order) {
  const totalAmount = Number(order.totalAmount || 0);
  return Math.max(totalAmount - getOrderNonExcludedRevenue(order), 0);
}

function getDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatAxisDay(date) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short'
  }).format(date);
}

function buildDailyTrend(orders, days) {
  const rows = [];
  const indexByKey = new Map();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = getDateKey(date);
    const row = {
      key,
      label: formatAxisDay(date),
      orders: 0,
      revenue: 0,
      netRevenue: 0
    };

    indexByKey.set(key, row);
    rows.push(row);
  }

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const key = getDateKey(orderDate);
    const row = indexByKey.get(key);
    if (!row) {
      continue;
    }

    row.orders += 1;
    row.revenue += Number(order.totalAmount || 0);
    row.netRevenue += getOrderNonExcludedRevenue(order);
  }

  return rows;
}

function buildCategoryPerformance(orders) {
  const map = new Map();

  for (const order of orders) {
    for (const item of order.lineItems || []) {
      const name = item.productType || 'Sin categoria';
      const current = map.get(name) || {
        name,
        revenue: 0,
        units: 0
      };

      current.revenue += Number(item.totalAmount || 0);
      current.units += Number(item.quantity || 0);
      map.set(name, current);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

function buildCustomerLeaders(orders) {
  const map = new Map();

  for (const order of orders) {
    const key = order.customerName || 'Cliente sin nombre';
    const current = map.get(key) || {
      name: key,
      orders: 0,
      revenue: 0
    };

    current.orders += 1;
    current.revenue += Number(order.totalAmount || 0);
    map.set(key, current);
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4);
}

function buildHomeMetrics(data) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartTime = monthStart.getTime();
  const monthlyOrders = data.orders.filter(
    (order) => new Date(order.createdAt).getTime() >= monthStartTime
  );
  const currencyCode = monthlyOrders[0]?.currencyCode || data.orders[0]?.currencyCode || 'EUR';
  const totalRevenue = monthlyOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const revenueWithoutExcluded = monthlyOrders.reduce(
    (sum, order) => sum + getOrderNonExcludedRevenue(order),
    0
  );
  const ordersWithoutExcluded = monthlyOrders.filter(
    (order) => getOrderNonExcludedRevenue(order) > 0
  ).length;
  const excludedRevenue = monthlyOrders.reduce(
    (sum, order) => sum + getOrderExcludedRevenue(order),
    0
  );
  const unfulfilledOrders = monthlyOrders.filter(
    (order) => normalizeText(order.displayFulfillmentStatus) !== 'fulfilled'
  ).length;
  const paidOrders = monthlyOrders.filter(
    (order) => normalizeText(order.displayFinancialStatus) === 'paid'
  ).length;

  return {
    currencyCode,
    monthlyOrders,
    totalRevenue,
    revenueWithoutExcluded,
    ordersWithoutExcluded,
    excludedRevenue,
    unfulfilledOrders,
    paidOrders,
    trend: buildDailyTrend(monthlyOrders, 14),
    categoryPerformance: buildCategoryPerformance(monthlyOrders),
    customerLeaders: buildCustomerLeaders(monthlyOrders)
  };
}

function LoginScreen({ onLogin, loading, error }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="auth-copy">
          <span className="eyebrow">CRM Ecommerce</span>
          <h1>Control comercial de {BRAND_NAME}.</h1>
          <p>
            Accede al panel de clientes, pedidos y producto con las credenciales operativas de la
            tienda.
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(username, password);
          }}
        >
          <label>
            Usuario
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>

          <label>
            Contrasena
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar en Recycled J'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Sidebar({ activeView, onChange, user, source, onLogout }) {
  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <span className="brand-mark">RJ</span>
          <div>
            <strong>{BRAND_NAME}</strong>
            <p>{source === 'shopify' ? 'CRM conectado a Shopify' : 'CRM en modo demo'}</p>
          </div>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={item.id === activeView ? 'nav-item active' : 'nav-item'}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div>
          <strong>{user.name}</strong>
          <p>@{user.username}</p>
        </div>
        <button className="secondary-button" onClick={onLogout}>
          Salir
        </button>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, meta, tone = 'default' }) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
    </article>
  );
}

function MetricDivider() {
  return (
    <div className="metric-divider">
      <span>Sin {EXCLUDED_CATEGORY}</span>
    </div>
  );
}

function TrendChart({ title, points, valueKey, tone, formatter, footer }) {
  const maxValue = Math.max(...points.map((point) => point[valueKey]), 1);

  return (
    <article className="panel-card chart-card">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Tendencia</span>
          <h3>{title}</h3>
        </div>
        <strong>{footer}</strong>
      </div>

      <div className="chart-bars">
        {points.map((point) => (
          <div key={point.key} className="chart-column">
            <span
              className={`chart-bar chart-bar-${tone}`}
              style={{ height: `${Math.max((point[valueKey] / maxValue) * 100, 8)}%` }}
              title={`${point.label}: ${formatter(point[valueKey])}`}
            />
            <strong>{formatter(point[valueKey])}</strong>
            <p>{point.label}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function CategoryPerformance({ rows, currencyCode }) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  return (
    <article className="panel-card">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Mix</span>
          <h3>Tipos de producto con mas ingreso</h3>
        </div>
      </div>

      <div className="performance-list">
        {rows.map((row) => (
          <div key={row.name} className="performance-row">
            <div className="performance-copy">
              <strong>{row.name}</strong>
              <p>{row.units} uds. vendidas</p>
            </div>
            <div className="performance-bar-wrap">
              <span
                className="performance-bar"
                style={{ width: `${Math.max((row.revenue / maxRevenue) * 100, 12)}%` }}
              />
            </div>
            <strong>{formatMoney(row.revenue, currencyCode)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function CustomerLeaders({ rows, currencyCode }) {
  return (
    <article className="panel-card">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Clientes</span>
          <h3>Top compradores del mes</h3>
        </div>
      </div>

      <div className="mini-list">
        {rows.map((row) => (
          <div key={row.name} className="mini-row">
            <div>
              <strong>{row.name}</strong>
              <p>{row.orders} pedidos</p>
            </div>
            <span>{formatMoney(row.revenue, currencyCode)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function LoadMoreButton({ loadedCount, hasNextPage, loading, onClick, label }) {
  if (!hasNextPage) {
    return null;
  }

  return (
    <div className="load-more-wrap">
      <button className="secondary-button" onClick={onClick} disabled={loading}>
        {loading ? 'Cargando...' : `Cargar 50 mas ${label}`}
      </button>
      <p>Mostrando {loadedCount} elementos</p>
    </div>
  );
}

function HomeView({ data }) {
  const metrics = useMemo(() => buildHomeMetrics(data), [data]);
  const recentOrders = data.orders.slice(0, 5);
  const recentProducts = [...data.products]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="page-content">
      <header className="page-header page-header-wide">
        <div>
          <span className="eyebrow">CRM Recycled J</span>
          <h2>Inicio comercial</h2>
          <p className="page-header-copy">
            Vista del mes actual con foco en pedidos, facturacion y peso de la categoria{' '}
            {EXCLUDED_CATEGORY}.
          </p>
        </div>

        <div className="status-cluster">
          <div className="status-chip">
            <strong>{metrics.paidOrders}</strong>
            <span>Pagados</span>
          </div>
          <div className="status-chip">
            <strong>{metrics.unfulfilledOrders}</strong>
            <span>Pendientes</span>
          </div>
          <div className="status-chip">
            <strong>{formatCompactMoney(metrics.excludedRevenue, metrics.currencyCode)}</strong>
            <span>Peso HDLR</span>
          </div>
        </div>
      </header>

      <section className="metrics-grid">
        <MetricCard
          label="Pedidos del mes"
          value={metrics.monthlyOrders.length}
          meta="Volumen total desde el dia 1 del mes actual."
          tone="accent"
        />
        <MetricCard
          label="Facturacion del mes"
          value={formatMoney(metrics.totalRevenue, metrics.currencyCode)}
          meta="Importe total registrado por Shopify."
          tone="accent"
        />
        <MetricDivider />
        <MetricCard
          label={`Pedidos sin ${EXCLUDED_CATEGORY}`}
          value={metrics.ordersWithoutExcluded}
          meta="Pedidos con ingresos fuera de esa categoria."
          tone="neutral"
        />
        <MetricCard
          label={`Facturacion sin ${EXCLUDED_CATEGORY}`}
          value={formatMoney(metrics.revenueWithoutExcluded, metrics.currencyCode)}
          meta="Ingresos netos excluyendo esa categoria."
          tone="neutral"
        />
      </section>

      <section className="crm-grid">
        <TrendChart
          title="Pedidos por dia"
          points={metrics.trend}
          valueKey="orders"
          tone="orders"
          formatter={(value) => String(value)}
          footer={`${metrics.monthlyOrders.length} pedidos`}
        />
        <TrendChart
          title="Facturacion diaria"
          points={metrics.trend}
          valueKey="netRevenue"
          tone="revenue"
          formatter={(value) => formatCompactMoney(value, metrics.currencyCode)}
          footer={formatMoney(metrics.revenueWithoutExcluded, metrics.currencyCode)}
        />
      </section>

      <section className="crm-grid crm-grid-secondary">
        <CategoryPerformance rows={metrics.categoryPerformance} currencyCode={metrics.currencyCode} />
        <CustomerLeaders rows={metrics.customerLeaders} currencyCode={metrics.currencyCode} />
      </section>

      <section className="crm-grid crm-grid-secondary">
        <article className="panel-card">
          <div className="panel-title">
            <div>
              <span className="eyebrow">Catalogo</span>
              <h3>Ultimos productos actualizados</h3>
            </div>
          </div>
          <div className="mini-list">
            {recentProducts.map((product) => (
              <div key={product.id} className="mini-row">
                <div>
                  <strong>{product.title}</strong>
                  <p>{product.productType}</p>
                </div>
                <span>{product.totalInventory} uds.</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-title">
            <div>
              <span className="eyebrow">Pedidos</span>
              <h3>Actividad reciente</h3>
            </div>
          </div>
          <div className="mini-list">
            {recentOrders.map((order) => (
              <div key={order.id} className="mini-row">
                <div>
                  <strong>{order.name}</strong>
                  <p>{order.customerName}</p>
                </div>
                <span>{formatMoney(order.totalAmount, order.currencyCode)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function CollectionsView({ collections }) {
  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">CRM Recycled J</span>
          <h2>Colecciones</h2>
        </div>
      </header>

      <section className="table-card">
        <div className="table-head collections-table">
          <span>Coleccion</span>
          <span>Handle</span>
          <span>Tipo</span>
          <span>Productos</span>
          <span>Actualizada</span>
        </div>
        {collections.map((collection) => (
          <div key={collection.id} className="table-row collections-table">
            <strong>{collection.name}</strong>
            <span>{collection.handle}</span>
            <span>{collection.type}</span>
            <span>{collection.productsCount}</span>
            <span>{formatDate(collection.updatedAt)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProductsView() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function loadFirstPage() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchProductsPage({
          first: TABLE_PAGE_SIZE,
          search
        });

        if (cancelled) {
          return;
        }

        setProducts(data.nodes || []);
        setHasNextPage(Boolean(data.pageInfo?.hasNextPage));
        setCursor(data.pageInfo?.endCursor || '');
      } catch (requestError) {
        if (!cancelled) {
          setProducts([]);
          setHasNextPage(false);
          setCursor('');
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [search]);

  async function handleLoadMore() {
    try {
      setLoadingMore(true);
      const data = await fetchProductsPage({
        first: TABLE_PAGE_SIZE,
        after: cursor,
        search
      });
      setProducts((current) => [...current, ...(data.nodes || [])]);
      setHasNextPage(Boolean(data.pageInfo?.hasNextPage));
      setCursor(data.pageInfo?.endCursor || '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">CRM Recycled J</span>
          <h2>Productos</h2>
        </div>
        <div className="table-toolbar">
          <input
            className="search-input"
            placeholder="Buscar producto"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <p>{loading ? 'Buscando...' : `${products.length} cargados`}</p>
        </div>
      </header>

      {error ? <div className="loading-screen panel-inline-error">{error}</div> : null}

      <section className="table-card">
        <div className="table-head products-table">
          <span>Producto</span>
          <span>Categoria</span>
          <span>Proveedor</span>
          <span>Estado</span>
          <span>Stock</span>
          <span>Actualizado</span>
        </div>
        {products.map((product) => (
          <div key={product.id} className="table-row products-table">
            <div className="title-cell">
              <strong>{product.title}</strong>
              <p>{product.variants.length} variantes</p>
            </div>
            <span>{product.productType}</span>
            <span>{product.vendor}</span>
            <span>
              <span className={`pill ${product.status.toLowerCase()}`}>{product.status}</span>
            </span>
            <span>{product.totalInventory}</span>
            <span>{formatDate(product.updatedAt)}</span>
          </div>
        ))}
      </section>

      <LoadMoreButton
        loadedCount={products.length}
        hasNextPage={hasNextPage}
        loading={loadingMore}
        onClick={handleLoadMore}
        label="productos"
      />
    </div>
  );
}

function OrdersView() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function loadFirstPage() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchOrdersPage({
          first: TABLE_PAGE_SIZE,
          search
        });

        if (cancelled) {
          return;
        }

        setOrders(data.nodes || []);
        setHasNextPage(Boolean(data.pageInfo?.hasNextPage));
        setCursor(data.pageInfo?.endCursor || '');
      } catch (requestError) {
        if (!cancelled) {
          setOrders([]);
          setHasNextPage(false);
          setCursor('');
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [search]);

  async function handleLoadMore() {
    try {
      setLoadingMore(true);
      const data = await fetchOrdersPage({
        first: TABLE_PAGE_SIZE,
        after: cursor,
        search
      });
      setOrders((current) => [...current, ...(data.nodes || [])]);
      setHasNextPage(Boolean(data.pageInfo?.hasNextPage));
      setCursor(data.pageInfo?.endCursor || '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">CRM Recycled J</span>
          <h2>Pedidos</h2>
        </div>
        <div className="table-toolbar">
          <input
            className="search-input"
            placeholder="Buscar pedido o cliente"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <p>{loading ? 'Buscando...' : `${orders.length} cargados`}</p>
        </div>
      </header>

      {error ? <div className="loading-screen panel-inline-error">{error}</div> : null}

      <section className="table-card">
        <div className="table-head orders-table-grid">
          <span>Pedido</span>
          <span>Cliente</span>
          <span>Importe</span>
          <span>Pago</span>
          <span>Envio</span>
          <span>Fecha</span>
        </div>
        {orders.map((order) => (
          <div key={order.id} className="table-row orders-table-grid">
            <div className="title-cell">
              <strong>{order.name}</strong>
              <p>{order.lineItems.map((item) => `${item.title} x${item.quantity}`).join(', ')}</p>
            </div>
            <span>{order.customerName}</span>
            <span>{formatMoney(order.totalAmount, order.currencyCode)}</span>
            <span>{order.displayFinancialStatus}</span>
            <span>{order.displayFulfillmentStatus}</span>
            <span>{formatDate(order.createdAt)}</span>
          </div>
        ))}
      </section>

      <LoadMoreButton
        loadedCount={orders.length}
        hasNextPage={hasNextPage}
        loading={loadingMore}
        onClick={handleLoadMore}
        label="pedidos"
      />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState('inicio');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  async function hydrate() {
    try {
      const session = await loadSession();
      setUser(session.user);
      const data = await fetchDashboard();
      setDashboard(data);
      setDashboardError('');
      setError('');
    } catch (requestError) {
      if (requestError.message === 'Sesion no valida.') {
        clearToken();
        setUser(null);
        setDashboard(null);
        setDashboardError('');
      } else {
        setDashboard(null);
        setDashboardError(requestError.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshDashboard() {
    const data = await fetchDashboard();
    setDashboard(data);
    setDashboardError('');
  }

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    hydrate();
  }, []);

  async function handleLogin(username, password) {
    setAuthLoading(true);
    setError('');

    try {
      const loggedUser = await login(username, password);
      setUser(loggedUser);
      const data = await fetchDashboard();
      setDashboard(data);
      setDashboardError('');
    } catch (requestError) {
      if (requestError.message === 'Sesion no valida.') {
        setError(requestError.message);
        setUser(null);
      } else {
        setDashboard(null);
        setDashboardError(requestError.message);
        setError('');
      }
    } finally {
      setAuthLoading(false);
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (_error) {
      clearToken();
    }

    setUser(null);
    setDashboard(null);
    setDashboardError('');
    setActiveView('inicio');
  }

  if (loading) {
    return <div className="loading-screen">Cargando CRM de {BRAND_NAME}...</div>;
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} loading={authLoading} error={error} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        onChange={setActiveView}
        user={user}
        source={dashboard?.source}
        onLogout={handleLogout}
      />

      <main className="main-area">
        {dashboard ? (
          <>
            <div className="toolbar">
              <div>
                <strong>CRM operativo de {BRAND_NAME}</strong>
                <p>
                  {dashboard.source === 'shopify'
                    ? 'Datos reales sincronizados con Shopify.'
                    : 'Datos demo cargados para revisar el panel.'}
                </p>
              </div>
              <button className="secondary-button" onClick={refreshDashboard}>
                Recargar
              </button>
            </div>

            {activeView === 'inicio' ? <HomeView data={dashboard} /> : null}
            {activeView === 'colecciones' ? (
              <CollectionsView collections={dashboard.collections || []} />
            ) : null}
            {activeView === 'productos' ? <ProductsView /> : null}
            {activeView === 'pedidos' ? <OrdersView /> : null}
          </>
        ) : (
          <div className="loading-screen">
            {dashboardError || 'No se pudo cargar el dashboard.'}
          </div>
        )}
      </main>
    </div>
  );
}
