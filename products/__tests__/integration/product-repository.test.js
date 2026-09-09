// Pruebas de integracion del ProductRepository contra MongoDB en memoria.
const db = require('../helpers/db');

describe('ProductRepository (integracion)', () => {
    let repository;
    let ProductModel;
    let NotFoundError;

    beforeAll(async () => {
        await db.connect();

        const ProductRepository = require('../../src/database/repository/product-repository');
        ({ ProductModel } = require('../../src/database/models'));
        ({ NotFoundError } = require('../../src/utils/app-errors'));

        repository = new ProductRepository();
    });

    afterEach(async () => {
        await db.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    describe('FindAll', () => {
        it('devuelve todos los productos guardados', async () => {
            await ProductModel.create([
                { name: 'Sedan Clasico', type: 'sedan', price: 18000 },
                { name: 'SUV Familiar', type: 'suv', price: 32000 },
            ]);

            const productos = await repository.FindAll();

            expect(productos).toHaveLength(2);
            expect(productos.map((producto) => producto.name).sort()).toEqual(['SUV Familiar', 'Sedan Clasico']);
        });

        it('devuelve un arreglo vacio cuando no hay productos', async () => {
            await expect(repository.FindAll()).resolves.toEqual([]);
        });
    });

    describe('FindById', () => {
        it('devuelve el producto con los valores por defecto del schema', async () => {
            const creado = await ProductModel.create({ name: 'Pickup 4x4', type: 'truck', price: 35000 });

            const producto = await repository.FindById(creado._id);

            expect(producto.name).toBe('Pickup 4x4');
            expect(producto.available).toBe(true);
            expect(producto.createdAt).toBeInstanceOf(Date);
        });

        it('lanza NotFoundError cuando el id no existe', async () => {
            const promise = repository.FindById('650000000000000000000099');

            await expect(promise).rejects.toBeInstanceOf(NotFoundError);
            await expect(promise).rejects.toMatchObject({ statusCode: 404, message: 'Product not found' });
        });
    });

    describe('validaciones del schema', () => {
        it('rechaza un producto sin nombre, tipo o precio', async () => {
            await expect(ProductModel.create({ desc: 'incompleto' })).rejects.toThrow(/validation failed/i);
        });
    });
});
