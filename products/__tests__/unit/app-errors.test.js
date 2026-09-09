// Pruebas unitarias de las clases de error de dominio: verifican el nombre,
// el statusCode y el mensaje por defecto de cada una.
const {
    STATUS_CODES,
    APIError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
} = require('../../src/utils/app-errors');

describe('app-errors', () => {
    it.each([
        [BadRequestError, 'BadRequestError', STATUS_CODES.BAD_REQUEST, 'Bad request'],
        [NotFoundError, 'NotFoundError', STATUS_CODES.NOT_FOUND, 'Not found'],
        [UnauthorizedError, 'UnauthorizedError', STATUS_CODES.UNAUTHORIZED, 'Unauthorized'],
    ])('usa el mensaje y el statusCode por defecto cuando no se pasan argumentos', (Clase, name, statusCode, message) => {
        const error = new Clase();

        expect(error).toBeInstanceOf(APIError);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ name, statusCode, message });
        expect(error.stack).toEqual(expect.any(String));
    });

    it.each([
        [BadRequestError, 'falta el email'],
        [NotFoundError, 'recurso inexistente'],
        [UnauthorizedError, 'token vencido'],
    ])('permite sobreescribir el mensaje por defecto', (Clase, message) => {
        expect(new Clase(message).message).toBe(message);
    });

    it('APIError cae en 500 e "Internal server error" cuando solo recibe el nombre', () => {
        const error = new APIError('CustomError');

        expect(error).toMatchObject({
            name: 'CustomError',
            statusCode: STATUS_CODES.INTERNAL_ERROR,
            message: 'Internal server error',
        });
    });
});
