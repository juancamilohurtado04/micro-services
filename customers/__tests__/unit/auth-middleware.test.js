// Pruebas unitarias del middleware UserAuth: se le pasan dobles de req/res/next
// para verificar el contrato sin levantar Express.
const jwt = require('jsonwebtoken');
const UserAuth = require('../../src/api/middlewares/auth');
const { APP_SECRET } = require('../../src/config');
const { UnauthorizedError } = require('../../src/utils/app-errors');

const buildReq = (headers = {}) => ({ headers });

describe('UserAuth middleware', () => {
    let res;
    let next;

    beforeEach(() => {
        res = {};
        next = jest.fn();
    });

    it('adjunta el payload del token a req.user y continua', () => {
        const token = jwt.sign({ _id: 'user-1', email: 'ana@example.com' }, APP_SECRET);
        const req = buildReq({ authorization: `Bearer ${token}` });

        UserAuth(req, res, next);

        expect(req.user).toMatchObject({ _id: 'user-1', email: 'ana@example.com' });
        expect(next).toHaveBeenCalledWith();
    });

    it.each([
        ['sin header authorization', {}],
        ['con header vacio', { authorization: '' }],
        ['con un esquema distinto de Bearer', { authorization: 'Basic dXNlcjpwYXNz' }],
    ])('rechaza la peticion %s', (_caso, headers) => {
        UserAuth(buildReq(headers), res, next);

        const [error] = next.mock.calls[0];

        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(error).toMatchObject({ statusCode: 401, message: 'Missing authorization token' });
    });

    it('rechaza un token firmado con otro secreto', () => {
        const token = jwt.sign({ _id: 'user-1' }, 'secreto-equivocado');

        UserAuth(buildReq({ authorization: `Bearer ${token}` }), res, next);

        const [error] = next.mock.calls[0];

        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(error.message).toBe('Invalid or expired token');
    });

    it('rechaza un token expirado', () => {
        const token = jwt.sign({ _id: 'user-1' }, APP_SECRET, { expiresIn: '-1s' });

        UserAuth(buildReq({ authorization: `Bearer ${token}` }), res, next);

        expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    });

    it('no deja pasar la peticion cuando el token es invalido', () => {
        UserAuth(buildReq({ authorization: 'Bearer no-es-un-jwt' }), res, next);

        const [error] = next.mock.calls[0];

        expect(error).toBeInstanceOf(UnauthorizedError);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
