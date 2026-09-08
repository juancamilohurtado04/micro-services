// Pruebas unitarias del CustomerService con la capa de datos mockeada.
// Se ejercitan el hash de contrasenas, la emision de tokens, la delegacion al
// repositorio y la traduccion de errores; nunca se toca MongoDB.

const mockRepository = {
    CreateCustomer: jest.fn(),
    FindCustomer: jest.fn(),
    AddNewAddress: jest.fn(),
    GetProfile: jest.fn(),
    GetWishList: jest.fn(),
    AddToWishlist: jest.fn(),
    RemoveFromWishlist: jest.fn(),
    AddToCart: jest.fn(),
    RemoveFromCart: jest.fn(),
    ClearCart: jest.fn(),
    GetCart: jest.fn(),
    PlaceOrder: jest.fn(),
};

jest.mock('../../src/database', () => ({
    databaseConnection: jest.fn(),
    CustomerRepository: jest.fn(() => mockRepository),
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const CustomerService = require('../../src/services/customer-service');
const { APP_SECRET } = require('../../src/config');
const { APIError, BadRequestError } = require('../../src/utils/app-errors');

const CUSTOMER_ID = '650000000000000000000001';

describe('CustomerService', () => {
    let service;

    beforeEach(() => {
        service = new CustomerService();
    });

    describe('SignUp', () => {
        it('guarda la contrasena hasheada junto a su salt, nunca en texto plano', async () => {
            mockRepository.CreateCustomer.mockResolvedValue({ _id: CUSTOMER_ID, email: 'ana@example.com' });

            await service.SignUp({ email: 'ana@example.com', password: 'secreta123', phone: '3001234567' });

            const [argument] = mockRepository.CreateCustomer.mock.calls[0];

            expect(argument.email).toBe('ana@example.com');
            expect(argument.phone).toBe('3001234567');
            expect(argument.password).not.toBe('secreta123');
            expect(argument.salt).toEqual(expect.any(String));
            await expect(bcrypt.compare('secreta123', argument.password)).resolves.toBe(true);
        });

        it('devuelve el id y un token verificable con APP_SECRET', async () => {
            mockRepository.CreateCustomer.mockResolvedValue({ _id: CUSTOMER_ID, email: 'ana@example.com' });

            const { data } = await service.SignUp({ email: 'ana@example.com', password: 'secreta123' });

            expect(data.id).toBe(CUSTOMER_ID);
            expect(jwt.verify(data.token, APP_SECRET)).toMatchObject({
                _id: CUSTOMER_ID,
                email: 'ana@example.com',
            });
        });

        it('propaga el BadRequestError de email duplicado sin envolverlo', async () => {
            const duplicado = new BadRequestError('Email already registered');
            mockRepository.CreateCustomer.mockRejectedValue(duplicado);

            await expect(service.SignUp({ email: 'ana@example.com', password: 'x' })).rejects.toBe(duplicado);
        });

        it('traduce un error inesperado a APIError 500', async () => {
            mockRepository.CreateCustomer.mockRejectedValue(new Error('mongo caido'));

            await expect(service.SignUp({ email: 'ana@example.com', password: 'x' })).rejects.toMatchObject({
                name: 'SignUpError',
                statusCode: 500,
                message: 'mongo caido',
            });
        });
    });

    describe('SignIn', () => {
        const buildCustomer = async (password = 'secreta123') => {
            const salt = await bcrypt.genSalt();

            return { _id: CUSTOMER_ID, email: 'ana@example.com', salt, password: await bcrypt.hash(password, salt) };
        };

        it('devuelve id y token cuando las credenciales son correctas', async () => {
            mockRepository.FindCustomer.mockResolvedValue(await buildCustomer());

            const { data } = await service.SignIn({ email: 'ana@example.com', password: 'secreta123' });

            expect(mockRepository.FindCustomer).toHaveBeenCalledWith({ email: 'ana@example.com' });
            expect(data.id).toBe(CUSTOMER_ID);
            expect(jwt.verify(data.token, APP_SECRET)).toMatchObject({ _id: CUSTOMER_ID });
        });

        it('rechaza con 400 cuando la contrasena no coincide', async () => {
            mockRepository.FindCustomer.mockResolvedValue(await buildCustomer());

            const promise = service.SignIn({ email: 'ana@example.com', password: 'equivocada' });

            await expect(promise).rejects.toBeInstanceOf(BadRequestError);
            await expect(promise).rejects.toMatchObject({ statusCode: 400, message: 'Invalid credentials' });
        });

        it('rechaza con 400 y el mismo mensaje cuando el email no existe (no filtra si el usuario existe)', async () => {
            mockRepository.FindCustomer.mockResolvedValue(null);

            await expect(service.SignIn({ email: 'nadie@example.com', password: 'x' })).rejects.toMatchObject({
                statusCode: 400,
                message: 'Invalid credentials',
            });
        });

        it('traduce un error inesperado a APIError 500', async () => {
            mockRepository.FindCustomer.mockRejectedValue(new Error('timeout'));

            await expect(service.SignIn({ email: 'ana@example.com', password: 'x' })).rejects.toMatchObject({
                name: 'SignInError',
                statusCode: 500,
            });
        });
    });

    describe('GetCustomerSummary', () => {
        it('arma el resumen a partir del perfil completo', async () => {
            mockRepository.GetProfile.mockResolvedValue({
                _id: CUSTOMER_ID,
                email: 'ana@example.com',
                cart: [{ unit: 2 }],
                wishlist: [{ _id: 'p1' }],
                orders: [{ _id: 'o1' }],
                address: [{ city: 'Medellin' }],
            });

            const { data } = await service.GetCustomerSummary(CUSTOMER_ID);

            expect(data).toEqual({
                cart: [{ unit: 2 }],
                wishlist: [{ _id: 'p1' }],
                orders: [{ _id: 'o1' }],
            });
            expect(data.email).toBeUndefined();
        });
    });

    // Metodos que solo delegan en el repositorio y envuelven el resultado.
    describe('delegacion al repositorio', () => {
        const producto = { _id: 'p1', name: 'Sedan', price: 18000 };

        it.each([
            ['GetProfile', [{ _id: CUSTOMER_ID }], 'GetProfile', [CUSTOMER_ID]],
            ['GetWishList', [CUSTOMER_ID], 'GetWishList', [CUSTOMER_ID]],
            ['AddToWishlist', [CUSTOMER_ID, producto], 'AddToWishlist', [CUSTOMER_ID, producto]],
            ['RemoveFromWishlist', [CUSTOMER_ID, 'p1'], 'RemoveFromWishlist', [CUSTOMER_ID, 'p1']],
            ['AddToCart', [CUSTOMER_ID, producto, 3], 'AddToCart', [CUSTOMER_ID, producto, 3]],
            ['RemoveFromCart', [CUSTOMER_ID, 'p1'], 'RemoveFromCart', [CUSTOMER_ID, 'p1']],
            ['ClearCart', [CUSTOMER_ID], 'ClearCart', [CUSTOMER_ID]],
            ['GetCart', [CUSTOMER_ID], 'GetCart', [CUSTOMER_ID]],
            ['PlaceOrder', [CUSTOMER_ID, { _id: 'o1' }], 'PlaceOrder', [CUSTOMER_ID, { _id: 'o1' }]],
        ])('%s llama al repositorio y devuelve { data }', async (metodo, args, repoMetodo, repoArgs) => {
            const resultado = { ok: true };
            mockRepository[repoMetodo].mockResolvedValue(resultado);

            await expect(service[metodo](...args)).resolves.toEqual({ data: resultado });
            expect(mockRepository[repoMetodo]).toHaveBeenCalledWith(...repoArgs);
        });

        it('AddNewAddress reenvia solo los campos de la direccion', async () => {
            const direccion = { street: 'Calle 10', postalCode: '050001', city: 'Medellin', country: 'CO' };
            mockRepository.AddNewAddress.mockResolvedValue({ _id: 'a1', ...direccion });

            const { data } = await service.AddNewAddress(CUSTOMER_ID, { ...direccion, ignorado: true });

            expect(mockRepository.AddNewAddress).toHaveBeenCalledWith(CUSTOMER_ID, direccion);
            expect(data._id).toBe('a1');
        });
    });

    describe('traduccion de errores', () => {
        it.each([
            ['AddNewAddress', [CUSTOMER_ID, {}], 'AddNewAddress'],
            ['GetProfile', [{ _id: CUSTOMER_ID }], 'GetProfile'],
            ['GetCustomerSummary', [CUSTOMER_ID], 'GetProfile'],
            ['GetWishList', [CUSTOMER_ID], 'GetWishList'],
            ['AddToWishlist', [CUSTOMER_ID, {}], 'AddToWishlist'],
            ['RemoveFromWishlist', [CUSTOMER_ID, 'p1'], 'RemoveFromWishlist'],
            ['AddToCart', [CUSTOMER_ID, {}, 1], 'AddToCart'],
            ['RemoveFromCart', [CUSTOMER_ID, 'p1'], 'RemoveFromCart'],
            ['ClearCart', [CUSTOMER_ID], 'ClearCart'],
            ['GetCart', [CUSTOMER_ID], 'GetCart'],
        ])('%s convierte un error inesperado en APIError 404', async (metodo, args, repoMetodo) => {
            mockRepository[repoMetodo].mockRejectedValue(new Error('fallo de lectura'));

            const promise = service[metodo](...args);

            await expect(promise).rejects.toBeInstanceOf(APIError);
            await expect(promise).rejects.toMatchObject({ name: 'Data Not Found', statusCode: 404 });
        });

        it('PlaceOrder convierte un error inesperado en APIError 500', async () => {
            mockRepository.PlaceOrder.mockRejectedValue(new Error('fallo de escritura'));

            await expect(service.PlaceOrder(CUSTOMER_ID, {})).rejects.toMatchObject({
                name: 'PlaceOrderError',
                statusCode: 500,
            });
        });

        it.each([
            ['AddNewAddress', [CUSTOMER_ID, {}], 'AddNewAddress'],
            ['GetProfile', [{ _id: CUSTOMER_ID }], 'GetProfile'],
            ['GetCustomerSummary', [CUSTOMER_ID], 'GetProfile'],
            ['GetWishList', [CUSTOMER_ID], 'GetWishList'],
            ['AddToWishlist', [CUSTOMER_ID, {}], 'AddToWishlist'],
            ['RemoveFromWishlist', [CUSTOMER_ID, 'p1'], 'RemoveFromWishlist'],
            ['AddToCart', [CUSTOMER_ID, {}, 1], 'AddToCart'],
            ['RemoveFromCart', [CUSTOMER_ID, 'p1'], 'RemoveFromCart'],
            ['ClearCart', [CUSTOMER_ID], 'ClearCart'],
            ['GetCart', [CUSTOMER_ID], 'GetCart'],
            ['PlaceOrder', [CUSTOMER_ID, {}], 'PlaceOrder'],
        ])('%s respeta el APIError original que venga del repositorio', async (metodo, args, repoMetodo) => {
            const original = new BadRequestError('Customer not found');
            mockRepository[repoMetodo].mockRejectedValue(original);

            await expect(service[metodo](...args)).rejects.toBe(original);
        });
    });
});
