# Bitácora de depuración — integración del MVP

Registro de los fallos encontrados al integrar el backend con
`frontend-enfasis-i` y al revisar el sistema contra los criterios de la entrega
final. Cada entrada sigue el mismo formato: **síntoma → causa → corrección**, y
termina en la evidencia de que quedó cerrada.

El criterio no es la ausencia de fallos, sino entender la causa raíz. Por eso
aquí también está anotado un diagnóstico que resultó **equivocado** (entrada 9):
la hipótesis parecía sólida y la medición la desmintió.

---

## 1. `customers` ocupaba el puerto reservado al gateway

**Síntoma.** El gateway estaba configurado en el `8080` y `customers` en el
`8000`. Con esa distribución, mover el gateway a su puerto (`8000`) era
imposible sin que uno de los dos fallara al arrancar con `EADDRINUSE`; el
frontend, además, apuntaba a `http://localhost:8080`.

**Causa.** Los puertos se asignaron por orden de creación de los servicios, no
por rol. `customers` fue el primer microservicio que existió y se quedó con el
`8000`; cuando después apareció el gateway, se le dio el primer puerto libre
que no chocara. El puerto dejó de decir nada sobre la arquitectura: el número
más "principal" lo tenía un servicio interno, y la puerta de entrada estaba
escondida en un puerto arbitrario.

**Corrección.** Rotación completa, asignando el puerto por rol y no por
antigüedad:

| Servicio | Antes | Ahora |
|---|---|---|
| gateway | 8080 | **8000** |
| customers | 8000 | 8001 |
| products | 8002 | 8002 |
| shopping | 8001 | 8003 |

Tocó `.env.example`, `docker-compose.yml`, `EXPOSE` del `Dockerfile` y el valor
por defecto de `src/config/index.js` de cada servicio, más `VITE_API_URL` en el
frontend. Ahora el único puerto que el navegador conoce es el `8000`, y los
internos forman un bloque contiguo detrás de él.

---

## 2. El importe de la orden lo ponía el cliente

**Síntoma.** El endpoint `POST /shopping/order` aceptaba `amount` en el cuerpo
de la petición y lo guardaba tal cual. La única validación era
`amount > 0`. Una petición con el precio manipulado se persistía sin que nada
la detuviera:

```bash
# Con la implementación anterior: un sedán de $18.000.000 por mil pesos.
curl -X POST localhost:8000/shopping/order -H "Authorization: Bearer $TOKEN" \
  -d '{"txnId":"x","amount":1000,"items":[{"productId":"p1","price":1000,"quantity":1}]}'
```

**Causa.** Es la herencia directa del monolito. Cuando todo vivía en el mismo
proceso, el carrito y el catálogo compartían memoria y el precio que llegaba al
módulo de órdenes ya venía de la fuente correcta. Al partir el sistema, ese
camino se cortó: `shopping` quedó sin ninguna forma de conocer el catálogo, y
en vez de darle una, se dejó que el precio viniera del cliente. El síntoma es
de seguridad, pero la causa es la frontera entre dominios que faltaba —
exactamente el mismo hueco que la entrada 3.

**Corrección.** El importe dejó de ser un campo de entrada. El cliente manda
solo `productId` y `quantity`; `shopping` consulta el catálogo y calcula el
total con los precios que le da `products`. Los campos `name` y `price` que
llegan en la petición se ignoran.

De paso, la validación se volvió real: se rechaza con 400 un producto que no
está en el catálogo y uno marcado como no disponible.

**Evidencia.** `shopping/__tests__/unit/shopping-service.test.js` →
*"calcula el importe con el precio de products e ignora el que envíe el
cliente"*, y su equivalente de integración.

---

## 3. `shopping` no tenía forma de hablar con `products`

**Síntoma.** El enunciado pide `clients/products-client.js` y la regla "un
dominio accede a otro solo por su capa de servicio pública". Al buscar la
implementación no existía: `grep -rn "fetch\|axios\|PRODUCTS" shopping/src` no
devolvía nada. La composición entre dominios se hacía **solo** en el gateway,
que consultaba `products` para enriquecer las órdenes.

