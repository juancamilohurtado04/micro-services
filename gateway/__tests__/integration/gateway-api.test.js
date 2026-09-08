// Pruebas de integracion del gateway: se levantan microservicios stub reales en
// puertos efimeros y se comprueba el enrutamiento por proxy, la composicion de
// /profile, los health checks y la degradacion cuando un servicio esta caido.
const express = require('express');
const request = require('supertest');

const { startStub, deadServiceUrl } = require('../helpers/stub-service');

const AUTH = 'Bearer token-valido';

const perfil = {
    _id: 'c1',
    email: 'ana@example.com',
    phone: '3001234567',
    address: [{ city: 'Medellin' }],
    cart: [{ product: { _id: 'p1' }, unit: 1 }],
    wishlist: [],
};

// Las ordenes llegan al gateway ya enriquecidas: es shopping quien consulta el
// catalogo, porque es shopping quien posee las ordenes. El gateway solo compone.
const ordenes = [
    {
        _id: 'o1',
        amount: 36000,
        items: [
            {
                productId: 'p1',
                name: 'Sedan Clasico',
                price: 18000,
                quantity: 2,
                currentProduct: { name: 'Sedan Clasico', price: 20000, available: true, banner: 'b1' },
                priceChanged: true,
            },
        ],
    },
];

// Lo que devuelve shopping cuando products no le respondio: el historial
// entero, pero sin el precio actual.
const ordenesSinCatalogo = [
    {
        _id: 'o1',
        amount: 36000,
        items: [
            {
                productId: 'p1',
                name: 'Sedan Clasico',
                price: 18000,
                quantity: 2,
                currentProduct: null,
                priceChanged: null,
            },
        ],
    },
];

const catalogo = {
    p1: { _id: 'p1', name: 'Sedan Clasico', price: 20000, available: true, banner: 'b1' },
};

// Reconstruye la app del gateway con las URLs indicadas.
// src/config y src/routes leen process.env en tiempo de require, por eso hace
// falta limpiar el registro de modulos antes de volver a importarlos.
const buildGateway = async (env) => {
    Object.assign(process.env, env);
    jest.resetModules();

    const app = express();
    await require('../../src/express-app')(app);

    return app;
};

