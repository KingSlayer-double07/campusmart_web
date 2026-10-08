import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/things' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return {
    status: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('prisma failed', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [new BadRequestException('bad'), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new ConflictException(), 409, 'CONFLICT'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
  ])('maps %p to %i %s', (exception, status, code) => {
    const res = run(exception);
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({
      statusCode: status,
      code,
      path: '/api/things',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('passes a feature code, message and details through', () => {
    const res = run(
      new ConflictException({
        code: 'OUT_OF_STOCK',
        message: 'Only 2 left',
        details: { available: 2 },
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'OUT_OF_STOCK',
      message: 'Only 2 left',
      details: { available: 2 },
    });
  });

  it('keeps validation messages as a list', () => {
    const res = run(new BadRequestException(['email must be an email']));
    expect(res.body.message).toEqual(['email must be an email']);
  });

  it('maps Prisma P2002 to 409 CONFLICT', () => {
    const res = run(prismaError('P2002', { target: ['email'] }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'CONFLICT',
      details: { fields: ['email'] },
    });
  });

  it('maps Prisma P2003 to 400 INVALID_REFERENCE', () => {
    const res = run(prismaError('P2003', { field_name: 'institutionId' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REFERENCE');
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    const res = run(prismaError('P2025'));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('turns unknown errors into a 500 INTERNAL without leaking the message', () => {
    const res = run(new Error('secret connection string in here'));
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: 'INTERNAL',
      message: 'Internal server error',
    });
  });

  it('logs 5xx with logger.error and the exception itself, so the stack is printed', () => {
    const boom = new Error('boom');
    run(boom);
    expect(errorSpy).toHaveBeenCalledWith(boom);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs 4xx at warn without the body', () => {
    run(
      new HttpException(
        { code: 'X', message: 'secret body' },
        HttpStatus.BAD_REQUEST,
      ),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).not.toContain('secret body');
  });
});