**Causa.** El gateway resolvía el problema visible —el frontend necesitaba las
órdenes con el precio actual— por el camino más corto. Pero las órdenes son de
`shopping`: que el gateway saliera a completar los datos de un dominio ajeno lo
convertía en algo más que una puerta de entrada, y dejaba a `shopping`
incapaz de validar sus propias reglas de negocio (de ahí la entrada 2).

**Corrección.** Se creó `shopping/src/clients/products-client.js`, con tres
funciones y una distinción que importa:

- `GetProduct` / `GetProductsByIds` — consulta **obligatoria**. Si el catálogo
  no responde, propaga un 503.
- `TryGetProductsByIds` — consulta **opcional**. Si el catálogo no responde,
  devuelve un mapa vacío y la operación continúa.

Un 404 del catálogo no se trata como caída: significa "ese producto no existe",
que es una respuesta válida. Confundirlo haría que un id mal escrito se
reportara como servicio no disponible.

El gateway se quedó con lo suyo: componer `customers` + `shopping` y tolerar
fallos. Ya no llama a `products`, y hay una prueba que lo comprueba
(*"no consulta a products al componer el perfil"*).

---

## 4. La degradación era la misma en lectura que en escritura

**Síntoma.** Al implementar la entrada 3 apareció la pregunta: si `products`
está caído, ¿qué hace `shopping`? Aplicar "degradación, no caída" en todas
partes lleva a crear órdenes con precios sin verificar, que es justo lo que
arregla la entrada 2.

**Causa.** "Degradación, no caída" es una buena regla, pero no es universal:
depende de si la operación **lee** o **escribe**. Aplicarla a ciegas convierte
una virtud en un agujero.

**Corrección.** Dos comportamientos distintos y deliberados:

| Operación | `products` caído | Por qué |
|---|---|---|
| `GET /shopping/orders` | 200 con el historial completo, `currentProduct: null` | La orden ya guardó su precio histórico; el actual es un extra |
| `POST /shopping/order` | 503, no se guarda nada | Una orden con un importe que nadie pudo verificar es peor que ninguna orden |

El precio y el nombre quedan **congelados** en la orden al crearla. Eso hace
que el historial siga siendo legible aunque el catálogo cambie después o esté
apagado, y es lo que permite degradar en la lectura sin perder información.

---

## 5. El catálogo caído dejaba la página cargando para siempre

**Síntoma.** Con `products` apagado, `/vehicles` mostraba el esqueleto de carga
indefinidamente. Ni error, ni mensaje, ni forma de reintentar. En la consola
había un `console.log(err)` y nada más.

**Causa.** El estado de carga era una deducción:

```js
const loading = products.length === 0;   // ❌
```

Un arreglo vacío tiene tres significados distintos —todavía no se ha pedido,
se está pidiendo, y se pidió y falló— y esa línea los colapsa en uno solo. La
petición fallaba, el arreglo se quedaba vacío, y la interfaz concluía "sigue
cargando". Los ocho `catch` de `shopping-actions.js` hacían `console.log(err)`,
así que el fallo nunca llegaba al store.

**Corrección.** Se cambió el booleano deducido por un estado explícito
(`idle | loading | ready | error`), y ningún `catch` se traga ya el error:
todos despachan un mensaje traducido por `describeApiError()`.

| Estado | Qué se pinta |
|---|---|
| `idle` / `loading` | Esqueleto |
| `error` | `ErrorState` con el motivo y botón *Reintentar* |
| `ready` | El catálogo (vacío si de verdad no hay nada) |

Lo mismo en el detalle de producto y en el perfil. Los `warnings` que manda el
gateway cuando compuso el perfil con un servicio caído se pintan como
`Notice`: la pantalla sirve, pero avisa de lo que falta.

---

## 6. `products` se negaba a arrancar sin un secreto que nunca usaba

**Síntoma.** `products/index.js` tenía
`requireVars('PORT', 'DB_URL', 'APP_SECRET')`. Sin `APP_SECRET` el contenedor
moría al arrancar:

