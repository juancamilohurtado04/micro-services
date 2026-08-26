const { APIError, STATUS_CODES } = require('./app-errors');

module.exports = (err, req, res, next) => {
    if (err instanceof APIError) {
        return res.status(err.statusCode).json({ message: err.message });
    }

    console.error(err);
    return res.status(STATUS_CODES.INTERNAL_ERROR).json({ message: 'Internal server error' });
};
