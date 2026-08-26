const cors = require('cors');
const proxyRouter = require('./routes');
const healthRouter = require('./routes/health');
const { composeProfile } = require('./compose-profile');
const HandleErrors = require('./utils/error-handler');
const { NotFoundError } = require('./utils/app-errors');

module.exports = async (app) => {
    app.use(cors());

    app.use(healthRouter);

    app.get('/profile', composeProfile);

    app.use(proxyRouter);

    app.use((req, res, next) => {
        next(new NotFoundError(`El Gateway no tiene una ruta registrada para ${req.method} ${req.originalUrl}`));
    });

    app.use((err, req, res, next) => {
        if (err instanceof NotFoundError) {
            return res.status(err.statusCode).json({
                message: err.message,
                availablePrefixes: proxyRouter.routes.map((route) => route.prefix),
            });
        }
        return HandleErrors(err, req, res, next);
    });
};
