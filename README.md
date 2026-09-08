# micro-services — Arquitectura de Microservicios (Node.js + Docker)

[![CI](https://github.com/juancamilohurtado04/micro-services/actions/workflows/ci.yml/badge.svg)](https://github.com/juancamilohurtado04/micro-services/actions/workflows/ci.yml)

Sistema distribuido compuesto por un **API Gateway** y **tres microservicios
independientes**, cada uno con **su propia base de datos MongoDB**.

El cliente web vive en un repositorio aparte:
**[frontend-enfasis-i](https://github.com/juancamilohurtado04/frontend-enfasis-i)**,
y consume este sistema exclusivamente por el gateway.

## Qué hace el sistema

Una tienda de vehículos: un visitante navega el catálogo, se registra, arma un
carrito, guarda favoritos y crea una orden. Está partido en tres dominios que
se pueden desplegar, escalar y romper por separado.

| Dominio | Qué posee | Por qué es un dominio propio |
|---|---|---|
| `customers` | Cuenta, credenciales, direcciones, carrito y wishlist | Es el único que toca datos personales y el único que emite tokens |
| `products` | Catálogo e inventario | Es público y de solo lectura: distinto perfil de carga y cero criptografía |
| `shopping` | Órdenes | Es el registro histórico de las transacciones: se escribe una vez y no se modifica |

El corte se hizo por **propiedad del dato y ciclo de vida**, no por capas
técnicas. Un catálogo que se lee miles de veces y se escribe poco no tiene nada
que ver con un registro de órdenes que se escribe una vez y se conserva para
siempre.

## Arquitectura

```
   Navegador / Postman
            │
            │  (el único puerto que el cliente conoce)
            ▼
  ┌──────────────────────────┐
  │   API Gateway  :8000     │  punto de entrada único
  │   rutas · cors() · /profile
  └──┬────────┬───────────┬──┘
     │        │           │
 /customer/*  │      /shopping/*
     │   /products/*      │
     ▼        ▼           ▼
┌───────────┐ ┌──────────┐ ┌──────────┐
│ customers │ │ products │ │ shopping │
│   :8001   │ │  :8002   │ │  :8003   │
└─────┬─────┘ └────┬─────┘ └────┬─────┘
      │            │  ▲         │
      │            │  └─────────┘
      │            │   HTTP: products-client.js
      ▼            ▼            ▼
┌───────────┐ ┌──────────┐ ┌──────────┐
│customers- │ │products- │ │shopping- │
│    db     │ │    db    │ │    db    │
│  mongo:7  │ │ mongo:7  │ │ mongo:7  │
└───────────┘ └──────────┘ └──────────┘
```

| Servicio | Puerto | Mongo (host) | Responsabilidad | Prefijo público |
|---|---|---|---|---|
| `gateway` | **8000** | — | Enrutamiento, CORS, salud y composición | — |
| `customers` | 8001 | 27018 | Registro, login, perfil, direcciones, carrito, wishlist | `/customer` |
| `products` | 8002 | 27017 | Catálogo de vehículos | `/products` |
| `shopping` | 8003 | 27019 | Órdenes de compra | `/shopping` |

## Las tres reglas

### 1. Una base de datos por servicio

Tres Mongo separados. Ningún servicio consulta la colección de otro, y no hay
esquema compartido. Es lo que distingue una arquitectura de microservicios de
un monolito repartido en carpetas.

### 2. Un dominio accede a otro solo por su capa de servicio pública

`shopping` necesita precios del catálogo para validar una orden. Los pide por
**HTTP a la API pública de `products`**, desde
[`shopping/src/clients/products-client.js`](shopping/src/clients/products-client.js) —
nunca a su repositorio ni a su base.

Esa es la única comunicación entre servicios del sistema. El gateway compone
`customers` + `shopping`, pero no entra a enriquecer datos de un dominio ajeno:
las órdenes son de `shopping`, así que es `shopping` quien las completa.

### 3. Degradación, no caída

Apagar un servicio no puede tumbar el sistema. Pero la degradación **no es la
misma en lectura que en escritura**:

| Operación | Con `products` apagado | Por qué |
|---|---|---|
| `GET /profile` | 200, con el historial completo y un `warnings` | El perfil vive en `customers`; el precio actual es un extra |
| `GET /shopping/orders` | 200, con `currentProduct: null` | La orden guardó su precio histórico al crearse |
| `POST /shopping/order` | **503, no se guarda nada** | Sin catálogo no hay precio verificable |

Crear una orden con un importe que nadie pudo validar es peor que no crearla.
El razonamiento completo está en la
[bitácora de depuración](docs/bitacora-depuracion.md#4-la-degradación-era-la-misma-en-lectura-que-en-escritura).

## Requisitos

- Docker y Docker Compose
- Node.js 22 o superior (solo para correr las pruebas fuera de Docker)

## Arranque desde cero

Cada servicio es autónomo y trae su propio `docker-compose.yml` con su Mongo.
No hay compose raíz ni workspaces: se levantan de uno en uno, en este orden.

```bash
# 1. Las bases y los servicios de dominio, cada uno en su carpeta
cd products  && cp .env.example .env && docker compose up -d --build && cd ..
cd customers && cp .env.example .env && docker compose up -d --build && cd ..
cd shopping  && cp .env.example .env && docker compose up -d --build && cd ..

# 2. El catálogo de ejemplo
cd products && docker compose exec products npm run seed && cd ..

# 3. La puerta de entrada, al final: necesita a los tres arriba
cd gateway && cp .env.example .env && docker compose up -d --build && cd ..

# 4. Comprobación
curl -s http://localhost:8000/health/services | python3 -m json.tool
```

> **Antes del paso 1:** edita `customers/.env` y `shopping/.env` y pon el
> **mismo** valor en `APP_SECRET`. Los `.env.example` lo traen vacío a
> propósito: los secretos no se versionan. Si falta, el contenedor muere al
> arrancar con `Missing required config vars: APP_SECRET` — es el `fail-fast`
> haciendo su trabajo.

Detener:

```bash
cd <servicio> && docker compose down      # conserva los volúmenes
cd <servicio> && docker compose down -v   # borra también la base
```

## Variables de entorno

Hay un `.env.example` por servicio, con el nombre de cada variable y para qué
sirve. Los `.env` reales están en `.gitignore` y **no se versionan**.

| Variable | Servicios | Descripción |
|---|---|---|
| `PORT` | todos | Puerto de escucha |
| `DB_URL` | customers, products, shopping | Cadena de conexión a su Mongo |
| `APP_SECRET` | customers, shopping | Secreto del JWT. **El mismo en los dos** |
| `CUSTOMERS_URL` | gateway | URL interna de customers |
| `PRODUCTS_URL` | gateway, **shopping** | URL interna de products |
| `SHOPPING_URL` | gateway | URL interna de shopping |

`products` **no** tiene `APP_SECRET`: es el catálogo público, no autentica, no
firma y no verifica nada.

`src/config/index.js` valida con `requireVars(...)` que las obligatorias
existan y aborta el arranque si falta alguna, en lugar de fallar más tarde en
runtime. Un contenedor que no puede funcionar debe morir rápido y ruidoso.

## Estructura de cada microservicio

Cada servicio es una unidad autónoma: su `package.json`, su `node_modules`, su
`Dockerfile`, su `docker-compose.yml`, su `.env.example` y su Mongo. Sin
`shared/` y sin workspaces.

```
<servicio>/
├── index.js               # punto de entrada: requireVars, conecta DB, arranca Express
├── package.json           # solo las dependencias que ESTE servicio usa
├── Dockerfile
├── docker-compose.yml     # levanta ESTE servicio junto a su Mongo
├── .dockerignore
├── .env.example
├── jest.config.js
├── __tests__/
│   ├── helpers/           # Mongo en memoria, env de pruebas y utilidades
│   ├── unit/              # capa de servicio con la de datos mockeada
│   └── integration/       # endpoints HTTP con supertest
└── src/
    ├── api/               # capa HTTP: routers y middlewares
    ├── clients/           # solo shopping: cliente HTTP hacia otro dominio
    ├── config/index.js    # variables de entorno + requireVars
    ├── database/
    │   ├── connection.js
    │   ├── models/        # esquemas de Mongoose
    │   └── repository/    # acceso a datos
    ├── services/          # lógica de negocio
    ├── utils/             # helpers, errores y manejador de errores
    └── express-app.js     # ensamblado de middlewares y rutas
```

### Las cuatro capas, en un solo sentido

```
api  →  service  →  repository  →  model
```

- **`api`** traduce HTTP a llamadas de negocio. No menciona Mongoose ni conoce
  los modelos. Extrae del request, delega y devuelve.
- **`service`** tiene la lógica: valida reglas, calcula importes, decide qué
  pasa cuando una dependencia no responde. No importa `mongoose`.
- **`repository`** es el **único** que toca el modelo. Es la frontera con el
  motor de persistencia.
- **`model`** es el esquema de Mongoose.

**Por qué el repository es el único que toca el modelo.** Porque es lo que
permite que el resto del servicio no sepa que existe MongoDB. La capa de
negocio se prueba sin base de datos —los tests unitarios mockean el
repositorio— y cambiar de motor toca un archivo por dominio en vez de todos.
Cuando esa frontera se rompe se nota enseguida: `shopping-service.js` generaba
sus propios `ObjectId` de Mongoose, y con eso la lógica de negocio quedaba
atada al motor por una sola línea
([bitácora #8](docs/bitacora-depuracion.md#8-la-capa-de-servicio-conocía-mongoose)).

### Dependencias: solo lo que cada servicio usa

| Servicio | Dependencias |
|---|---|
| `products` | `dotenv`, `express`, `mongoose` — **3** |
| `shopping` | `dotenv`, `express`, `jsonwebtoken`, `mongoose` — 4 |
| `customers` | `bcryptjs`, `dotenv`, `express`, `jsonwebtoken`, `mongoose` — **5** |
| `gateway` | `cors`, `dotenv`, `express`, `express-http-proxy` — 4 |

Que el catálogo no cargue criptografía no es casualidad: no la necesita, y
llevarla sería superficie de ataque y tiempo de build por nada. `shopping`
tiene `jsonwebtoken` solo para **verificar**.

## Seguridad

- **Contraseñas hasheadas con `bcryptjs`**, nunca en claro, ni en la base ni en
  los logs. Solo `customers` lo hace.
- **Solo `customers` firma el JWT.** `shopping` lo verifica por su cuenta con
  el mismo `APP_SECRET`, sin llamar a nadie: el token es autocontenido. Ningún
  archivo fuera de `customers` contiene `jwt.sign`, y hay una guarda en la CI
  que lo comprueba.
- **El gateway no interpreta el token.** Reenvía la cabecera `Authorization`
  tal cual y deja la verificación a cada microservicio. Se mantiene sin estado
  y sin conocimiento del dominio.
- **El precio lo pone el catálogo, no el cliente.** `POST /shopping/order` no
  acepta `amount`: lo calcula `shopping` con lo que responde `products`
  ([bitácora #2](docs/bitacora-depuracion.md#2-el-importe-de-la-orden-lo-ponía-el-cliente)).
- **Sin secretos versionados.** `.env` ignorado; los compose interpolan
  `${APP_SECRET:?...}` desde el `.env` local.
- **Configuración fail-fast:** `requireVars` como primera línea del arranque.

### Por qué `cors()` va solo en el gateway

CORS es una declaración de *quién puede llamarme desde un navegador*. Solo un
componente recibe peticiones de un origen web: el gateway. Los microservicios
viven detrás y nadie fuera de la red interna debería alcanzar el `8001`, el
`8002` ni el `8003`.

Poner `cors()` en un microservicio es afirmar lo contrario: que se le puede
llamar directamente desde el navegador. Contradice el punto de entrada único y
convierte una decisión de seguridad en algo repetido en cuatro sitios, que es
donde empiezan a divergir. Con una sola política, cambiar los orígenes
permitidos es cambiar una línea.

Hay una guarda en la CI que falla si `cors` reaparece en `*/src` de cualquier
servicio.

## Endpoints

Todos pasan por el Gateway en `http://localhost:8000`.

### Salud y composición

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Estado del Gateway |
| GET | `/health/services` | — | Estado agregado de los 3 servicios |
| GET | `/profile` | JWT | **Composición**: perfil + órdenes |

`GET /profile` lo resuelve el propio Gateway: llama en paralelo a `customers`
(cuenta, direcciones, carrito, wishlist) y a `shopping` (órdenes, ya
enriquecidas por él con el catálogo) y devuelve una sola respuesta. Al cliente
le ahorra dos viajes y la lógica de unirlos.

```json
{
  "customer": { "email": "...", "address": [], "cart": [], "wishlist": [] },
  "orders": [{ "txnId": "TXN-A", "items": [{
      "price": 18000,
      "currentProduct": { "price": 21500, "available": false },
      "priceChanged": true }] }],
  "totals": { "orders": 2, "spent": 50000 },
  "sources": { "customers": true, "shopping": true, "products": true }
}
```

`sources` dice qué servicios respondieron. Cuando alguno falla aparece un
campo `warnings` con mensajes legibles, y el frontend los pinta como aviso en
vez de dejar la pantalla vacía.

La única dependencia dura es `customers`: sin la cuenta no hay perfil que
componer, así que ahí sí se responde 502.

### Customers

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/customer/signup` | — | Registro; devuelve JWT |
| POST | `/customer/login` | — | Autenticación; devuelve JWT |
| POST | `/customer/address` | JWT | Agrega una dirección |
| GET | `/customer/profile` | JWT | Perfil con direcciones |
| GET | `/customer/summary` | JWT | Carrito, wishlist y órdenes |
| GET | `/customer/wishlist` | JWT | Lista de deseos |
| PUT | `/customer/wishlist` | JWT | Agrega un producto a favoritos |
| DELETE | `/customer/wishlist/:productId` | JWT | Quita un producto de favoritos |
| GET | `/customer/cart` | JWT | Carrito actual |
| PUT | `/customer/cart` | JWT | Fija la cantidad de un producto |
| DELETE | `/customer/cart` | JWT | Vacía el carrito |
| DELETE | `/customer/cart/:productId` | JWT | Quita un producto del carrito |

### Products

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/products` | — | Catálogo completo y categorías |
| GET | `/products/:id` | — | Detalle de un producto |

### Shopping

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/shopping/order` | JWT | Crea una orden. **No acepta `amount`** |
| GET | `/shopping/orders` | JWT | Órdenes del usuario, con el precio actual |

## Prueba del flujo completo

```bash
# 1. Registro
TOKEN=$(curl -s -X POST http://localhost:8000/customer/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@uni.edu.co","password":"secreta123","phone":"3001234567"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# 2. Catálogo — y guardamos el id del primer vehículo
PID=$(curl -s http://localhost:8000/products \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["products"][0]["_id"])')

# 3. Al carrito
curl -s -X PUT http://localhost:8000/customer/cart \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"product\":{\"_id\":\"$PID\"},\"qty\":1}"

# 4. Crear la orden — sin amount: lo calcula shopping contra products
curl -s -X POST http://localhost:8000/shopping/order \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"txnId\":\"TXN-001\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}]}"

# 5. El perfil compuesto, con el historial
curl -s http://localhost:8000/profile -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

### Y el recorrido con un servicio caído

```bash
cd products && docker compose stop products && cd ..

curl -s http://localhost:8000/profile -H "Authorization: Bearer $TOKEN"
# → 200. Perfil, carrito y wishlist completos. Las órdenes siguen ahí,
#   con currentProduct: null y un warnings explicando por qué.

curl -s -X POST http://localhost:8000/shopping/order \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"txnId\":\"TXN-002\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}]}"
# → 503. La orden NO se crea: sin catálogo no hay precio verificable.

cd products && docker compose start products && cd ..   # se recupera solo
```

| Endpoint | Con `products` caído |
|---|---|
| `/customer/login` | ✅ funciona |
| `/customer/profile` | ✅ funciona |
| `/shopping/orders` | ✅ funciona, sin `currentProduct` |
| `/products` | ❌ 502 controlado, no cuelga |
| `/health/services` | ✅ reporta `products: down` |
| `/profile` | ⚠️ responde igual, con `warnings` |
| `POST /shopping/order` | ⛔ 503 deliberado |

## Pruebas

Cada microservicio tiene su propia suite con **Jest** y **Supertest**. Las
pruebas de integración levantan un **MongoDB en memoria**
(`mongodb-memory-server`): no tocan la base de desarrollo ni requieren Docker.

```bash
cd <servicio>          # gateway | customers | products | shopping
npm install
npm test               # toda la suite
npm run test:unit
npm run test:integration
npm run test:coverage
```

| Servicio | Pruebas |
|---|---|
| customers | 110 |
| shopping | 89 |
| gateway | 49 |
| products | 33 |
| **Total** | **281** |

**Cómo están organizadas**

- `__tests__/unit/` — la capa de servicio, los middlewares y los helpers con
  las dependencias reemplazadas por dobles: sin Mongo y sin red.
- `__tests__/integration/` — la app real de Express contra Mongo en memoria,
  vía Supertest: códigos de estado, autenticación, persistencia y consultas.
  En `shopping`, `products` se sustituye en su frontera real (`fetch`), así que
  todo lo demás sigue siendo el código de verdad.
- `__tests__/helpers/` — `global-setup`/`global-teardown` arrancan y apagan una
  única instancia de Mongo por corrida; `db.js` conecta, limpia entre pruebas y
  cierra; `auth.js` firma tokens válidos para el middleware `UserAuth`.

En el gateway no hay base de datos: las pruebas de integración levantan
microservicios *stub* reales en puertos efímeros para ejercitar el proxy, la
composición de `/profile` y la degradación cuando un servicio está caído.

La primera ejecución descarga el binario de MongoDB (~120 MB) y lo deja
cacheado en `~/.cache/mongodb-binaries`.

## Integración continua

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre en cada push y
cada PR contra `main`, con dos trabajos.

**`test`** — una matriz de cuatro jobs, uno por servicio, en paralelo. Cada uno
hace `npm ci` y `npm test` en su carpeta: se prueban de forma independiente,
igual que se despliegan.

**`arquitectura`** — las reglas de diseño convertidas en guardas ejecutables,
para que no dependan de que alguien se acuerde en la revisión:

| Guarda | Qué impide |
|---|---|
| `cors()` solo en el gateway | Que un microservicio se anuncie como llamable desde el navegador |
| `products` sin criptografía | Que el catálogo vuelva a cargar `bcryptjs` o `jsonwebtoken` |
| Solo `customers` firma | Que aparezca un `jwt.sign` en otro servicio |
| Ningún servicio referencia otra base | Que alguien apunte a la Mongo de otro dominio |
| Ningún `.env` versionado | Que se cuele un secreto en el repositorio |

## Enrutamiento del Gateway

La tabla de rutas está en
[`gateway/src/routes/index.js`](gateway/src/routes/index.js), con las rutas
específicas antes que las genéricas: `/health` y `/profile` se registran antes
que el proxy, o el proxy se las tragaría.

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

## Red: `host.docker.internal`

Cada microservicio se levanta con **su propio** `docker-compose.yml`, así que
queda en una red de Docker distinta y el gateway no puede resolverlo por nombre
de servicio: sale al host y vuelve a entrar por el puerto publicado. En Linux
`host.docker.internal` no existe por defecto, de ahí `extra_hosts`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Como las URLs vienen de variables de entorno, el mismo código sirve si algún
día los contenedores comparten red: bastaría con cambiar `CUSTOMERS_URL` a
`http://customers:8001`.

## Formato de respuestas y errores

Los servicios envuelven el resultado con `FormateData(data)` y el router
devuelve `data` directamente. Los errores se centralizan en `HandleErrors`:

```json
{ "message": "Invalid credentials" }
```

| Código | Cuándo |
|---|---|
| 400 | `BadRequestError` — datos inválidos |
| 401 | `UnauthorizedError` — token ausente o inválido |
| 404 | `NotFoundError` — recurso inexistente |
| 500 | `APIError` — error no controlado |
| 502 | `BadGatewayError` — el gateway no alcanzó un microservicio |
| 503 | `ServiceUnavailableError` — un servicio no alcanzó a su dependencia |

La diferencia entre 502 y 503 importa: el 502 lo emite el gateway cuando el
servicio destino no responde; el 503 lo emite un servicio sano cuya dependencia
está caída. Los dos son temporales y el frontend los traduce a "es un problema
del servicio, no de tus datos".

## Bitácora de depuración

Los fallos encontrados durante la integración, con su causa raíz y su
corrección, están en **[docs/bitacora-depuracion.md](docs/bitacora-depuracion.md)**.
Incluye una hipótesis que resultó equivocada y cómo se descartó midiendo.

## Repositorios

- **micro-services** (este) — gateway y los tres microservicios
- **[frontend-enfasis-i](https://github.com/juancamilohurtado04/frontend-enfasis-i)** — cliente React + Vite
