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

  it('GET /api returns the health message inside the envelope', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api').expect(200);
    expect(res.body).toEqual({
      success: true,
      data: 'Campusmart API is running',
      timestamp: expect.any(String),
    });
  });
});