```
Missing required config vars: APP_SECRET
```

Pero `grep -rn "APP_SECRET" products/src` solo encontraba la línea que lo lee
en el config. El servicio jamás lo usaba.

**Causa.** Los tres servicios se crearon copiando el mismo esqueleto, y con él
se copió la lista de variables obligatorias. El `fail-fast` funcionaba, pero
sobre un requisito falso.

**Corrección.** `APP_SECRET` fuera de `products`: del `config`, del
`requireVars`, del `.env.example`, del `docker-compose.yml` y del setup de
pruebas. El catálogo es público: no autentica, no firma y no verifica.

Esto deja `products` con exactamente **tres** dependencias
(`dotenv`, `express`, `mongoose`), que es el número del enunciado.

**Nota sobre el fail-fast.** El mecanismo no estaba mal; estaba mal la lista.
Un `requireVars` que exige de más es tan dañino como uno que exige de menos:
enseña a rellenar variables sin sentido.

---

## 7. `shopping` firmaba tokens y hasheaba contraseñas

**Síntoma.** `shopping/src/utils/index.js` exportaba `GenerateSalt`,
`GeneratePassword`, `ValidatePassword` y `GenerateSignature` — es decir, todo
lo necesario para **emitir** un JWT y para hashear contraseñas. `bcryptjs`
estaba en sus dependencias.

**Causa.** El mismo copiado de esqueleto de la entrada 6. Era código muerto:
nada en `shopping` llamaba a esas funciones. Pero un servicio que puede firmar
tokens es un servicio que puede suplantar a `customers`, aunque hoy no lo haga.
Y `bcryptjs` en el `package.json` es superficie de ataque y tiempo de build
por una función que nadie invoca.

**Corrección.** `utils/index.js` quedó con `FormateData` y nada más. `bcryptjs`
desinstalado. `shopping` conserva `jsonwebtoken`, pero solo para **verificar**
en `api/middlewares/auth.js`.

**Evidencia.** Tres pruebas de guarda en
`shopping/__tests__/unit/utils.test.js`: que `utils` no exporte nada más, que
`bcryptjs` no esté en las dependencias, y que ningún archivo de `src/` contenga
`jwt.sign`. Si alguien vuelve a copiar los helpers del monolito, falla la CI.

---

## 8. La capa de servicio conocía Mongoose

**Síntoma.** `shopping-service.js` empezaba con `require('mongoose')`, solo
para generar el `_id`:

```js
_id: new mongoose.Types.ObjectId().toString(),
```

**Causa.** La orden se construía entera en el servicio antes de pasarla al
repositorio, y el `_id` formaba parte de esa construcción. Parece inofensivo
—una línea— pero es la capa de negocio decidiendo cómo se llaman las claves
primarias del motor de persistencia. Es la misma regla que la sustentación
pregunta: el repositorio es el único que toca el modelo.

**Corrección.** El servicio ya no pasa `_id`. El esquema de Mongoose lo genera,
que es justo lo que sabe hacer. `shopping-service.js` no importa Mongoose.

**Evidencia.** `"no inventa el _id: eso es de la capa de datos"`.

---

## 9. Hipótesis descartada: la cabecera CORS duplicada

Esta entrada documenta un diagnóstico **equivocado**, porque el proceso de
descartarlo también es parte del trabajo.

**Síntoma esperado.** `cors()` estaba en el gateway *y* en los tres
microservicios. La hipótesis era la clásica: al pasar por el proxy, la
respuesta llevaría dos veces `Access-Control-Allow-Origin`, y el navegador
rechaza una respuesta con esa cabecera duplicada.

**Medición.** Antes de anotarlo se montó una reproducción: un servicio con
`cors()`, detrás de un gateway con `cors()`, hablando por
`express-http-proxy`, y se leyeron las cabeceras de la respuesta.

```
servicio con cors(): true   → access-control-allow-origin: "*"   (una sola vez)
servicio con cors(): false  → access-control-allow-origin: "*"   (una sola vez)
```