describe('API Gateway (integracion)', () => {
    let customers;
    let products;
    let shopping;
    let shoppingSinCatalogo;
    let app;

    beforeAll(async () => {
        customers = await startStub((stub) => {
            stub.get('/health', (req, res) => res.json({ service: 'customers', status: 'up' }));
            stub.get('/customer/profile', (req, res) => {
                if (req.headers.authorization !== AUTH) {
                    return res.status(401).json({ message: 'Invalid or expired token' });
                }
                return res.json(perfil);
            });
            stub.post('/customer/login', (req, res) => res.json({ id: 'c1', token: 'token-valido' }));
        });

        products = await startStub((stub) => {
            stub.get('/health', (req, res) => res.json({ service: 'products', status: 'up' }));
            stub.get('/products', (req, res) => res.json({ products: [catalogo.p1], categories: ['sedan'] }));
            stub.get('/products/:id', (req, res) => {
                const producto = catalogo[req.params.id];
                return producto ? res.json(producto) : res.status(404).json({ message: 'Product not found' });
            });
        });

        shopping = await startStub((stub) => {
            stub.get('/health', (req, res) => res.json({ service: 'shopping', status: 'up' }));
            stub.get('/shopping/orders', (req, res) => {
                if (req.headers.authorization !== AUTH) {
                    return res.status(401).json({ message: 'Invalid or expired token' });
                }
                return res.json(ordenes);
            });
        });

        // Un shopping que responde, pero que no pudo hablar con el catalogo.
        shoppingSinCatalogo = await startStub((stub) => {
            stub.get('/shopping/orders', (req, res) => res.json(ordenesSinCatalogo));
        });

        app = await buildGateway({
            CUSTOMERS_URL: customers.url,
            PRODUCTS_URL: products.url,
            SHOPPING_URL: shopping.url,
        });
    });

    beforeEach(() => {
        // proxyErrorHandler y HandleErrors escriben en consola; se silencia
        // para no ensuciar la salida de Jest.
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(async () => {
        await Promise.all([
            customers.close(),
            products.close(),
            shopping.close(),
            shoppingSinCatalogo.close(),
        ]);
    });

    describe('health checks', () => {
        it('GET /health responde sin consultar a los microservicios', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ service: 'gateway', status: 'up' });
        });

        it('GET /health/services responde 200 cuando los tres estan arriba', async () => {
            const response = await request(app).get('/health/services');

            expect(response.status).toBe(200);
            expect(response.body.gateway).toBe('up');
            expect(response.body.services.map((servicio) => servicio.name).sort()).toEqual([
                'customers',
                'products',
                'shopping',
            ]);
            expect(response.body.services.every((servicio) => servicio.status === 'up')).toBe(true);
        });

        it('GET /health/services responde 503 y marca el servicio caido', async () => {
            const caido = await buildGateway({ SHOPPING_URL: await deadServiceUrl() });

            const response = await request(caido).get('/health/services');

            expect(response.status).toBe(503);

            const shoppingStatus = response.body.services.find((servicio) => servicio.name === 'shopping');

            expect(shoppingStatus.status).toBe('down');
            expect(shoppingStatus.error).toEqual(expect.any(String));
        });

        it('marca como down un microservicio que responde /health con error', async () => {
            const enfermo = await startStub((stub) => {
                stub.get('/health', (req, res) => res.status(500).json({ status: 'down' }));
            });

            try {
                const degradado = await buildGateway({ PRODUCTS_URL: enfermo.url });

                const response = await request(degradado).get('/health/services');

                expect(response.status).toBe(503);

                const productsStatus = response.body.services.find((servicio) => servicio.name === 'products');

                // Respondio, por eso no hay campo error: solo el status no fue 2xx.
                expect(productsStatus.status).toBe('down');
                expect(productsStatus.error).toBeUndefined();
            } finally {
                await enfermo.close();
            }
        });
    });

    describe('enrutamiento por proxy', () => {
        beforeAll(async () => {
            // Se restauran las URLs buenas tras la prueba del servicio caido.
            app = await buildGateway({
                CUSTOMERS_URL: customers.url,
                PRODUCTS_URL: products.url,
                SHOPPING_URL: shopping.url,
            });
        });

        it('reenvia /products al microservicio de productos conservando la ruta', async () => {
            const response = await request(app).get('/products');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ products: [catalogo.p1], categories: ['sedan'] });
            expect(products.recibidas.some((peticion) => peticion.url.startsWith('/products'))).toBe(true);
        });

        it('reenvia los parametros de ruta al microservicio destino', async () => {
            const response = await request(app).get('/products/p1');

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ _id: 'p1', name: 'Sedan Clasico' });
        });

        it('propaga el status de error del microservicio destino', async () => {
            const response = await request(app).get('/products/p404');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: 'Product not found' });
        });

        it('reenvia el header authorization al microservicio destino', async () => {
            const response = await request(app).get('/customer/profile').set('Authorization', AUTH);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ _id: 'c1', email: 'ana@example.com' });
        });

        it('deja pasar el 401 cuando no se envia token', async () => {
            const response = await request(app).get('/customer/profile');

            expect(response.status).toBe(401);
        });

        it('responde 502 cuando el microservicio destino no esta disponible', async () => {
            const caido = await buildGateway({ PRODUCTS_URL: await deadServiceUrl() });

            const response = await request(caido).get('/products');

            expect(response.status).toBe(502);
            expect(response.body).toEqual({ message: 'El microservicio "products" no esta disponible' });
        });
    });

    describe('GET /profile (composicion)', () => {
        beforeAll(async () => {
            app = await buildGateway({
                CUSTOMERS_URL: customers.url,
                PRODUCTS_URL: products.url,
                SHOPPING_URL: shopping.url,
            });
        });

        it('agrega perfil, ordenes y estado actual del catalogo', async () => {
            const response = await request(app).get('/profile').set('Authorization', AUTH);

            expect(response.status).toBe(200);
            expect(response.body.customer).toMatchObject({ _id: 'c1', email: 'ana@example.com' });
            expect(response.body.totals).toEqual({ orders: 1, spent: 36000 });
            expect(response.body.sources).toEqual({ customers: true, shopping: true, products: true });
            expect(response.body.warnings).toBeUndefined();

            const [item] = response.body.orders[0].items;

            // El precio congelado en la orden (18000) difiere del actual (20000).
            expect(item.currentProduct).toMatchObject({ name: 'Sedan Clasico', price: 20000 });
            expect(item.priceChanged).toBe(true);
        });

        it('no consulta a products al componer el perfil', async () => {
            const antes = products.recibidas.length;

            await request(app).get('/profile').set('Authorization', AUTH);

            expect(products.recibidas.length).toBe(antes);
        });

        it('responde 401 sin token', async () => {
            const response = await request(app).get('/profile');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ message: 'Missing authorization token' });
        });

        it('responde 401 cuando customers rechaza el token', async () => {
            const response = await request(app).get('/profile').set('Authorization', 'Bearer token-vencido');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ message: 'Invalid or expired token' });
        });

        it('degrada con warning cuando shopping esta caido', async () => {
            const degradado = await buildGateway({ SHOPPING_URL: await deadServiceUrl() });

            const response = await request(degradado).get('/profile').set('Authorization', AUTH);

            expect(response.status).toBe(200);
            expect(response.body.orders).toEqual([]);
            expect(response.body.totals).toEqual({ orders: 0, spent: 0 });
            expect(response.body.sources.shopping).toBe(false);
            expect(response.body.warnings).toContain(
                'No se pudo cargar tu historial de pedidos: el servicio de compras no respondio',
            );
        });

        // Degradacion en cadena: products caido no tumba a shopping, y shopping
        // degradado no tumba el perfil. Se sigue viendo todo, con un aviso.
        it('avisa del catalogo caido sin perder el historial', async () => {
            const degradado = await buildGateway({ SHOPPING_URL: shoppingSinCatalogo.url });

            const response = await request(degradado).get('/profile').set('Authorization', AUTH);

            expect(response.status).toBe(200);
            expect(response.body.orders).toHaveLength(1);
            expect(response.body.totals).toEqual({ orders: 1, spent: 36000 });
            expect(response.body.sources).toMatchObject({ customers: true, shopping: true, products: false });
            expect(response.body.warnings).toContain(
                'Los precios actuales no estan disponibles: el catalogo no respondio',
            );
        });

        it('responde 502 cuando customers esta caido', async () => {
            const degradado = await buildGateway({ CUSTOMERS_URL: await deadServiceUrl() });

            const response = await request(degradado).get('/profile').set('Authorization', AUTH);

            expect(response.status).toBe(502);
            expect(response.body).toEqual({ message: 'El microservicio "customers" no esta disponible' });
        });
    });

    describe('rutas no registradas', () => {
        beforeAll(async () => {
            app = await buildGateway({
                CUSTOMERS_URL: customers.url,
                PRODUCTS_URL: products.url,
                SHOPPING_URL: shopping.url,
            });
        });

        it('responde 404 listando los prefijos disponibles', async () => {
            const response = await request(app).get('/no-existe');

            expect(response.status).toBe(404);
            expect(response.body.message).toContain('GET /no-existe');
            expect(response.body.availablePrefixes).toEqual(['/customer', '/products', '/shopping']);
        });
    });
});
