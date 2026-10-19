import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const db = { pingCheck: jest.fn() };
  const prisma = {};
  const health = { check: jest.fn() };
  const controller = new HealthController(
    health as never,
    db as never,
    prisma as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    health.check.mockImplementation(async (checks: (() => unknown)[]) => {
      await Promise.all(checks.map((c) => c()));
      return { status: 'ok' };
    });
  });

  it('pings the database with a timeout and answers ok', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(db.pingCheck).toHaveBeenCalledWith('database', prisma, {
      timeout: 3000,
    });
  });

  it('turns a failed check into 503 UNHEALTHY without the driver message', async () => {
    health.check.mockRejectedValue(
      new ServiceUnavailableException({
        status: 'error',
        error: { database: { status: 'down', message: 'host db.internal' } },
      }),
    );
    const error = (await controller
      .check()
      .catch((e: unknown) => e)) as ServiceUnavailableException;
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toEqual({
      code: 'UNHEALTHY',
      message: 'The database is unreachable',
      details: { database: 'down' },
    });
  });
});
