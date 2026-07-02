import {ErrorRequestHandler, RequestHandler} from 'express';

export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export const notFoundHandler: RequestHandler = (req, res) => {
    res.status(404).json({
        ok: false,
        error: {
            code: 'NOT_FOUND',
            message: `API not found: ${req.method} ${req.originalUrl}`
        }
    });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    const knownError = error instanceof HttpError;
    const statusCode = knownError ? error.statusCode : 500;

    console.error({
        method: req.method,
        url: req.originalUrl,
        error
    });

    res.status(statusCode).json({
        ok: false,
        error: {
            code: knownError ? error.code : 'INTERNAL_SERVER_ERROR',
            message: knownError ? error.message : 'Internal server error',
            ...(knownError && error.details !== undefined ? {details: error.details} : {})
        }
    });
};
