const jwt = require('jsonwebtoken');
const { APP_SECRET } = require('../../config');
const { UnauthorizedError } = require('../../utils/app-errors');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new UnauthorizedError('Missing authorization token'));
    }

    const token = authHeader.split(' ')[1];

    try {
        req.user = jwt.verify(token, APP_SECRET);
        return next();
    } catch (err) {
        return next(new UnauthorizedError('Invalid or expired token'));
    }
};
