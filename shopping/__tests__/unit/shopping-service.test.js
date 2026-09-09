// Pruebas unitarias del ShoppingService. Se reemplazan sus dos dependencias
// por dobles: la capa de datos (nada de Mongo) y el cliente HTTP del catalogo
// (nada de red). Solo se ejercita la logica del servicio.

const mockRepository = {
    CreateOrder: jest.fn(),
    FindById: jest.fn(),
    FindByUserId: jest.fn(),
};

// El servicio hace `new OrderRepository()` en su constructor: se mockea el
// indice de la capa de datos para que devuelva siempre el mismo doble.
jest.mock('../../src/database', () => ({
    databaseConnection: jest.fn(),
    OrderRepository: jest.fn(() => mockRepository),
}));

jest.mock('../../src/clients/products-client', () => ({
    GetProduct: jest.fn(),
    GetProductsByIds: jest.fn(),
    TryGetProductsByIds: jest.fn(),
}));

const ShoppingService = require('../../src/services/shopping-service');
const productsClient = require('../../src/clients/products-client');
const { APIError, BadRequestError, ServiceUnavailableError } = require('../../src/utils/app-errors');

const SEDAN = { _id: 'p1', name: 'Sedan Clasico', price: 125, available: true, banner: 'sedan.jpg' };

const catalogoCon = (...productos) => new Map(productos.map((p) => [p._id, p]));

const nuevaOrden = (override = {}) => ({
    userId: 'user-1',
    txnId: 'txn-1',
    items: [{ productId: 'p1', quantity: 2 }],
    ...override,
});

