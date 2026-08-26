const STATUS_CODES = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_ERROR: 500,
    BAD_GATEWAY: 502,
};

class APIError extends Error {
    constructor(name, statusCode = STATUS_CODES.INTERNAL_ERROR, description = 'Internal server error') {
        super(description);
        this.name = name;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
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

class BadGatewayError extends APIError {
    constructor(description = 'Upstream service unavailable') {
        super('BadGatewayError', STATUS_CODES.BAD_GATEWAY, description);
    }
}

module.exports = {
    STATUS_CODES,
    APIError,
    NotFoundError,
    UnauthorizedError,
    BadGatewayError,
};
