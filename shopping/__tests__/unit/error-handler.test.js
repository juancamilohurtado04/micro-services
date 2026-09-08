// Pruebas unitarias del manejador central de errores de Express.
const HandleErrors = require('../../src/utils/error-handler');
const {
    APIError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
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
        [new BadRequestError('falta el campo email'), 400, 'falta el campo email'],
        [new NotFoundError('Order not found'), 404, 'Order not found'],
        [new UnauthorizedError('Invalid or expired token'), 401, 'Invalid or expired token'],
        [new APIError('CreateOrderError', 500, 'fallo interno'), 500, 'fallo interno'],
    ])('responde con el statusCode del APIError', (error, statusCode, message) => {
        HandleErrors(error, {}, res, next);

        expect(res.status).toHaveBeenCalledWith(statusCode);
        expect(res.json).toHaveBeenCalledWith({ message });
        expect(next).not.toHaveBeenCalled();
    });

    it('oculta el detalle de los errores no controlados detras de un 500 generico', () => {
        HandleErrors(new Error('TypeError: cannot read property of undefined'), {}, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
        expect(console.error).toHaveBeenCalled();
    });
});
