# Micro-Service — Arquitectura de Microservicios (Node.js + Docker)

Sistema distribuido compuesto por un **API Gateway** y **tres microservicios
independientes**, cada uno con **su propia base de datos MongoDB**.

## Arquitectura

```
                        ┌──────────────────────────┐
   Cliente  ───────────▶│   API Gateway  :8080     │   único punto de entrada
   (Postman/curl)       │   enrutamiento + salud   │
                        └──┬────────┬───────────┬──┘
             /customer/*   │        │           │   /shopping/*
                           │   /products/*      │
                           ▼        ▼           ▼
                    ┌───────────┐ ┌──────────┐ ┌──────────┐
                    │ customers │ │ products │ │ shopping │
                    │   :8000   │ │  :8002   │ │  :8001   │
                    └─────┬─────┘ └────┬─────┘ └────┬─────┘
                          ▼            ▼            ▼
                    ┌───────────┐ ┌──────────┐ ┌──────────┐
                    │customers- │ │products- │ │shopping- │
                    │    db     │ │    db    │ │    db    │
                    │  mongo:7  │ │ mongo:7  │ │ mongo:7  │
                    └───────────┘ └──────────┘ └──────────┘
                            red bridge: micro-service-net
```

| Servicio    | Puerto | Mongo (host) | Responsabilidad                    | Prefijo público |
|-------------|--------|--------------|------------------------------------|-----------------|
| `gateway`   | 8080   | —            | Enrutamiento y salud agregada      | —               |
| `customers` | 8000   | 27018        | Registro, login, perfil, direcciones | `/customer`   |
| `shopping`  | 8001   | 27019        | Órdenes de compra                  | `/shopping`     |
| `products`  | 8002   | 27017        | Catálogo de productos              | `/products`     |

**Una base de datos por microservicio, sin esquema compartido.** Es el requisito
que distingue una arquitectura de microservicios real de un monolito repartido:
ningún servicio puede leer la colección de otro.

## Estructura de cada microservicio

```
<servicio>/
├── index.js               # punto de entrada: conecta DB y arranca Express
├── package.json
├── Dockerfile
├── docker-compose.yml     # levanta ESTE servicio junto a su Mongo
├── .env.example
└── src/
    ├── api/               # capa HTTP: routers y middlewares
    │   ├── <dominio>.js
    │   └── middlewares/auth.js
    ├── config/index.js    # variables de entorno + requireVars
    ├── database/
    │   ├── connection.js
    │   ├── models/        # esquemas de Mongoose
    │   └── repository/    # acceso a datos
    ├── services/          # lógica de negocio
    ├── utils/             # helpers, errores y manejador de errores
    └── express-app.js     # ensamblado de middlewares y rutas
```

Flujo de una petición: `api` → `services` → `repository` → `models`.
Cada capa solo conoce a la siguiente.

## Arranque completo

```bash
docker compose up --build          # levanta los 7 contenedores
docker compose exec products npm run seed   # carga 10 productos de ejemplo
```

Detener:

```bash
docker compose down          # conserva los datos en los volúmenes
docker compose down -v       # elimina también las bases de datos
```

## Levantar un microservicio de forma aislada

Cada carpeta trae su propio `docker-compose.yml` con su Mongo:

```bash
cd products && docker compose up --build
```

## Endpoints

Todos pasan por el Gateway en `http://localhost:8080`.

### Salud y agregación
| Método | Ruta               | Auth | Descripción                                    |
|--------|--------------------|------|------------------------------------------------|
| GET    | `/health`          | —    | Estado del Gateway                             |
| GET    | `/health/services` | —    | Estado agregado de los 3 servicios             |
| GET    | `/profile`         | JWT  | **Composición**: perfil + órdenes + catálogo   |

`GET /profile` lo resuelve el propio Gateway, no se reenvía a nadie: combina
`customers` (perfil y direcciones), `shopping` (órdenes) y `products` (estado
actual de cada producto comprado) en una sola respuesta. Al frontend le ahorra
tres viajes y le indica si el precio cambió desde la compra:

```json
{
  "customer": { "email": "...", "address": [...] },
  "orders": [{ "txnId": "TXN-A", "items": [{
      "price": 18000,
      "currentProduct": { "price": 21500, "available": false },
      "priceChanged": true }] }],
  "totals": { "orders": 2, "spent": 50000 },
  "sources": { "customers": true, "shopping": true, "products": true }
}
```

### Customers
| Método | Ruta                | Auth | Descripción                   |
|--------|---------------------|------|-------------------------------|
| POST   | `/customer/signup`  | —    | Registro; devuelve JWT        |
| POST   | `/customer/login`   | —    | Autenticación; devuelve JWT   |
| POST   | `/customer/address` | JWT  | Agrega una dirección          |
| GET    | `/customer/profile` | JWT  | Perfil con direcciones        |
| GET    | `/customer/summary` | JWT  | Carrito, wishlist y órdenes   |
| GET    | `/customer/wishlist`| JWT  | Lista de deseos               |

### Products
| Método | Ruta            | Auth | Descripción                     |
|--------|-----------------|------|---------------------------------|
| GET    | `/products`     | —    | Catálogo completo y categorías  |
| GET    | `/products/:id` | —    | Detalle de un producto          |

