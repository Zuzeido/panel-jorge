import { useEffect, useMemo, useState } from 'react';
import { clearToken, fetchDashboard, getToken, loadSession, login, logout } from './api';

const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'categorias', label: 'Categorias' },
  { id: 'productos', label: 'Productos' },
  { id: 'pedidos', label: 'Pedidos' }
];

const currency = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR'
});

function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function LoginScreen({ onLogin, loading, error }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="auth-copy">
          <span className="eyebrow">Shopify CRM</span>
          <h1>Panel simple para visualizar la tienda.</h1>
          <p>
            Accede con los usuarios definidos en <code>config/users.json</code>.
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
            {loading ? 'Entrando...' : 'Entrar'}
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
          <span className="brand-mark">S</span>
          <div>
            <strong>Store Desk</strong>
            <p>{source === 'shopify' ? 'Shopify' : 'Demo'}</p>
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

function SummaryCards({ products, categories, orders }) {
  const totalInventory = products.reduce((sum, product) => sum + (product.totalInventory || 0), 0);
  const lowStock = products.filter((product) => product.totalInventory < 10).length;

  const cards = [
    { label: 'Productos', value: products.length },
    { label: 'Categorias', value: categories.length },
    { label: 'Pedidos', value: orders.length },
    { label: 'Stock bajo', value: lowStock },
    { label: 'Unidades', value: totalInventory }
  ];

  return (
    <section className="stats-grid">
      {cards.map((card) => (
        <article key={card.label} className="stat-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}

function HomeView({ data }) {
  const recentOrders = data.orders.slice(0, 5);
  const recentProducts = [...data.products]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">Resumen</span>
          <h2>Vista general</h2>
        </div>
      </header>

      <SummaryCards
        products={data.products}
        categories={data.categories}
        orders={data.orders}
      />

      <section className="simple-grid">
        <article className="panel-card">
          <div className="panel-title">
            <h3>Ultimos productos</h3>
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
            <h3>Ultimos pedidos</h3>
          </div>
          <div className="mini-list">
            {recentOrders.map((order) => (
              <div key={order.id} className="mini-row">
                <div>
                  <strong>{order.name}</strong>
                  <p>{order.customerName}</p>
                </div>
                <span>{currency.format(Number(order.totalAmount))}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function CategoriesView({ categories }) {
  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">Catalogo</span>
          <h2>Categorias</h2>
        </div>
      </header>

      <section className="table-card">
        <div className="table-head categories-table">
          <span>Categoria</span>
          <span>Productos</span>
          <span>Stock</span>
          <span>Estados</span>
        </div>
        {categories.map((category) => (
          <div key={category.id} className="table-row categories-table">
            <strong>{category.name}</strong>
            <span>{category.productsCount}</span>
            <span>{category.totalInventory}</span>
            <span>{category.statuses.join(', ')}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProductsView({ data }) {
  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return data.products;
    }

    return data.products.filter((product) => {
      return (
        product.title.toLowerCase().includes(term) ||
        product.productType.toLowerCase().includes(term) ||
        product.vendor.toLowerCase().includes(term)
      );
    });
  }, [data.products, search]);

  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">Catalogo</span>
          <h2>Productos</h2>
        </div>
        <input
          className="search-input"
          placeholder="Buscar producto"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      <section className="table-card">
        <div className="table-head products-table">
          <span>Producto</span>
          <span>Categoria</span>
          <span>Proveedor</span>
          <span>Estado</span>
          <span>Stock</span>
          <span>Actualizado</span>
        </div>
        {filteredProducts.map((product) => (
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
    </div>
  );
}

function OrdersView({ orders }) {
  return (
    <div className="page-content">
      <header className="page-header">
        <div>
          <span className="eyebrow">Ventas</span>
          <h2>Pedidos</h2>
        </div>
      </header>

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
            <span>{currency.format(Number(order.totalAmount))}</span>
            <span>{order.displayFinancialStatus}</span>
            <span>{order.displayFulfillmentStatus}</span>
            <span>{formatDate(order.createdAt)}</span>
          </div>
        ))}
      </section>
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
    return <div className="loading-screen">Cargando panel...</div>;
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
                <strong>Panel de visualizacion</strong>
                <p>{dashboard.source === 'shopify' ? 'Datos reales sincronizados.' : 'Datos demo cargados.'}</p>
              </div>
              <button className="secondary-button" onClick={refreshDashboard}>
                Recargar
              </button>
            </div>

            {activeView === 'inicio' ? <HomeView data={dashboard} /> : null}
            {activeView === 'categorias' ? (
              <CategoriesView categories={dashboard.categories} />
            ) : null}
            {activeView === 'productos' ? <ProductsView data={dashboard} /> : null}
            {activeView === 'pedidos' ? <OrdersView orders={dashboard.orders} /> : null}
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
