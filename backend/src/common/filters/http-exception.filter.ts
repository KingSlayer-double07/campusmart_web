import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

// Default machine-readable codes per HTTP status. Feature errors override these by
// throwing e.g. new ConflictException({ code: 'OUT_OF_STOCK', message, details }).
const STATUS_CODES: Partial<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

interface ErrorInfo {
    status: number;
    code: string;
    message: string | string[];
    details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const { status, code, message, details } = this.resolve(exception);

        if (status >= 500) {
            this.logger.error(exception);
        } else {
            this.logger.warn(`${request.method} ${request.url} -> ${status} ${code}`);
        }

        response.status(status).json({
            statusCode: status,
            code,
            message,
            ...(details !== undefined && { details }),
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }

    private resolve(exception: unknown): ErrorInfo {
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            const obj = typeof body === 'object' && body !== null ? (body as Record<string, any>) : {};
            return {
                status,
                code: typeof obj.code === 'string' ? obj.code : defaultCode(status),
                message: obj.message ?? exception.message,
                details: obj.details,
            };
        }

        if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            switch (exception.code) {
                case 'P2002':
                    return {
                        status: HttpStatus.CONFLICT,
                        code: 'CONFLICT',
                        message: 'A record with these values already exists',
                        details: exception.meta?.target ? { fields: exception.meta.target } : undefined,
                    };
                case 'P2003':
                    return {
                        status: HttpStatus.BAD_REQUEST,
                        code: 'INVALID_REFERENCE',
                        message: 'A referenced record does not exist',
                        details: exception.meta?.field_name ? { field: exception.meta.field_name } : undefined,
                    };
                case 'P2025':
                    return {
                        status: HttpStatus.NOT_FOUND,
                        code: 'NOT_FOUND',
                        message: 'Record not found',
                    };
            }
        }

        return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            code: 'INTERNAL',
            message: 'Internal server error',
        };
    }
}

function defaultCode(status: number): string {
    if (status >= 500) return 'INTERNAL';
    // Fall back to the status name (e.g. PAYLOAD_TOO_LARGE) for statuses without a mapped code
    return STATUS_CODES[status] ?? HttpStatus[status] ?? 'ERROR';
}