**Resultado: la hipótesis era falsa.** No hay duplicación. `express-http-proxy`
no reenvía esa cabecera de forma que se sume a la del gateway, así que el
`cors()` sobrante no rompía nada visible. Si se hubiera anotado sin medir,
la bitácora tendría una causa raíz inventada.

**Por qué se quitó igual.** La razón real no es un bug, es de diseño. `cors()`
es una declaración de *quién puede llamarme desde un navegador*. Ponerlo en un
microservicio es afirmar que se le puede llamar directamente desde el
navegador, y eso contradice la regla del punto de entrada único: nadie fuera de
la red interna debería alcanzar el `8001`, el `8002` ni el `8003`. El gateway
es el único que recibe peticiones de un origen web, y por tanto el único que
tiene algo que decir sobre CORS.

Efecto secundario medible: quitarlo dejó `customers` con **cinco**
dependencias y `products` con **tres**, que son los números del enunciado.

**Corrección.** `cors()` solo en `gateway/src/express-app.js`. Hay una guarda
en la CI (`grep -rn "cors" customers/src products/src shopping/src`) que falla
si vuelve a aparecer.

---

## 10. El contador del carrito mostraba una cantidad que no existía

**Síntoma.** En el detalle de vehículo y en el carrito del perfil, pulsar "+"
subía el número en pantalla inmediatamente. Si la petición fallaba, el número
se quedaba arriba: la interfaz mostraba 3 unidades y la base tenía 2.

**Causa.** Un estado local adelantado al backend:

```js
setCurrentUnit(newUnit);
setTimeout(() => { dispatch(onAddToCart({ product, qty: newUnit })); }, 0);
```

La cantidad se guardaba en `useState` y se sincronizaba con el carrito real
desde un `useEffect`. Como el `catch` de la acción no hacía nada (entrada 5),
un fallo no revertía nada ni avisaba. El `setTimeout(..., 0)` era el parche que
delataba el problema de fondo: se estaba forzando un orden entre dos fuentes de
verdad para el mismo dato.

**Corrección.** La cantidad se deriva del carrito que devuelve `customers`, sin
estado local:

```js
const currentUnit = cartEntry ? cartEntry.unit : 0;
```

El contador solo avanza cuando el backend confirmó el cambio, y si falla, el
usuario ve el aviso. Se eliminaron el `useState`, el `useEffect` de
sincronización y los dos `setTimeout`.

**Efecto lateral.** Desapareció el error de ESLint
`react-hooks/set-state-in-effect` que impedía tener `npm run lint` en verde en
la CI del frontend.

---

## 11. Secretos escritos en los `docker-compose.yml` versionados

**Síntoma.** `.env` estaba correctamente ignorado, pero los tres
`docker-compose.yml` llevaban `APP_SECRET: dev-secret-change-me` en claro y sí
estaban versionados. El `.env.example` también traía el valor.

**Causa.** El foco se puso en el archivo obvio (`.env`) y no en los otros sitios
donde acaba la misma variable. Un secreto de desarrollo es igual de real que
uno de producción si el hábito que enseña es escribirlo en el repositorio.

**Corrección.** Los compose interpolan desde el `.env` local y fallan ruidoso
si falta:

```yaml
APP_SECRET: ${APP_SECRET:?define APP_SECRET en customers/.env (ver .env.example)}
```

Los `.env.example` traen el **nombre** de la variable y una explicación de qué
va ahí, con el valor vacío. Hay una guarda en la CI que falla si aparece
cualquier `.env` versionado que no sea un `.env.example`.

---

## Estado al cierre

```
gateway     49 pruebas
customers  110 pruebas
products    33 pruebas
shopping    89 pruebas
─────────────────────
total      281 pruebas en verde
```

Las reglas de arquitectura que salieron de esta bitácora quedaron como guardas
ejecutables en `.github/workflows/ci.yml`, no solo como acuerdos:

- `cors()` únicamente en el gateway
- `products` sin dependencias de criptografía
- ningún servicio distinto de `customers` contiene `jwt.sign`
- ningún servicio referencia la base de datos de otro
- ningún `.env` versionado
