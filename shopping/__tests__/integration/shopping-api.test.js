// Pruebas de integracion de los endpoints HTTP del microservicio shopping.
// Se usa la app real de Express (rutas + middlewares + manejador de errores)
// contra un MongoDB en memoria: no se mockea nada de la capa de datos.
const express = require('express');
const request = require('supertest');

const db = require('../helpers/db');
const { bearer, invalidBearer } = require('../helpers/auth');

const USER_ID = '650000000000000000000001';
const OTRO_USER_ID = '650000000000000000000002';

// El cuerpo que manda el cliente solo lleva que producto y cuantos: el nombre,
// el precio y el importe los pone el servicio con lo que responda el catalogo.
const nuevaOrden = (override = {}) => ({
    txnId: 'txn-001',
    items: [{ productId: 'p1', quantity: 2 }],
    ...override,
});

const CATALOGO = {
    p1: { _id: 'p1', name: 'Sedan Clasico', price: 125, available: true, banner: 'sedan.jpg' },
    p2: { _id: 'p2', name: 'SUV Familiar', price: 300, available: true, banner: 'suv.jpg' },
};

// products es un servicio externo: se sustituye en su frontera real, que es
// fetch. Todo lo de shopping (rutas, middleware, servicio, repositorio y
// Mongo) sigue siendo el codigo de verdad.
const catalogoRespondiendo = (catalogo = CATALOGO) =>
    jest.fn(async (url) => {
        const id = decodeURIComponent(String(url).split('/products/')[1]);
        const producto = catalogo[id];

        return producto
            ? { ok: true, status: 200, json: async () => producto }
            : { ok: false, status: 404, json: async () => ({ message: 'Product not found' }) };
    });

const catalogoCaido = () => jest.fn(async () => { throw new Error('ECONNREFUSED'); });

