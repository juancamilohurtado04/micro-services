const jwt = require('jsonwebtoken');
const { APP_SECRET } = require('../../src/config');

// Firma un token valido para el middleware UserAuth del servicio.
const signToken = (payload = {}) =>
    jwt.sign({ _id: 'user-de-prueba', email: 'test@example.com', ...payload }, APP_SECRET, { expiresIn: '1h' });

const bearer = (payload) => `Bearer ${signToken(payload)}`;

// Token firmado con otro secreto: sirve para probar el camino de token invalido.
const invalidBearer = () => `Bearer ${jwt.sign({ _id: 'x' }, 'otro-secreto')}`;

module.exports = { signToken, bearer, invalidBearer };
