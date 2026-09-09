// Composicion tolerante a fallos.
//
// El perfil que ve el cliente vive en dos dominios: la cuenta, el carrito y la
// wishlist los tiene customers; el historial de ordenes lo tiene shopping. En
// vez de obligar al navegador a hacer dos peticiones y unirlas, el gateway las
// hace en paralelo y devuelve una sola respuesta.
//
// El enriquecimiento de cada linea con el precio actual del catalogo NO se
// hace aqui: lo hace shopping contra products, porque shopping es quien posee
// las ordenes. El gateway no entra en dominios ajenos, solo compone.
//
// Regla de degradacion: la unica dependencia dura es customers, porque sin la
// cuenta no hay perfil que mostrar. Todo lo demas se degrada a un valor vacio
// mas un aviso legible.
const { CUSTOMERS_URL, SHOPPING_URL } = require('./config');
const { BadGatewayError, UnauthorizedError } = require('./utils/app-errors');

const TIMEOUT_MS = 8000;

async function callService(url, authorization) {
    try {
        const response = await fetch(url, {
            headers: authorization ? { authorization } : {},
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        const data = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, data };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: err.message };
    }
}

async function composeProfile(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return next(new UnauthorizedError('Missing authorization token'));
    }

    try {
        const warnings = [];

        const [profile, orders] = await Promise.all([
            callService(`${CUSTOMERS_URL}/customer/profile`, authorization),
            callService(`${SHOPPING_URL}/shopping/orders`, authorization),
        ]);

        if (profile.status === 401) {
            return next(new UnauthorizedError('Invalid or expired token'));
        }

        if (!profile.ok) {
            return next(new BadGatewayError('El microservicio "customers" no esta disponible'));
        }

        let orderList = [];
        if (orders.ok && Array.isArray(orders.data)) {
            orderList = orders.data;
        } else {
            warnings.push('No se pudo cargar tu historial de pedidos: el servicio de compras no respondio');
        }

        // shopping marca currentProduct como null cuando products no le
        // respondio. Si hay lineas sin enriquecer, el catalogo esta caido y el
        // frontend debe poder avisarlo sin dejar de pintar el resto.
        const lineas = orderList.flatMap((order) => order.items || []);
        const catalogoVivo = lineas.length === 0 || lineas.some((item) => item.currentProduct);

        if (!catalogoVivo) {
            warnings.push('Los precios actuales no estan disponibles: el catalogo no respondio');
        }

        return res.json({
            customer: {
                _id: profile.data._id,
                email: profile.data.email,
                phone: profile.data.phone,
                address: profile.data.address || [],
                cart: profile.data.cart || [],
                wishlist: profile.data.wishlist || [],
            },
            orders: orderList,
            totals: {
                orders: orderList.length,
                spent: orderList.reduce((sum, order) => sum + (order.amount || 0), 0),
            },
            sources: {
                customers: profile.ok,
                shopping: orders.ok,
                products: catalogoVivo,
            },
            ...(warnings.length ? { warnings } : {}),
        });
    } catch (err) {
        return next(err);
    }
}

module.exports = { composeProfile, callService };