describe('API /shopping (integracion)', () => {
    let app;
    let OrderModel;

    beforeAll(async () => {
        await db.connect();

        // Se importan despues de conectar para que los modelos queden ligados
        // a la conexion en memoria.
        ({ OrderModel } = require('../../src/database/models'));

        app = express();
        await require('../../src/express-app')(app);
    });

    beforeEach(() => {
        global.fetch = catalogoRespondiendo();
    });

    afterEach(async () => {
        await db.clear();
        delete global.fetch;
    });

    afterAll(async () => {
        await db.close();
    });

    describe('GET /health', () => {
        it('reporta el servicio arriba', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ service: 'shopping', status: 'up' });
        });
    });

    describe('POST /shopping/order', () => {
        it('crea la orden y la persiste en la base de datos', async () => {
            const response = await request(app)
                .post('/shopping/order')
                .set('Authorization', bearer({ _id: USER_ID }))
                .send(nuevaOrden());

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                userId: USER_ID,
                txnId: 'txn-001',
                amount: 250,
                status: 'received',
            });
            expect(response.body.items).toHaveLength(1);

            const guardada = await OrderModel.findById(response.body._id);

            expect(guardada).not.toBeNull();
            expect(guardada.userId).toBe(USER_ID);
            expect(guardada.items[0].productId).toBe('p1');
        });

        it('responde 401 cuando no se envia token', async () => {
            const response = await request(app).post('/shopping/order').send(nuevaOrden());

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ message: 'Missing authorization token' });
            await expect(OrderModel.countDocuments()).resolves.toBe(0);
        });

        it('responde 401 cuando el token es invalido', async () => {
            const response = await request(app)
                .post('/shopping/order')
                .set('Authorization', invalidBearer())
                .send(nuevaOrden());

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ message: 'Invalid or expired token' });
        });

        it('calcula el importe con el precio del catalogo e ignora el que envie el cliente', async () => {
            const response = await request(app)
                .post('/shopping/order')
                .set('Authorization', bearer({ _id: USER_ID }))
                .send({ txnId: 'txn-002', items: [{ productId: 'p1', quantity: 2, price: 1 }] });

            expect(response.status).toBe(200);
            expect(response.body.amount).toBe(250);
            expect(response.body.items[0]).toMatchObject({ price: 125, name: 'Sedan Clasico' });
        });

        // Decision de diseno: en la escritura no se degrada. Sin catalogo no
        // hay precio verificable, y una orden con un importe inventado es peor
        // que una orden que no se creo.
        it('responde 503 y no guarda nada cuando el catalogo esta caido', async () => {
            global.fetch = catalogoCaido();

            const response = await request(app)
                .post('/shopping/order')
                .set('Authorization', bearer({ _id: USER_ID }))
                .send(nuevaOrden());

            expect(response.status).toBe(503);
            expect(response.body.message).toMatch(/products.*no esta disponible/);
            await expect(OrderModel.countDocuments()).resolves.toBe(0);
        });

        it.each([
            ['sin items', { items: [] }, 'Order items are required'],
            [
                'con una linea sin productId',
                { items: [{ quantity: 1 }] },
                'Every order item needs a productId',
            ],
            [
                'con cantidad cero',
                { items: [{ productId: 'p1', quantity: 0 }] },
                'Every order item needs a quantity of at least 1',
            ],
            [
                'con un producto que no esta en el catalogo',
                { items: [{ productId: 'p-fantasma', quantity: 1 }] },
                'These products are not in the catalogue: p-fantasma',
            ],
        ])('responde 400 %s y no guarda nada', async (_caso, override, message) => {
            const response = await request(app)
                .post('/shopping/order')
                .set('Authorization', bearer({ _id: USER_ID }))
                .send(nuevaOrden(override));

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message });
            await expect(OrderModel.countDocuments()).resolves.toBe(0);
        });
    });

    describe('GET /shopping/orders', () => {
        it('devuelve un arreglo vacio cuando el usuario no tiene ordenes', async () => {
            const response = await request(app)
                .get('/shopping/orders')
                .set('Authorization', bearer({ _id: USER_ID }));

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        it('devuelve solo las ordenes del usuario autenticado, de la mas reciente a la mas antigua', async () => {
            const token = bearer({ _id: USER_ID });

            const primera = await request(app)
                .post('/shopping/order')
                .set('Authorization', token)
                .send(nuevaOrden({ txnId: 'txn-antigua' }));

            // Separacion explicita: createdAt tiene resolucion de milisegundos y
            // sin la pausa el orden del sort quedaria indeterminado.
            await new Promise((resolve) => setTimeout(resolve, 20));

            const segunda = await request(app)
                .post('/shopping/order')
                .set('Authorization', token)
                .send(nuevaOrden({ txnId: 'txn-reciente' }));

            await request(app)
                .post('/shopping/order')
                .set('Authorization', bearer({ _id: OTRO_USER_ID }))
                .send(nuevaOrden({ txnId: 'txn-de-otro' }));

            const response = await request(app).get('/shopping/orders').set('Authorization', token);

            expect(response.status).toBe(200);
            expect(response.body.map((order) => order.txnId)).toEqual(['txn-reciente', 'txn-antigua']);
            expect(response.body.map((order) => order._id)).toEqual([segunda.body._id, primera.body._id]);
            expect(response.body.every((order) => order.userId === USER_ID)).toBe(true);
        });

        it('enriquece cada linea con el precio actual del catalogo', async () => {
            const token = bearer({ _id: USER_ID });
            await request(app).post('/shopping/order').set('Authorization', token).send(nuevaOrden());

            global.fetch = catalogoRespondiendo({
                p1: { ...CATALOGO.p1, price: 150 },
            });

            const response = await request(app).get('/shopping/orders').set('Authorization', token);

            expect(response.body[0].items[0]).toMatchObject({
                price: 125,
                currentProduct: { price: 150 },
                priceChanged: true,
            });
        });

        // Degradacion, no caida: apagar products no puede tumbar el historial.
        it('devuelve el historial aunque el catalogo este caido', async () => {
            const token = bearer({ _id: USER_ID });
            await request(app).post('/shopping/order').set('Authorization', token).send(nuevaOrden());

            jest.spyOn(console, 'warn').mockImplementation(() => {});
            global.fetch = catalogoCaido();

            const response = await request(app).get('/shopping/orders').set('Authorization', token);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].items[0]).toMatchObject({
                name: 'Sedan Clasico',
                price: 125,
                currentProduct: null,
            });

            console.warn.mockRestore();
        });

        it('responde 401 sin token', async () => {
            const response = await request(app).get('/shopping/orders');

            expect(response.status).toBe(401);
        });
    });

    describe('cuando el servicio falla', () => {
        it('delega el error al manejador central y responde con su statusCode', async () => {
            const ShoppingService = require('../../src/services/shopping-service');
            const { APIError } = require('../../src/utils/app-errors');

            jest.spyOn(ShoppingService.prototype, 'GetOrdersByUser').mockRejectedValue(
                new APIError('GetOrdersByUserError', 500, 'fallo interno'),
            );

            const response = await request(app)
                .get('/shopping/orders')
                .set('Authorization', bearer({ _id: USER_ID }));

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: 'fallo interno' });
        });
    });

    describe('rutas no registradas', () => {
        it('responde 404 de Express para un recurso inexistente', async () => {
            const response = await request(app).get('/shopping/no-existe');

            expect(response.status).toBe(404);
        });
    });
});
