import nock from 'nock';

// Google sign-in is set up for this suite with made-up credentials; every Google call is answered by
// nock and nothing leaves the machine. The env is set before the app module loads.
process.env.GOOGLE_CLIENT_ID = 'campusmart-e2e.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'not-a-real-secret';
process.env.APP_URL = 'https://campusmart.test';

type Utils = typeof import('./utils');
type Fixtures = typeof import('./commerce-fixtures');

const TOKEN = 'https://oauth2.googleapis.com';
const USERINFO = 'https://openidconnect.googleapis.com';

// Decisions T1, G3 and C4: Google sign-in is for buyers, makes or links a buyer account, and skips
// the email code
describe('Phase 10 Google sign-in (e2e)', () => {
  let utils: Utils;
  let fx: Fixtures;
  let ctx: Awaited<ReturnType<Utils['createTestApp']>>;

  beforeAll(async () => {
    utils = await import('./utils');
    fx = await import('./commerce-fixtures');
    ctx = await utils.createTestApp();
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });

  beforeEach(async () => {
    nock.cleanAll();
    await utils.truncateAll(ctx.prisma);
    utils.resetRateLimits(ctx.app);
  });

  afterEach(() => {
    expect(nock.pendingMocks()).toEqual([]);
  });

  afterAll(async () => {
    nock.enableNetConnect();
    await ctx.app.close();
  });

  // Starts sign-in in a cookie-keeping client and returns it with the state Google would send back
  async function start(next?: string) {
    const agent = utils.client(ctx.app);
    const res = await agent
      .get(`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`)
      .expect(302);
    const url = new URL(res.headers.location);
    return { agent, url, state: url.searchParams.get('state')! };
  }

  function google(profile: object, { tokenStatus = 200 } = {}) {
    nock(TOKEN)
      .post(
        '/token',
        (body: Record<string, string>) =>
          body.grant_type === 'authorization_code' &&
          body.code === 'google-code' &&
          !!body.code_verifier &&
          body.client_secret === 'not-a-real-secret' &&
          body.redirect_uri ===
            'https://campusmart.test/api/auth/google/callback',
      )
      .reply(
        tokenStatus,
        tokenStatus === 200
          ? { access_token: 'google-access' }
          : { error: 'invalid_grant' },
      );
    if (tokenStatus === 200) {
      nock(USERINFO, { reqheaders: { authorization: 'Bearer google-access' } })
        .get('/v1/userinfo')
        .reply(200, {
          email_verified: true,
          given_name: 'Ada',
          family_name: 'Obi',
          ...profile,
        });
    }
  }

  const callback = (agent: ReturnType<Utils['client']>, state: string) =>
    agent
      .get(`/api/auth/google/callback?code=google-code&state=${state}`)
      .expect(302);

  it('says Google is set up, and sends the buyer to Google with state and PKCE', async () => {
    const providers = await utils
      .client(ctx.app)
      .get('/api/auth/providers')
      .expect(200);
    expect(providers.body.data).toEqual({ google: true });
    const { url } = await start();
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'campusmart-e2e.apps.googleusercontent.com',
      redirect_uri: 'https://campusmart.test/api/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('a new Google user becomes a confirmed buyer with no school yet, and is signed in (T1, C4)', async () => {
    const { agent, state } = await start('/orders');
    google({ sub: 'g-1', email: 'Ada@Gmail.com' });
    const res = await callback(agent, state);
    expect(res.headers.location).toBe(
      'https://campusmart.test/onboarding/google?next=%2Forders',
    );
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data).toMatchObject({
      email: 'ada@gmail.com',
      role: 'BUYER',
      firstName: 'Ada',
      institutionId: null,
      schoolEmail: null,
    });
    expect(me.body.data.emailVerifiedAt).not.toBeNull();
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'ada@gmail.com' },
    });
    expect(user).toMatchObject({ googleId: 'g-1', password: null });
  });

  it('a school Google account gets its school and confirmed school email', async () => {
    const school = await fx.createSchool(ctx.prisma);
    const { agent, state } = await start();
    google({ sub: 'g-2', email: `kemi@${school.domains[0]}` });
    await callback(agent, state);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data).toMatchObject({
      institutionId: school.id,
      schoolEmail: `kemi@${school.domains[0]}`,
    });
  });

  it('links to an existing buyer with the same email, and signs in by Google id next time', async () => {
    const school = await fx.createSchool(ctx.prisma);
    const buyer = await utils.createUser(ctx.prisma, {
      email: `tobi@${school.domains[0]}`,
      institutionId: school.id,
    });
    let { agent, state } = await start();
    google({ sub: 'g-3', email: buyer.email });
    await callback(agent, state);
    await agent.get('/api/auth/me').expect(200);
    await expect(
      ctx.prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
    ).resolves.toMatchObject({ googleId: 'g-3' });

    // A changed Google email still finds the same account by its Google id
    ({ agent, state } = await start());
    google({ sub: 'g-3', email: 'tobi.new@gmail.com' });
    await callback(agent, state);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.id).toBe(buyer.id);
    await expect(ctx.prisma.user.count()).resolves.toBe(1);
  });

  it('is for buyers only: a seller, admin or rider is sent back to sign in with a password (G3)', async () => {
    const school = await fx.createSchool(ctx.prisma);
    const seller = await fx.createSeller(ctx.prisma, school.id);
    const { agent, state } = await start();
    google({ sub: 'g-4', email: seller.email });
    const res = await callback(agent, state);
    expect(res.headers.location).toBe(
      'https://campusmart.test/onboarding/buyers/sign-in?error=GOOGLE_BUYERS_ONLY',
    );
    await agent.get('/api/auth/me').expect(401);
    await expect(
      ctx.prisma.user.findUniqueOrThrow({ where: { id: seller.id } }),
    ).resolves.toMatchObject({ googleId: null });
  });

  it('a suspended buyer is refused', async () => {
    const buyer = await utils.createUser(ctx.prisma, {
      email: 'sus@gmail.com',
    });
    await ctx.prisma.user.update({
      where: { id: buyer.id },
      data: { isSuspended: true, suspendedReason: 'Spam' },
    });
    const { agent, state } = await start();
    google({ sub: 'g-5', email: 'sus@gmail.com' });
    const res = await callback(agent, state);
    expect(res.headers.location).toContain('error=ACCOUNT_SUSPENDED');
    await agent.get('/api/auth/me').expect(401);
  });

  it('refuses a forged or replayed callback, a failed exchange and an unverified Google email', async () => {
    // Wrong state: no Google call is made
    let { agent } = await start();
    let res = await callback(agent, 'forged-state');
    expect(res.headers.location).toContain('error=GOOGLE_FAILED');

    // The state cookie is gone after one callback, so it can't be replayed
    let state: string;
    ({ agent, state } = await start());
    google({}, { tokenStatus: 400 });
    res = await callback(agent, state);
    expect(res.headers.location).toContain('error=GOOGLE_FAILED');
    res = await callback(agent, state);
    expect(res.headers.location).toContain('error=GOOGLE_FAILED');

    ({ agent, state } = await start());
    google({ sub: 'g-6', email: 'x@gmail.com', email_verified: false });
    res = await callback(agent, state);
    expect(res.headers.location).toContain('error=GOOGLE_FAILED');
    await expect(ctx.prisma.user.count()).resolves.toBe(0);
  });

  it('a Google account can’t take another account’s school email', async () => {
    const school = await fx.createSchool(ctx.prisma);
    const schoolEmail = `ada@${school.domains[0]}`;
    await ctx.prisma.user.create({
      data: {
        email: 'ada@gmail.com',
        role: 'SELLER',
        schoolEmail,
        schoolEmailVerifiedAt: new Date(),
      },
    });
    const { agent, state } = await start();
    google({ sub: 'g-7', email: schoolEmail });
    const res = await callback(agent, state);
    expect(res.headers.location).toContain('error=EMAIL_TAKEN');
  });
});
