// Pruebas de integracion de los endpoints HTTP del microservicio products
// sobre la app real de Express y un MongoDB en memoria.
const express = require('express');
const request = require('supertest');

const db = require('../helpers/db');

const catalogo = [
    { name: 'Sedan Clasico', desc: 'Sedan de 4 puertas', type: 'sedan', price: 18000, available: true },
    { name: 'Sedan Ejecutivo', desc: 'Sedan full equipo', type: 'sedan', price: 25000, available: true },
    { name: 'SUV Familiar', desc: 'SUV de 7 puestos', type: 'suv', price: 32000, available: false },
];

describe('API /products (integracion)', () => {
    let app;
    let ProductModel;

    beforeAll(async () => {
        await db.connect();

        app = express();
        await require('../../src/express-app')(app);

        ({ ProductModel } = require('../../src/database/models'));
    });

    afterEach(async () => {
        await db.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    const sembrarCatalogo = () => ProductModel.create(catalogo);

    describe('GET /health', () => {
        it('reporta el servicio arriba', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ service: 'products', status: 'up' });
        });
    });

    describe('GET /products', () => {
        it('devuelve el catalogo completo con sus categorias', async () => {
            await sembrarCatalogo();

            const response = await request(app).get('/products');

            expect(response.status).toBe(200);
            expect(response.body.products).toHaveLength(3);
            expect(response.body.categories.sort()).toEqual(['sedan', 'suv']);
            expect(response.body.products[0]).toMatchObject({
                name: expect.any(String),
                type: expect.any(String),
                price: expect.any(Number),
            });
        });

        it('devuelve listas vacias cuando el catalogo esta vacio', async () => {
            const response = await request(app).get('/products');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ products: [], categories: [] });
        });
    });

    describe('cuando el servicio falla', () => {
        it('delega el error al manejador central y responde con su statusCode', async () => {
            const ProductsService = require('../../src/services/products-service');
            const { APIError } = require('../../src/utils/app-errors');

            jest.spyOn(ProductsService.prototype, 'GetProducts').mockRejectedValue(
                new APIError('GetProductsError', 500, 'fallo interno'),
            );

            const response = await request(app).get('/products');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: 'fallo interno' });
        });
    });

    describe('GET /products/:id', () => {
        it('devuelve el producto solicitado', async () => {
            const [sedan] = await sembrarCatalogo();

            const response = await request(app).get(`/products/${sedan._id}`);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                _id: sedan._id.toString(),
                name: 'Sedan Clasico',
                type: 'sedan',
                price: 18000,
            });
        });

        it('responde 404 cuando el id no existe en el catalogo', async () => {
            const response = await request(app).get('/products/650000000000000000000099');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: 'Product not found' });
        });

        it('responde 500 cuando el id no es un ObjectId valido', async () => {
            // El CastError de Mongoose no es un APIError, por lo que el servicio
            // lo envuelve como GetProductByIdError (500) y no como 400.
            const response = await request(app).get('/products/no-es-un-object-id');

            expect(response.status).toBe(500);
            expect(response.body.message).toEqual(expect.any(String));
        });
    });
});
