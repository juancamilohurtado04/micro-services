// Pruebas de integracion del repositorio contra MongoDB en memoria:
// verifican las consultas reales (filtros, orden y errores de dominio).
const db = require('../helpers/db');

const USER_ID = '650000000000000000000001';

describe('OrderRepository (integracion)', () => {
    let repository;
    let OrderModel;
    let NotFoundError;

    beforeAll(async () => {
        await db.connect();

        const OrderRepository = require('../../src/database/repository/shopping-repository');
        ({ OrderModel } = require('../../src/database/models'));
        ({ NotFoundError } = require('../../src/utils/app-errors'));

        repository = new OrderRepository();
    });

    afterEach(async () => {
        await db.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    const crearOrden = (override = {}) =>
        repository.CreateOrder({
            userId: USER_ID,
            txnId: 'txn-001',
            amount: 100,
            items: [{ productId: 'p1', quantity: 1 }],
            ...override,
        });

    describe('CreateOrder', () => {
        it('guarda la orden con los valores por defecto del schema', async () => {
            const orden = await crearOrden();

            expect(orden._id).toBeDefined();
            expect(orden.status).toBe('received');
            expect(orden.date).toBeInstanceOf(Date);
            expect(orden.createdAt).toBeInstanceOf(Date);
            await expect(OrderModel.countDocuments()).resolves.toBe(1);
        });

        it('rechaza una orden sin los campos requeridos por el schema', async () => {
            await expect(repository.CreateOrder({ txnId: 'txn-001' })).rejects.toThrow(/validation failed/i);
        });
    });

    describe('FindById', () => {
        it('devuelve la orden existente', async () => {
            const creada = await crearOrden();

            const encontrada = await repository.FindById(creada._id);

            expect(encontrada._id.toString()).toBe(creada._id.toString());
            expect(encontrada.txnId).toBe('txn-001');
        });

        it('lanza NotFoundError cuando el id no existe', async () => {
            const promise = repository.FindById('650000000000000000000099');

            await expect(promise).rejects.toBeInstanceOf(NotFoundError);
            await expect(promise).rejects.toMatchObject({ statusCode: 404, message: 'Order not found' });
        });
    });

    describe('FindByUserId', () => {
        it('filtra por usuario y ordena por createdAt descendente', async () => {
            await crearOrden({ txnId: 'txn-1' });
            await new Promise((resolve) => setTimeout(resolve, 20));
            await crearOrden({ txnId: 'txn-2' });
            await crearOrden({ userId: '650000000000000000000002', txnId: 'txn-de-otro' });

            const ordenes = await repository.FindByUserId(USER_ID);

            expect(ordenes.map((orden) => orden.txnId)).toEqual(['txn-2', 'txn-1']);
        });

        it('devuelve un arreglo vacio cuando el usuario no tiene ordenes', async () => {
            await expect(repository.FindByUserId('650000000000000000000404')).resolves.toEqual([]);
        });
    });
});
