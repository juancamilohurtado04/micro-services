// Pruebas de integracion de los endpoints HTTP del microservicio customers,
// sobre la app real de Express y un MongoDB en memoria.
const express = require('express');
const request = require('supertest');

const db = require('../helpers/db');
const { invalidBearer } = require('../helpers/auth');

const credenciales = { email: 'ana@example.com', password: 'secreta123', phone: '3001234567' };
const producto = { _id: 'p1', name: 'Sedan Clasico', type: 'sedan', price: 18000, available: true };

describe('API /customer (integracion)', () => {
    let app;
    let CustomerModel;

    beforeAll(async () => {
        await db.connect();

        app = express();
        await require('../../src/express-app')(app);

        ({ CustomerModel } = require('../../src/database/models'));

        // El indice unico de email se necesita para la prueba de email duplicado.
        await db.syncIndexes();
    });

    afterEach(async () => {
        await db.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    // Registra un cliente y devuelve el header Authorization listo para usar.
    const registrar = async (override = {}) => {
        const response = await request(app)
            .post('/customer/signup')
            .send({ ...credenciales, ...override });

        expect(response.status).toBe(200);

        return { id: response.body.id, auth: `Bearer ${response.body.token}` };
    };

    describe('GET /health', () => {
        it('reporta el servicio arriba', async () => {
            const response = await request(app).get('/health');

            expect(response.body).toEqual({ service: 'customers', status: 'up' });
        });
    });

    describe('POST /customer/signup', () => {
        it('crea el cliente y devuelve id y token', async () => {
            const response = await request(app).post('/customer/signup').send(credenciales);

            expect(response.status).toBe(200);
            expect(response.body.id).toEqual(expect.any(String));
            expect(response.body.token).toEqual(expect.any(String));

            const guardado = await CustomerModel.findById(response.body.id);

            expect(guardado.email).toBe('ana@example.com');
            expect(guardado.password).not.toBe('secreta123');
        });

        it('responde 400 si el email ya esta registrado', async () => {
            await registrar();

            const response = await request(app).post('/customer/signup').send(credenciales);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message: 'Email already registered' });
            await expect(CustomerModel.countDocuments()).resolves.toBe(1);
        });
    });

    describe('POST /customer/login', () => {
        it('devuelve un token con las credenciales correctas', async () => {
            const { id } = await registrar();

            const response = await request(app)
                .post('/customer/login')
                .send({ email: credenciales.email, password: credenciales.password });

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(id);
            expect(response.body.token).toEqual(expect.any(String));
        });

        it.each([
            ['contrasena incorrecta', { email: credenciales.email, password: 'equivocada' }],
            ['email no registrado', { email: 'nadie@example.com', password: 'secreta123' }],
        ])('responde 400 con %s', async (_caso, body) => {
            await registrar();

            const response = await request(app).post('/customer/login').send(body);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message: 'Invalid credentials' });
        });
    });

    describe('GET /customer/profile', () => {
        it('devuelve el perfil sin exponer password ni salt', async () => {
            const { id, auth } = await registrar();

            const response = await request(app).get('/customer/profile').set('Authorization', auth);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ _id: id, email: 'ana@example.com', phone: '3001234567' });
            expect(response.body.password).toBeUndefined();
            expect(response.body.salt).toBeUndefined();
        });

        it.each([
            ['sin token', undefined, 'Missing authorization token'],
            ['con token invalido', 'invalido', 'Invalid or expired token'],
        ])('responde 401 %s', async (_caso, tipo, message) => {
            const req = request(app).get('/customer/profile');

            if (tipo === 'invalido') req.set('Authorization', invalidBearer());

            const response = await req;

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ message });
        });
    });

    describe('POST /customer/address', () => {
        it('crea la direccion y la asocia al perfil', async () => {
            const { auth } = await registrar();
            const direccion = { street: 'Calle 10 #43-25', postalCode: '050001', city: 'Medellin', country: 'CO' };

            const creada = await request(app).post('/customer/address').set('Authorization', auth).send(direccion);

            expect(creada.status).toBe(200);
            expect(creada.body).toMatchObject(direccion);

            const perfil = await request(app).get('/customer/profile').set('Authorization', auth);

            expect(perfil.body.address).toHaveLength(1);
            expect(perfil.body.address[0]).toMatchObject({ city: 'Medellin', country: 'CO' });
        });
    });

    describe('wishlist', () => {
        it('agrega, lista y elimina productos', async () => {
            const { auth } = await registrar();

            const agregado = await request(app).put('/customer/wishlist').set('Authorization', auth).send({ product: producto });

            expect(agregado.status).toBe(200);
            expect(agregado.body).toHaveLength(1);
            expect(agregado.body[0]).toMatchObject({ _id: 'p1', name: 'Sedan Clasico' });

            const listado = await request(app).get('/customer/wishlist').set('Authorization', auth);

            expect(listado.status).toBe(200);
            expect(listado.body).toHaveLength(1);

            const eliminado = await request(app).delete('/customer/wishlist/p1').set('Authorization', auth);

            expect(eliminado.status).toBe(200);
            expect(eliminado.body).toEqual([]);
        });

        it('no duplica un producto que ya esta en la wishlist', async () => {
            const { auth } = await registrar();

            await request(app).put('/customer/wishlist').set('Authorization', auth).send({ product: producto });
            const response = await request(app).put('/customer/wishlist').set('Authorization', auth).send({ product: producto });

            expect(response.body).toHaveLength(1);
        });

        it('responde 400 si el producto no trae _id', async () => {
            const { auth } = await registrar();

            const response = await request(app)
                .put('/customer/wishlist')
                .set('Authorization', auth)
                .send({ product: { name: 'sin id' } });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message: 'A product with an _id is required' });
        });
    });

    describe('carrito', () => {
        it('agrega un producto, actualiza su cantidad y lo elimina', async () => {
            const { auth } = await registrar();

            const agregado = await request(app)
                .put('/customer/cart')
                .set('Authorization', auth)
                .send({ product: producto, qty: 2 });

            expect(agregado.status).toBe(200);
            expect(agregado.body).toHaveLength(1);
            expect(agregado.body[0]).toMatchObject({ unit: 2 });
            expect(agregado.body[0].product).toMatchObject({ _id: 'p1', price: 18000 });

            // Volver a agregar el mismo producto reemplaza la cantidad, no crea otra linea.
            const actualizado = await request(app)
                .put('/customer/cart')
                .set('Authorization', auth)
                .send({ product: producto, qty: 5 });

            expect(actualizado.body).toHaveLength(1);
            expect(actualizado.body[0].unit).toBe(5);

            const eliminado = await request(app).delete('/customer/cart/p1').set('Authorization', auth);

            expect(eliminado.status).toBe(200);
            expect(eliminado.body).toEqual([]);
        });

        it('DELETE /customer/cart vacia el carrito completo', async () => {
            const { auth } = await registrar();

            await request(app).put('/customer/cart').set('Authorization', auth).send({ product: producto, qty: 1 });
            await request(app)
                .put('/customer/cart')
                .set('Authorization', auth)
                .send({ product: { ...producto, _id: 'p2' }, qty: 4 });

            const antes = await request(app).get('/customer/cart').set('Authorization', auth);

            expect(antes.body).toHaveLength(2);

            const vaciado = await request(app).delete('/customer/cart').set('Authorization', auth);

            expect(vaciado.status).toBe(200);
            expect(vaciado.body).toEqual([]);

            const despues = await request(app).get('/customer/cart').set('Authorization', auth);

            expect(despues.body).toEqual([]);
        });

        it.each([
            ['sin producto', {}, 'A product with an _id is required'],
            ['con qty cero', { product: producto, qty: 0 }, 'qty must be a positive integer'],
            ['con qty negativa', { product: producto, qty: -1 }, 'qty must be a positive integer'],
            ['con qty decimal', { product: producto, qty: 1.5 }, 'qty must be a positive integer'],
            ['con qty no numerica', { product: producto, qty: 'dos' }, 'qty must be a positive integer'],
        ])('responde 400 %s', async (_caso, body, message) => {
            const { auth } = await registrar();

            const response = await request(app).put('/customer/cart').set('Authorization', auth).send(body);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message });
        });
    });

    describe('GET /customer/summary', () => {
        it('resume carrito, wishlist y ordenes del cliente', async () => {
            const { auth } = await registrar();

            await request(app).put('/customer/cart').set('Authorization', auth).send({ product: producto, qty: 2 });
            await request(app).put('/customer/wishlist').set('Authorization', auth).send({ product: producto });

            const response = await request(app).get('/customer/summary').set('Authorization', auth);

            expect(response.status).toBe(200);
            expect(Object.keys(response.body).sort()).toEqual(['cart', 'orders', 'wishlist']);
            expect(response.body.cart).toHaveLength(1);
            expect(response.body.wishlist).toHaveLength(1);
            expect(response.body.orders).toEqual([]);
        });
    });

    describe('cuando el servicio falla', () => {
        it.each([
            ['post', '/customer/address', 'AddNewAddress'],
            ['get', '/customer/profile', 'GetProfile'],
            ['get', '/customer/summary', 'GetCustomerSummary'],
            ['get', '/customer/wishlist', 'GetWishList'],
            ['delete', '/customer/wishlist/p1', 'RemoveFromWishlist'],
            ['get', '/customer/cart', 'GetCart'],
            ['delete', '/customer/cart', 'ClearCart'],
            ['delete', '/customer/cart/p1', 'RemoveFromCart'],
        ])('%s %s delega el error al manejador central', async (metodo, ruta, metodoServicio) => {
            const CustomerService = require('../../src/services/customer-service');
            const { APIError } = require('../../src/utils/app-errors');
            const { auth } = await registrar();

            jest.spyOn(CustomerService.prototype, metodoServicio).mockRejectedValue(
                new APIError('Data Not Found', 404, 'fallo simulado'),
            );

            const peticion = request(app)[metodo](ruta).set('Authorization', auth);
            // Las rutas POST desestructuran req.body, que en Express 5 llega
            // undefined si la peticion no trae cuerpo.
            const response = metodo === 'post' ? await peticion.send({}) : await peticion;

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: 'fallo simulado' });
        });
    });

    describe('cliente inexistente', () => {
        it('responde 400 cuando el token apunta a un cliente que ya no existe', async () => {
            const { auth } = await registrar();

            await CustomerModel.deleteMany({});

            const response = await request(app).get('/customer/cart').set('Authorization', auth);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message: 'Customer not found' });
        });
    });
});
