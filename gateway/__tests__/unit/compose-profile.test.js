// Pruebas unitarias de la composicion de respuestas del gateway.
// Se mockea global.fetch para controlar que responde cada microservicio y
// verificar el agregado, los warnings y el manejo de fallos parciales.
//
// El gateway solo habla con customers y con shopping: el enriquecimiento de
// las lineas con el catalogo lo hace shopping, que es quien posee las ordenes.
// Que aqui no aparezca ninguna llamada a /products/ es intencional.
const { composeProfile, callService } = require('../../src/compose-profile');
const { CUSTOMERS_URL, SHOPPING_URL } = require('../../src/config');
const { BadGatewayError, UnauthorizedError } = require('../../src/utils/app-errors');

const AUTH = 'Bearer token-valido';

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const perfil = {
    _id: 'c1',
    email: 'ana@example.com',
    phone: '3001234567',
    address: [{ city: 'Medellin' }],
    cart: [],
    wishlist: [],
};

// Asi vienen ya de shopping: con currentProduct resuelto.
const ordenes = [
    {
        _id: 'o1',
        amount: 36000,
        items: [
            {
                productId: 'p1',
                name: 'Sedan Clasico',
                price: 18000,
                quantity: 1,
                currentProduct: { name: 'Sedan Clasico', price: 18000, available: true },
                priceChanged: false,
            },
            {
                productId: 'p2',
                name: 'SUV Familiar',
                price: 18000,
                quantity: 1,
                currentProduct: { name: 'SUV Familiar', price: 20000, available: false },
                priceChanged: true,
            },
        ],
    },
];

// Lo que devuelve shopping cuando products no le respondio.
const ordenesSinCatalogo = [
    {
        _id: 'o1',
        amount: 36000,
        items: [
            { productId: 'p1', name: 'Sedan Clasico', price: 18000, quantity: 1, currentProduct: null, priceChanged: null },
        ],
    },
];

// Enruta el fetch mockeado segun la URL pedida.
const mockFetchRoutes = (routes) => {
    global.fetch = jest.fn(async (url) => {
        const handler = Object.entries(routes).find(([fragment]) => String(url).includes(fragment));

        if (!handler) throw new Error(`URL no esperada en la prueba: ${url}`);

        const resultado = handler[1];

        return typeof resultado === 'function' ? resultado(url) : resultado;
    });
};

const buildRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('composeProfile', () => {
    let res;
    let next;

    beforeEach(() => {
        res = buildRes();
        next = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('responde 401 sin llamar a ningun microservicio cuando falta el token', async () => {
        global.fetch = jest.fn();

        await composeProfile({ headers: {} }, res, next);

        expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('propaga el 401 de customers como UnauthorizedError', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(401, { message: 'Invalid or expired token' }),
            '/shopping/orders': jsonResponse(200, []),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const [error] = next.mock.calls[0];

        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(error.message).toBe('Invalid or expired token');
    });

    it('responde 502 cuando customers no esta disponible', async () => {
        mockFetchRoutes({
            '/customer/profile': () => Promise.reject(new Error('ECONNREFUSED')),
            '/shopping/orders': jsonResponse(200, []),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const [error] = next.mock.calls[0];

        expect(error).toBeInstanceOf(BadGatewayError);
        expect(error.statusCode).toBe(502);
    });

    it('compone perfil y ordenes en una sola respuesta', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, ordenes),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        expect(next).not.toHaveBeenCalled();

        const [payload] = res.json.mock.calls[0];

        expect(payload.customer).toEqual({
            _id: 'c1',
            email: 'ana@example.com',
            phone: '3001234567',
            address: [{ city: 'Medellin' }],
            cart: [],
            wishlist: [],
        });
        expect(payload.totals).toEqual({ orders: 1, spent: 36000 });
        expect(payload.sources).toEqual({ customers: true, shopping: true, products: true });
        expect(payload.warnings).toBeUndefined();

        // Las ordenes se reenvian tal cual las dio shopping: el gateway compone,
        // no reinterpreta el dominio ajeno.
        expect(payload.orders).toEqual(ordenes);
    });

    it('llama solo a customers y a shopping, nunca a products', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, ordenes),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const urls = global.fetch.mock.calls.map(([url]) => String(url));

        expect(urls).toHaveLength(2);
        expect(urls.some((url) => url.includes('/products'))).toBe(false);
    });

    it('rellena con valores vacios los campos que los microservicios no envian', async () => {
        mockFetchRoutes({
            // Perfil minimo: sin address, cart ni wishlist.
            '/customer/profile': jsonResponse(200, { _id: 'c1', email: 'ana@example.com', phone: null }),
            // Orden sin items ni amount.
            '/shopping/orders': jsonResponse(200, [{ _id: 'o1' }]),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const [payload] = res.json.mock.calls[0];

        expect(payload.customer).toMatchObject({ address: [], cart: [], wishlist: [] });
        // Las ordenes pasan tal cual: normalizarlas seria reinterpretar un
        // dominio ajeno. Lo que si se rellena es el perfil, que el gateway
        // compone, y los totales, que calcula el.
        expect(payload.orders).toEqual([{ _id: 'o1' }]);
        expect(payload.totals).toEqual({ orders: 1, spent: 0 });
        // Sin lineas que enriquecer, products se reporta como fuente sana.
        expect(payload.sources.products).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('degrada con warning cuando shopping no responde', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': () => Promise.reject(new Error('ECONNREFUSED')),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const [payload] = res.json.mock.calls[0];

        expect(payload.orders).toEqual([]);
        expect(payload.totals).toEqual({ orders: 0, spent: 0 });
        expect(payload.sources).toMatchObject({ customers: true, shopping: false });
        expect(payload.warnings).toEqual([
            'No se pudo cargar tu historial de pedidos: el servicio de compras no respondio',
        ]);
    });

    // El gateway deduce el estado del catalogo de lo que shopping le entrega:
    // si ninguna linea trae currentProduct, products no respondio.
    it('avisa que el catalogo esta caido cuando shopping no pudo enriquecer nada', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, ordenesSinCatalogo),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        const [payload] = res.json.mock.calls[0];

        // El historial se sigue devolviendo entero: degradacion, no caida.
        expect(payload.orders).toHaveLength(1);
        expect(payload.totals).toEqual({ orders: 1, spent: 36000 });
        expect(payload.sources.products).toBe(false);
        expect(payload.warnings).toContain(
            'Los precios actuales no estan disponibles: el catalogo no respondio',
        );
    });

    it('no avisa nada cuando el catalogo si enriquecio las lineas', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, ordenes),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        expect(res.json.mock.calls[0][0].warnings).toBeUndefined();
    });

    it('reenvia el header authorization a cada microservicio', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, ordenes),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        expect(global.fetch).toHaveBeenCalledWith(
            `${CUSTOMERS_URL}/customer/profile`,
            expect.objectContaining({ headers: { authorization: AUTH } }),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            `${SHOPPING_URL}/shopping/orders`,
            expect.objectContaining({ headers: { authorization: AUTH } }),
        );
    });

    it('delega al manejador central cuando las ordenes traen una forma inesperada', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            // Un arreglo valido pero con un elemento nulo: el recorrido revienta.
            '/shopping/orders': jsonResponse(200, [null]),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        expect(res.json).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeInstanceOf(TypeError);
    });

    it('no rompe cuando shopping devuelve algo que no es un arreglo', async () => {
        mockFetchRoutes({
            '/customer/profile': jsonResponse(200, perfil),
            '/shopping/orders': jsonResponse(200, { message: 'respuesta inesperada' }),
        });

        await composeProfile({ headers: { authorization: AUTH } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].orders).toEqual([]);
    });
});

describe('callService', () => {
    afterEach(() => {
        delete global.fetch;
    });

    it('devuelve ok:true y el cuerpo parseado en una respuesta exitosa', async () => {
        global.fetch = jest.fn(async () => jsonResponse(200, { hola: 'mundo' }));

        await expect(callService('http://x/y')).resolves.toEqual({
            ok: true,
            status: 200,
            data: { hola: 'mundo' },
        });
    });

    it('devuelve ok:false conservando el status de una respuesta de error', async () => {
        global.fetch = jest.fn(async () => jsonResponse(404, { message: 'no existe' }));

        await expect(callService('http://x/y')).resolves.toMatchObject({ ok: false, status: 404 });
    });

    it('devuelve data null cuando la respuesta no es JSON valido', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error('Unexpected token < in JSON');
            },
        }));

        await expect(callService('http://x/y')).resolves.toMatchObject({ ok: true, data: null });
    });

    it('convierte un fallo de red en status 0 con el mensaje del error', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        });

        await expect(callService('http://x/y')).resolves.toEqual({
            ok: false,
            status: 0,
            data: null,
            error: 'ECONNREFUSED',
        });
    });

    it('omite el header authorization cuando no se recibe token', async () => {
        global.fetch = jest.fn(async () => jsonResponse(200, {}));

        await callService('http://x/y');

        expect(global.fetch).toHaveBeenCalledWith('http://x/y', expect.objectContaining({ headers: {} }));
    });
});