describe('ShoppingService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        productsClient.GetProductsByIds.mockResolvedValue(catalogoCon(SEDAN));
        productsClient.TryGetProductsByIds.mockResolvedValue(new Map());
        mockRepository.CreateOrder.mockResolvedValue({});
        service = new ShoppingService();
    });

    describe('CreateOrder', () => {
        it('persiste la orden y la devuelve envuelta en { data }', async () => {
            const persisted = { _id: 'order-1', userId: 'user-1', status: 'received' };
            mockRepository.CreateOrder.mockResolvedValue(persisted);

            const result = await service.CreateOrder(nuevaOrden());

            expect(result).toEqual({ data: persisted });
            expect(mockRepository.CreateOrder).toHaveBeenCalledTimes(1);
        });

        it('completa status, date y las lineas validadas antes de llegar al repositorio', async () => {
            await service.CreateOrder(nuevaOrden());

            const [argument] = mockRepository.CreateOrder.mock.calls[0];

            expect(argument).toMatchObject({
                userId: 'user-1',
                txnId: 'txn-1',
                status: 'received',
                items: [{ productId: 'p1', name: 'Sedan Clasico', price: 125, quantity: 2 }],
            });
            expect(argument.date).toBeInstanceOf(Date);
        });

        // El _id lo genera Mongoose en la capa de datos. El servicio no conoce
        // mongoose: si volviera a generarlo aqui, la capa de negocio estaria
        // otra vez atada al motor de persistencia.
        it('no inventa el _id: eso es de la capa de datos', async () => {
            await service.CreateOrder(nuevaOrden());

            const [argument] = mockRepository.CreateOrder.mock.calls[0];

            expect(argument).not.toHaveProperty('_id');
        });

        describe('el precio lo pone el catalogo, no el cliente', () => {
            it('calcula el importe con el precio de products e ignora el que envie el cliente', async () => {
                await service.CreateOrder(nuevaOrden({
                    items: [{ productId: 'p1', quantity: 2, price: 1, name: 'Regalado' }],
                }));

                const [argument] = mockRepository.CreateOrder.mock.calls[0];

                expect(argument.amount).toBe(250);
                expect(argument.items[0]).toMatchObject({ price: 125, name: 'Sedan Clasico' });
            });

            it('suma varias lineas con los precios del catalogo', async () => {
                const suv = { _id: 'p2', name: 'SUV', price: 300, available: true };
                productsClient.GetProductsByIds.mockResolvedValue(catalogoCon(SEDAN, suv));

                await service.CreateOrder(nuevaOrden({
                    items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
                }));

                expect(mockRepository.CreateOrder.mock.calls[0][0].amount).toBe(550);
            });

            it('consulta el catalogo con todos los productId de la orden', async () => {
                const suv = { _id: 'p2', name: 'SUV', price: 300, available: true };
                productsClient.GetProductsByIds.mockResolvedValue(catalogoCon(SEDAN, suv));

                await service.CreateOrder(nuevaOrden({
                    items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
                }));

                expect(productsClient.GetProductsByIds).toHaveBeenCalledWith(['p1', 'p2']);
            });
        });

        it('rechaza con 400 un producto que no existe en el catalogo', async () => {
            productsClient.GetProductsByIds.mockResolvedValue(new Map());

            const promise = service.CreateOrder(nuevaOrden());

            await expect(promise).rejects.toBeInstanceOf(BadRequestError);
            await expect(promise).rejects.toMatchObject({
                statusCode: 400,
                message: 'These products are not in the catalogue: p1',
            });
            expect(mockRepository.CreateOrder).not.toHaveBeenCalled();
        });

        it('rechaza con 400 un producto marcado como no disponible', async () => {
            productsClient.GetProductsByIds.mockResolvedValue(
                catalogoCon({ ...SEDAN, available: false }),
            );

            await expect(service.CreateOrder(nuevaOrden())).rejects.toMatchObject({
                statusCode: 400,
                message: 'These products are no longer available: p1',
            });
            expect(mockRepository.CreateOrder).not.toHaveBeenCalled();
        });

        // Decision de diseno explicita: en la lectura se degrada, en la
        // escritura no. Una orden con un importe que nadie pudo verificar es
        // peor que una orden que no se creo.
        it('propaga el 503 si el catalogo esta caido y no guarda nada', async () => {
            productsClient.GetProductsByIds.mockRejectedValue(
                new ServiceUnavailableError('El microservicio "products" no esta disponible'),
            );

            const promise = service.CreateOrder(nuevaOrden());

            await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableError);
            await expect(promise).rejects.toMatchObject({ statusCode: 503 });
            expect(mockRepository.CreateOrder).not.toHaveBeenCalled();
        });

        it.each([
            ['sin userId', { userId: undefined }, 'User id is required'],
            ['con userId vacio', { userId: '' }, 'User id is required'],
            ['sin items', { items: undefined }, 'Order items are required'],
            ['con items vacios', { items: [] }, 'Order items are required'],
            ['con items que no son arreglo', { items: 'p1' }, 'Order items are required'],
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
                'con cantidad negativa',
                { items: [{ productId: 'p1', quantity: -2 }] },
                'Every order item needs a quantity of at least 1',
            ],
            [
                'con cantidad fraccionaria',
                { items: [{ productId: 'p1', quantity: 1.5 }] },
                'Every order item needs a quantity of at least 1',
            ],
            [
                'con cantidad no numerica',
                { items: [{ productId: 'p1', quantity: 'dos' }] },
                'Every order item needs a quantity of at least 1',
            ],
        ])('rechaza la orden %s con 400', async (_caso, override, message) => {
            const input = nuevaOrden(override);

            await expect(service.CreateOrder(input)).rejects.toBeInstanceOf(BadRequestError);
            await expect(service.CreateOrder(input)).rejects.toMatchObject({ statusCode: 400, message });
            expect(mockRepository.CreateOrder).not.toHaveBeenCalled();
        });

        it('valida antes de salir a la red: una orden invalida no consulta el catalogo', async () => {
            await expect(service.CreateOrder(nuevaOrden({ items: [] }))).rejects.toBeInstanceOf(
                BadRequestError,
            );

            expect(productsClient.GetProductsByIds).not.toHaveBeenCalled();
        });

        it('traduce un error inesperado del repositorio a APIError 500', async () => {
            mockRepository.CreateOrder.mockRejectedValue(new Error('conexion perdida'));

            await expect(service.CreateOrder(nuevaOrden())).rejects.toMatchObject({
                name: 'CreateOrderError',
                statusCode: 500,
                message: 'conexion perdida',
            });
        });

        it('propaga sin envolver los APIError que vienen del repositorio', async () => {
            const original = new BadRequestError('orden duplicada');
            mockRepository.CreateOrder.mockRejectedValue(original);

            await expect(service.CreateOrder(nuevaOrden())).rejects.toBe(original);
        });
    });

    describe('GetOrdersByUser', () => {
        const orden = () => ({
            _id: 'o1',
            userId: 'user-1',
            amount: 250,
            items: [{ productId: 'p1', name: 'Sedan Clasico', price: 125, quantity: 2 }],
        });

        it('devuelve las ordenes del usuario envueltas en { data }', async () => {
            mockRepository.FindByUserId.mockResolvedValue([orden()]);

            const result = await service.GetOrdersByUser('user-1');

            expect(result.data).toHaveLength(1);
            expect(mockRepository.FindByUserId).toHaveBeenCalledWith('user-1');
        });

        it('enriquece cada linea con el precio actual del catalogo', async () => {
            mockRepository.FindByUserId.mockResolvedValue([orden()]);
            productsClient.TryGetProductsByIds.mockResolvedValue(
                catalogoCon({ ...SEDAN, price: 150 }),
            );

            const { data } = await service.GetOrdersByUser('user-1');

            expect(data[0].items[0]).toMatchObject({
                price: 125, // el precio historico no se toca
                currentProduct: { name: 'Sedan Clasico', price: 150, available: true },
                priceChanged: true,
            });
        });

        it('marca priceChanged en false cuando el precio sigue igual', async () => {
            mockRepository.FindByUserId.mockResolvedValue([orden()]);
            productsClient.TryGetProductsByIds.mockResolvedValue(catalogoCon(SEDAN));

            const { data } = await service.GetOrdersByUser('user-1');

            expect(data[0].items[0].priceChanged).toBe(false);
        });

        // Degradacion, no caida: con products apagado el historial se sigue
        // devolviendo, solo que sin el precio actual.
        it('devuelve el historial aunque el catalogo este caido', async () => {
            mockRepository.FindByUserId.mockResolvedValue([orden()]);
            productsClient.TryGetProductsByIds.mockResolvedValue(new Map());

            const { data } = await service.GetOrdersByUser('user-1');

            expect(data[0].items[0]).toMatchObject({
                name: 'Sedan Clasico',
                price: 125,
                currentProduct: null,
                priceChanged: null,
            });
        });

        it('convierte los documentos de Mongoose a objetos planos antes de enriquecer', async () => {
            const documento = { ...orden(), toObject: function () { return { ...orden() }; } };
            mockRepository.FindByUserId.mockResolvedValue([documento]);

            const { data } = await service.GetOrdersByUser('user-1');

            expect(data[0]).not.toHaveProperty('toObject');
            expect(data[0]._id).toBe('o1');
        });

        it('no consulta el catalogo cuando el usuario no tiene ordenes', async () => {
            mockRepository.FindByUserId.mockResolvedValue([]);

            const { data } = await service.GetOrdersByUser('user-1');

            expect(data).toEqual([]);
            expect(productsClient.TryGetProductsByIds).toHaveBeenCalledWith([]);
        });

        it('propaga sin envolver los APIError que vienen del repositorio', async () => {
            const original = new APIError('NotFoundError', 404, 'Order not found');
            mockRepository.FindByUserId.mockRejectedValue(original);

            await expect(service.GetOrdersByUser('user-1')).rejects.toBe(original);
        });

        it('traduce un error inesperado del repositorio a APIError 500', async () => {
            mockRepository.FindByUserId.mockRejectedValue(new Error('timeout'));

            const promise = service.GetOrdersByUser('user-1');

            await expect(promise).rejects.toBeInstanceOf(APIError);
            await expect(promise).rejects.toMatchObject({
                name: 'GetOrdersByUserError',
                statusCode: 500,
                message: 'timeout',
            });
        });
    });
});
