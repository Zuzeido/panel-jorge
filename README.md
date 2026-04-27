# Shopify CRM Panel

Panel tipo CRM para visualizar productos, categorias, stock y pedidos de una tienda Shopify.

## Lo que incluye

- Login local con usuarios editables en `config/users.json`
- Sidebar con `Inicio`, `Categorias`, `Productos` y `Pedidos`
- Dashboard visual con metricas y resumen operativo
- Listado de pedidos
- Modo demo si aun no has configurado Shopify

## Configuracion

### 1. Usuarios

Edita `config/users.json`:

```json
{
  "users": [
    {
      "username": "admin",
      "password": "admin123",
      "name": "Administrador",
      "role": "Owner"
    }
  ]
}
```

### 2. Shopify

Edita `config/shopify.json`:

```json
{
  "storeDomain": "tu-tienda.myshopify.com",
  "apiKey": "xxxx",
  "apiSecret": "shpss_xxxx",
  "accessToken": "",
  "apiVersion": "2025-10",
  "locationId": "gid://shopify/Location/123456789",
  "useDemoDataWhenMissingCredentials": true
}
```

Notas:

- Para apps nuevas de Shopify en 2026 usa `apiKey` y `apiSecret`. El backend pide y renueva el token automaticamente.
- `accessToken` sigue siendo util si ya tienes una app antigua con token fijo.
- `locationId` es opcional para esta version, porque el panel es solo lectura.
- Si dejas vacias las credenciales y `useDemoDataWhenMissingCredentials` en `true`, la app arranca con datos demo.

## Arranque

```bash
npm install
npm run dev
```

Frontend:

- `http://localhost:8765`
- `http://TU_IP_PUBLICA:8765`

API:

- `http://localhost:8766` en desarrollo
- `http://TU_IP_PUBLICA:8766` en desarrollo
- `http://localhost:8765` en produccion con `npm start`

## Por que hay backend

Para productos, inventario y pedidos Shopify exige usar la Admin API con un token privado. Ese token no debe exponerse en el navegador, por eso este proyecto usa un backend minimo en `server/index.js` que hace de proxy seguro.

## Despliegue en Vercel

Esta version ya incluye soporte para Vercel:

- `vercel.json` publica el frontend construido en `dist`
- `api/index.js` expone el backend Express como funcion serverless
- la sesion ya no depende de memoria del proceso
- Shopify y usuarios pueden venir desde variables de entorno

### Antes de subirlo

1. Rota las credenciales actuales de Shopify si este proyecto ya salio de tu maquina.
2. No subas `config/shopify.json` ni `config/users.json` a GitHub.
3. Usa variables de entorno en Vercel para secretos y usuarios.

### Variables recomendadas en Vercel

Obligatoria:

- `AUTH_SECRET`: una cadena larga y aleatoria para firmar sesiones

Para Shopify:

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_ACCESS_TOKEN` si ya usas token fijo
- `SHOPIFY_API_VERSION` por ejemplo `2025-10`
- `SHOPIFY_LOCATION_ID` opcional
- `SHOPIFY_USE_DEMO_DATA_WHEN_MISSING_CREDENTIALS` con `true` o `false`

Para usuarios:

- `APP_USERS_JSON`

Ejemplo de `APP_USERS_JSON`:

```json
{"users":[{"username":"admin","password":"cambia-esto","name":"Administrador","role":"Owner"}]}
```

### Pasos

1. Sube este directorio a un repositorio GitHub nuevo.
2. En Vercel crea un proyecto importando ese repo.
3. Deja `Build Command` en `npm run build`.
4. Deja `Output Directory` en `dist`.
5. Carga las variables de entorno anteriores en `Settings > Environment Variables`.
6. Haz el primer deploy.

### Como quedara

- frontend en el dominio de Vercel
- API en `https://tu-dominio.vercel.app/api/...`
- el frontend ya llama a `/api/...`, asi que no necesitas cambiar `src/api.js`
