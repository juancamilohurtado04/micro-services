// Pruebas unitarias del manejador de errores del gateway.
const HandleErrors = require('../../src/utils/error-handler');
const {
    STATUS_CODES,
    APIError,
    NotFoundError,
    UnauthorizedError,
    BadGatewayError,
} = require('../../src/utils/app-errors');

const buildRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('HandleErrors', () => {
    let res;
    let next;

    beforeEach(() => {
        res = buildRes();
        next = jest.fn();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each([
        [new BadGatewayError('El microservicio "products" no esta disponible'), 502],
        [new UnauthorizedError('Missing authorization token'), 401],
        [new NotFoundError('ruta no registrada'), 404],
        [new APIError('CustomError', 500, 'fallo interno'), 500],
    ])('responde con el statusCode del APIError', (error, statusCode) => {
        HandleErrors(error, {}, res, next);

        expect(res.status).toHaveBeenCalledWith(statusCode);
        expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('oculta el detalle de un error no controlado detras de un 500 generico', () => {
        HandleErrors(new Error('stack interno'), {}, res, next);

        expect(res.status).toHaveBeenCalledWith(STATUS_CODES.INTERNAL_ERROR);
        expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });
});

describe('app-errors', () => {
    it.each([
        [NotFoundError, 'NotFoundError', 404, 'Not found'],
        [UnauthorizedError, 'UnauthorizedError', 401, 'Unauthorized'],
        [BadGatewayError, 'BadGatewayError', 502, 'Upstream service unavailable'],
    ])('%p trae nombre, statusCode y mensaje por defecto', (Clase, name, statusCode, message) => {
        const error = new Clase();

        expect(error).toBeInstanceOf(APIError);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ name, statusCode, message });
        expect(error.stack).toEqual(expect.any(String));
    });

    it('permite sobreescribir el mensaje por defecto', () => {
        expect(new BadGatewayError('shopping caido').message).toBe('shopping caido');
    });

    it('APIError cae en 500 e "Internal server error" cuando solo recibe el nombre', () => {
        expect(new APIError('CustomError')).toMatchObject({
            name: 'CustomError',
            statusCode: STATUS_CODES.INTERNAL_ERROR,
            message: 'Internal server error',
        });
    });
});
