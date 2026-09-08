// Pruebas de integracion del CustomerRepository contra MongoDB en memoria.
// Cubren los metodos que no estan expuestos por HTTP (PlaceOrder) y las
// invariantes de carrito y wishlist directamente sobre el documento guardado.
const db = require('../helpers/db');

const producto = { _id: 'p1', name: 'Sedan Clasico', type: 'sedan', price: 18000, available: true };

describe('CustomerRepository (integracion)', () => {
    let repository;
    let CustomerModel;
    let BadRequestError;

    beforeAll(async () => {
        await db.connect();

        const CustomerRepository = require('../../src/database/repository/customer-repository');
        ({ CustomerModel } = require('../../src/database/models'));
        ({ BadRequestError } = require('../../src/utils/app-errors'));

        repository = new CustomerRepository();

        await db.syncIndexes();
    });

    afterEach(async () => {
        await db.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    const crearCliente = () =>
        repository.CreateCustomer({
            email: 'ana@example.com',
            password: 'hash',
            salt: 'salt',
            phone: '3001234567',
        });

    describe('CreateCustomer', () => {
        it('guarda el cliente con carrito, wishlist y ordenes vacios', async () => {
            const cliente = await crearCliente();

            expect(cliente._id).toBeDefined();
            expect(cliente.cart).toEqual([]);
            expect(cliente.wishlist).toEqual([]);
            expect(cliente.orders).toEqual([]);
        });

        it('traduce la violacion del indice unico en BadRequestError', async () => {
            await crearCliente();

            const promise = crearCliente();

            await expect(promise).rejects.toBeInstanceOf(BadRequestError);
            await expect(promise).rejects.toMatchObject({ statusCode: 400, message: 'Email already registered' });
        });
    });

    it('traduce cualquier otro fallo de Mongo en APIError 500', async () => {
        jest.spyOn(CustomerModel, 'create').mockRejectedValueOnce(new Error('mongo caido'));

        await expect(crearCliente()).rejects.toMatchObject({
            name: 'CreateCustomerError',
            statusCode: 500,
            message: 'mongo caido',
        });
    });

    describe('FindCustomer', () => {
        it('encuentra el cliente por email y devuelve null si no existe', async () => {
            await crearCliente();

            await expect(repository.FindCustomer({ email: 'ana@example.com' })).resolves.not.toBeNull();
            await expect(repository.FindCustomer({ email: 'nadie@example.com' })).resolves.toBeNull();
        });
    });

    describe('AddNewAddress', () => {
        it('crea la direccion y guarda su referencia en el cliente', async () => {
            const cliente = await crearCliente();

            const direccion = await repository.AddNewAddress(cliente._id, {
                street: 'Calle 10',
                postalCode: '050001',
                city: 'Medellin',
                country: 'CO',
            });

            const perfil = await repository.GetProfile(cliente._id);

            expect(perfil.address).toHaveLength(1);
            expect(perfil.address[0]._id.toString()).toBe(direccion._id.toString());
            expect(perfil.address[0].city).toBe('Medellin');
        });

        it('rechaza con 400 si el cliente no existe', async () => {
            const promise = repository.AddNewAddress('650000000000000000000099', {
                street: 'Calle 10',
                postalCode: '050001',
                city: 'Medellin',
                country: 'CO',
            });

            await expect(promise).rejects.toMatchObject({ statusCode: 400, message: 'Customer not found' });
        });
    });

    describe('carrito', () => {
        it('reemplaza la cantidad en vez de duplicar la linea', async () => {
            const cliente = await crearCliente();

            await repository.AddToCart(cliente._id, producto, 2);
            const carrito = await repository.AddToCart(cliente._id, producto, 5);

            expect(carrito).toHaveLength(1);
            expect(carrito[0].unit).toBe(5);

            const guardado = await CustomerModel.findById(cliente._id);

            expect(guardado.cart).toHaveLength(1);
            expect(guardado.cart[0].unit).toBe(5);
        });

        it('ClearCart deja el carrito vacio en la base de datos', async () => {
            const cliente = await crearCliente();

            await repository.AddToCart(cliente._id, producto, 2);
            await repository.AddToCart(cliente._id, { ...producto, _id: 'p2' }, 1);

            await expect(repository.ClearCart(cliente._id)).resolves.toEqual([]);

            const guardado = await CustomerModel.findById(cliente._id);

            expect(guardado.cart).toEqual([]);
        });

        it.each([
            ['ClearCart', (repo) => repo.ClearCart('650000000000000000000099')],
            ['GetCart', (repo) => repo.GetCart('650000000000000000000099')],
            ['PlaceOrder', (repo) => repo.PlaceOrder('650000000000000000000099', { _id: 'o1' })],
        ])('%s rechaza con 400 si el cliente no existe', async (_caso, ejecutar) => {
            await expect(ejecutar(repository)).rejects.toMatchObject({
                statusCode: 400,
                message: 'Customer not found',
            });
        });
    });

    describe('PlaceOrder', () => {
        it('agrega la orden al historial y vacia el carrito', async () => {
            const cliente = await crearCliente();
            await repository.AddToCart(cliente._id, producto, 2);

            const orden = {
                _id: '650000000000000000000010',
                amount: 36000,
                txnId: 'txn-001',
                items: [{ product: producto, unit: 2 }],
            };

            await expect(repository.PlaceOrder(cliente._id, orden)).resolves.toBe(orden);

            const guardado = await CustomerModel.findById(cliente._id);

            expect(guardado.cart).toEqual([]);
            expect(guardado.orders).toHaveLength(1);
            expect(guardado.orders[0]).toMatchObject({ txnId: 'txn-001', amount: 36000, status: 'received' });
        });
    });

    describe('wishlist', () => {
        it('no agrega dos veces el mismo producto y lo elimina por id', async () => {
            const cliente = await crearCliente();

            await repository.AddToWishlist(cliente._id, producto);
            const wishlist = await repository.AddToWishlist(cliente._id, producto);

            expect(wishlist).toHaveLength(1);

            await expect(repository.RemoveFromWishlist(cliente._id, 'p1')).resolves.toHaveLength(0);
        });
    });
});
