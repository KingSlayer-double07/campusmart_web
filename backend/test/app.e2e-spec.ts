import request from 'supertest';
import { createTestApp, TestContext } from './utils';

describe('AppController (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it('GET /api returns the health message inside the envelope', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api').expect(200);
    expect(res.body).toEqual({
      success: true,
      data: 'Campusmart API is running',
      timestamp: expect.any(String),
    });
  });

  it('GET /api/health pings the database, without signing in and without caching', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.data).toEqual({ status: 'ok', checks: { database: 'up' } });
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('GET /api/health answers 503 UNHEALTHY when the database fails, without its message', async () => {
    jest
      .spyOn(ctx.prisma, '$queryRawUnsafe')
      .mockRejectedValue(new Error('connect ECONNREFUSED secret-db-host:5432'));
    const res = await request(ctx.app.getHttpServer())
      .get('/api/health')
      .expect(503);
    expect(res.body).toMatchObject({
      code: 'UNHEALTHY',
      details: { database: 'down' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-db-host');
  });
});
