// Pruebas unitarias del ProductsService con el repositorio mockeado:
// se comprueba el calculo de categorias, el formato de respuesta y la
// traduccion de errores sin depender de MongoDB.

const mockRepository = {
    FindAll: jest.fn(),
    FindById: jest.fn(),
};

jest.mock('../../src/database', () => ({
    databaseConnection: jest.fn(),
    ProductRepository: jest.fn(() => mockRepository),
}));

const ProductsService = require('../../src/services/products-service');
const { APIError, NotFoundError } = require('../../src/utils/app-errors');

const catalogo = [
    { _id: 'p1', name: 'Sedan Clasico', type: 'sedan', price: 18000 },
    { _id: 'p2', name: 'Sedan Ejecutivo', type: 'sedan', price: 25000 },
    { _id: 'p3', name: 'SUV Familiar', type: 'suv', price: 32000 },
];

describe('ProductsService', () => {
    let service;

    beforeEach(() => {
        service = new ProductsService();
    });

    describe('GetProducts', () => {
        it('devuelve el catalogo con las categorias sin repetir', async () => {
            mockRepository.FindAll.mockResolvedValue(catalogo);

            const { data } = await service.GetProducts();

            expect(data.products).toEqual(catalogo);
            expect(data.categories).toEqual(['sedan', 'suv']);
            expect(mockRepository.FindAll).toHaveBeenCalledTimes(1);
        });

        it('conserva el orden de aparicion de las categorias', async () => {
            mockRepository.FindAll.mockResolvedValue([
                { type: 'suv' },
                { type: 'sedan' },
                { type: 'suv' },
                { type: 'truck' },
            ]);

            const { data } = await service.GetProducts();

            expect(data.categories).toEqual(['suv', 'sedan', 'truck']);
        });

        it('devuelve listas vacias cuando no hay productos', async () => {
            mockRepository.FindAll.mockResolvedValue([]);

            await expect(service.GetProducts()).resolves.toEqual({ data: { products: [], categories: [] } });
        });

        it('traduce un error del repositorio a APIError 500', async () => {
            mockRepository.FindAll.mockRejectedValue(new Error('mongo caido'));

            const promise = service.GetProducts();

            await expect(promise).rejects.toBeInstanceOf(APIError);
            await expect(promise).rejects.toMatchObject({
                name: 'GetProductsError',
                statusCode: 500,
                message: 'mongo caido',
            });
        });
    });

    describe('GetProductById', () => {
        it('devuelve el producto envuelto en { data }', async () => {
            mockRepository.FindById.mockResolvedValue(catalogo[0]);

            await expect(service.GetProductById('p1')).resolves.toEqual({ data: catalogo[0] });
            expect(mockRepository.FindById).toHaveBeenCalledWith('p1');
        });

        it('propaga el NotFoundError del repositorio sin convertirlo en 500', async () => {
            const noEncontrado = new NotFoundError('Product not found');
            mockRepository.FindById.mockRejectedValue(noEncontrado);

            await expect(service.GetProductById('p404')).rejects.toBe(noEncontrado);
        });

        it('traduce un error inesperado a APIError 500', async () => {
            mockRepository.FindById.mockRejectedValue(new Error('id malformado'));

            await expect(service.GetProductById('xxx')).rejects.toMatchObject({
                name: 'GetProductByIdError',
                statusCode: 500,
                message: 'id malformado',
            });
        });
    });
});