### Shopping
| Método | Ruta               | Auth | Descripción                |
|--------|--------------------|------|----------------------------|
| POST   | `/shopping/order`  | JWT  | Crea una orden             |
| GET    | `/shopping/orders` | JWT  | Órdenes del usuario actual |

## Prueba del flujo completo

```bash
# 1. Registro
TOKEN=$(curl -s -X POST http://localhost:8080/customer/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@uni.edu.co","password":"secreta123","phone":"3001234567"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# 2. Catálogo
curl -s http://localhost:8080/products | python3 -m json.tool

# 3. Perfil autenticado
curl -s http://localhost:8080/customer/profile -H "Authorization: Bearer $TOKEN"

# 4. Crear una orden
curl -s -X POST http://localhost:8080/shopping/order \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"txnId":"TXN-001","amount":18000,"items":[{"productId":"<id>","name":"Sedan","price":18000,"quantity":1}]}'

# 5. Órdenes del usuario
curl -s http://localhost:8080/shopping/orders -H "Authorization: Bearer $TOKEN"
```

## Enrutamiento del Gateway

Se usa **`express-http-proxy`**. Un detalle que no es evidente: Express recorta
el prefijo de montaje antes de entregar la petición al proxy, así que

```js
app.use('/customer', proxy(CUSTOMERS_URL));   // ❌ reenvía a /profile → 404
```

falla, porque el microservicio monta su router en `/customer` y esperaría
`/customer/profile`. Hay que reconstruir el prefijo:

```js
app.use('/customer', proxy(CUSTOMERS_URL, {
    proxyReqPathResolver: (req) => `/customer${req.url}`,   // ✅
}));
```

## Tolerancia a fallos

Al detener un microservicio el sistema sigue operando parcialmente — es la
ventaja concreta de esta arquitectura frente a un monolito:

```bash
docker compose stop products
```

| Endpoint             | Con `products` caído                        |
|----------------------|---------------------------------------------|
| `/customer/login`    | ✅ funciona                                  |
| `/customer/profile`  | ✅ funciona                                  |
| `/shopping/orders`   | ✅ funciona                                  |
| `/products`          | ❌ 502 controlado, no cuelga                 |
| `/health/services`   | ✅ reporta `products: down`                  |
| `/profile`           | ⚠️ responde igual, sin enriquecer, con `warnings` |

```bash
docker compose start products   # se recupera solo
```

## Autenticación entre servicios

`customers` **emite** el JWT en signup/login; `shopping` lo **valida** por su
cuenta con el mismo `APP_SECRET`. No hay llamada entre servicios ni base de
datos compartida para autenticar: el token es autocontenido. Por eso ambos
contenedores reciben el mismo `APP_SECRET` en `docker-compose.yml`.

El Gateway **no valida ni decodifica el token**: reenvía la cabecera
`Authorization` tal cual (*passthrough*) y deja la verificación a cada
microservicio. Mantiene el Gateway sin estado y sin conocimiento del dominio.

## Red: `host.docker.internal` vs DNS de servicio

| Modo de arranque                       | URLs que usa el Gateway              |
|----------------------------------------|--------------------------------------|
| Cada servicio con su propio compose     | `http://host.docker.internal:800X`   |
| Compose raíz (los 7 juntos)             | `http://customers:8000`, etc.        |

Cuando cada microservicio se levanta con **su propio** `docker-compose.yml`,
queda en una red de Docker distinta y el Gateway no puede resolverlo por nombre
de servicio: sale al host y vuelve a entrar por el puerto publicado. En Linux
`host.docker.internal` no existe por defecto, de ahí `extra_hosts`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Con el compose raíz los 7 contenedores comparten red, así que se usa el DNS
interno de Docker: sin salto al host, y funciona aunque los puertos no estén
publicados. Como las URLs vienen de variables de entorno, **el mismo código
sirve en los dos modos**.

## Formato de respuestas y errores

Los servicios envuelven el resultado con `FormateData(data)` y el router
devuelve `data` directamente. Los errores se centralizan en `HandleErrors`:

```json
{ "message": "Invalid credentials" }
```

| Código | Cuándo                                   |
|--------|------------------------------------------|
| 400    | `BadRequestError` — datos inválidos       |
| 401    | `UnauthorizedError` — token ausente/inválido |
| 404    | `NotFoundError` — recurso inexistente     |
| 500    | `APIError` — error no controlado          |
| 502    | `BadGatewayError` — microservicio caído   |

## Variables de entorno

| Variable        | Servicios              | Descripción                       |
|-----------------|------------------------|-----------------------------------|
| `PORT`          | todos                  | Puerto de escucha                 |
| `DB_URL`        | customers, products, shopping | Cadena de conexión a Mongo |
| `APP_SECRET`    | customers, shopping    | Secreto de firma del JWT          |
| `CUSTOMERS_URL` | gateway                | URL interna de customers          |
| `SHOPPING_URL`  | gateway                | URL interna de shopping           |
| `PRODUCTS_URL`  | gateway                | URL interna de products           |

`src/config/index.js` valida con `requireVars(...)` que las obligatorias existan
y aborta el arranque si falta alguna, en lugar de fallar más tarde en runtime.
