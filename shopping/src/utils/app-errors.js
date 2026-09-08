const STATUS_CODES = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};

class APIError extends Error {
    constructor(name, statusCode = STATUS_CODES.INTERNAL_ERROR, description = 'Internal server error') {
        super(description);
        this.name = name;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequestError extends APIError {
    constructor(description = 'Bad request') {
        super('BadRequestError', STATUS_CODES.BAD_REQUEST, description);
    }
}

class NotFoundError extends APIError {
    constructor(description = 'Not found') {
        super('NotFoundError', STATUS_CODES.NOT_FOUND, description);
    }
}

class UnauthorizedError extends APIError {
    constructor(description = 'Unauthorized') {
        super('UnauthorizedError', STATUS_CODES.UNAUTHORIZED, description);
    }
}

// El catalogo no respondio. Es distinto de un 500: shopping esta sano, su
// dependencia no. Se responde 503 para que el gateway y el frontend puedan
// decir "vuelve a intentarlo" en vez de "algo se rompio".
class ServiceUnavailableError extends APIError {
    constructor(description = 'Upstream service unavailable') {
        super('ServiceUnavailableError', STATUS_CODES.SERVICE_UNAVAILABLE, description);
    }
}

module.exports = {
    STATUS_CODES,
    APIError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ServiceUnavailableError,
};
