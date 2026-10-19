import { randomUUID } from 'crypto';
import {
  client,
  createTestApp,
  createUser,
  signIn,
  TEST_PASSWORD,
  TestContext,
  truncateAll,
  resetRateLimits,
} from './utils';

// Phase 0 checklist, automated
describe('Phase 0 security (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('PATCH /api/users/me/profile response has no password or passwordResetToken', async () => {
    const user = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, user.email);

    const res = await agent
      .patch('/api/users/me/profile')
      .send({ firstName: 'Ada' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe('Ada');
    expect(res.body.data).not.toHaveProperty('password');
    expect(res.body.data).not.toHaveProperty('passwordResetToken');
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('GET /api/auth/me and GET /api/users/me/profile never include the password hash', async () => {
    const user = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, user.email);

    for (const path of ['/api/auth/me', '/api/users/me/profile']) {
      const res = await agent.get(path).expect(200);
      expect(res.body.data.id).toBe(user.id);
      expect(res.body.data).not.toHaveProperty('password');
    }
  });

  it('GET /api/users/<id> returns no email', async () => {
    const viewer = await createUser(ctx.prisma);
    const other = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, viewer.email);

    const res = await agent.get(`/api/users/${other.id}`).expect(200);
    expect(res.body.data.id).toBe(other.id);
    expect(res.body.data).not.toHaveProperty('email');
    expect(JSON.stringify(res.body)).not.toContain(other.email);
  });

  it('GET /api/users/<non-uuid> returns 400', async () => {
    const viewer = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, viewer.email);

    const res = await agent.get('/api/users/not-a-uuid').expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/users/<unknown uuid> returns 404 NOT_FOUND', async () => {
    const viewer = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, viewer.email);

    const res = await agent.get(`/api/users/${randomUUID()}`).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('changing the password with a wrong current password returns 401', async () => {
    const user = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, user.email);

    const res = await agent
      .patch('/api/users/me/password')
      .send({ currentPassword: 'WrongPass999', newPassword: 'NewPass1234' })
      .expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');

    // The old password still works
    await signIn(ctx.app, user.email, TEST_PASSWORD);
  });

  it('changing the password to the current one returns 400', async () => {
    const user = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, user.email);

    await agent
      .patch('/api/users/me/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);
  });

  it('the 6th login attempt in a minute returns 429', async () => {
    const user = await createUser(ctx.prisma);
    const agent = client(ctx.app);

    for (let i = 0; i < 5; i++) {
      await agent
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPass999' })
        .expect(401);
    }
    const res = await agent
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('the login limit follows the email, so another student behind the same IP can still sign in', async () => {
    const throttled = await createUser(ctx.prisma);
    const classmate = await createUser(ctx.prisma);
    const campusIp = '102.89.1.10';

    for (let i = 0; i < 5; i++) {
      await client(ctx.app, campusIp)
        .post('/api/auth/login')
        .send({ email: throttled.email, password: 'WrongPass999' })
        .expect(401);
    }
    await client(ctx.app, campusIp)
      .post('/api/auth/login')
      .send({ email: throttled.email, password: TEST_PASSWORD })
      .expect(429);

    // Same IP, different student: not blocked
    await client(ctx.app, campusIp)
      .post('/api/auth/login')
      .send({ email: classmate.email, password: TEST_PASSWORD })
      .expect(200);

    // Different IP, same email: still blocked
    await client(ctx.app, '197.210.5.5')
      .post('/api/auth/login')
      .send({ email: throttled.email, password: TEST_PASSWORD })
      .expect(429);
  });

  it('rejects unknown body fields', async () => {
    const user = await createUser(ctx.prisma);
    const agent = await signIn(ctx.app, user.email);

    const res = await agent
      .patch('/api/users/me/profile')
      .send({ firstName: 'Ada', role: 'ADMIN' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('GET /api/institutions/:id returns 400 for a non-UUID and 404 when missing', async () => {
    const http = client(ctx.app);
    await http.get('/api/institutions/abc').expect(400);
    const res = await http.get(`/api/institutions/${randomUUID()}`).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('sets security headers (helmet)', async () => {
    const res = await client(ctx.app).get('/api').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
