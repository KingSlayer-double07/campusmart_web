import { randomUUID } from 'crypto';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/enums';
import { buildOpenApiDocument } from '../src/openapi';
import {
  client,
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TEST_PASSWORD,
  TestContext,
  truncateAll,
} from './utils';

const HOURS = [
  { day: 'MON', open: '09:00', close: '17:00' },
  { day: 'SAT', open: '10:00', close: '14:00' },
];

const STATION = {
  name: 'Main Gate Pickup Point',
  address: 'Main Gate, University Road',
  contactName: 'Bola Ade',
  contactPhone: '+234 801 234 5678',
  openingHours: HOURS,
};

// Phase 9 slice A: institutions and pickup stations, plus Collins' inactive-institution rule
describe('Phase 9 admin: institutions and pickup stations (e2e)', () => {
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

  const signInAdmin = async () => {
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    return { admin, agent: await signIn(ctx.app, admin.email) };
  };

  const auditRows = (entityId: string) =>
    ctx.prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
    });

  describe('access', () => {
    // Every admin route, straight from the OpenAPI route list, so new ones are covered too
    function adminRoutes() {
      const doc = buildOpenApiDocument(ctx.app);
      return Object.entries(doc.paths)
        .filter(([path]) => path.startsWith('/api/admin'))
        .flatMap(([path, item]) =>
          (['get', 'post', 'put', 'patch', 'delete'] as const)
            .filter((method) => item[method])
            .map((method) => ({
              method,
              path: path.replace(/\{[^}]+\}/g, randomUUID()),
            })),
        );
    }

    it('lists the admin routes it checks', () => {
      const routes = adminRoutes().map((r) => `${r.method} ${r.path}`);
      expect(routes.length).toBeGreaterThanOrEqual(6);
    });

    it('every /api/admin/* route returns 401 when signed out', async () => {
      for (const { method, path } of adminRoutes()) {
        const res = await request(ctx.app.getHttpServer())
          [method](path)
          .send({});
        expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 401`);
      }
    });

    it.each([UserRole.SELLER, UserRole.BUYER, UserRole.PICKUP_AGENT])(
      'every /api/admin/* route returns 403 for a %s',
      async (role) => {
        const user = await createUser(ctx.prisma, { role });
        const agent = await signIn(ctx.app, user.email);
        for (const { method, path } of adminRoutes()) {
          const res = await agent[method](path).send({});
          expect(`${method} ${path} ${res.status}`).toBe(
            `${method} ${path} 403`,
          );
          expect(res.body.code).toBe('FORBIDDEN');
        }
      },
    );
  });

  describe('institutions', () => {
    it('an admin adds an institution; it is audited with who, what and when', async () => {
      const { admin, agent } = await signInAdmin();
      const res = await agent
        .post('/api/admin/institutions')
        .send({ name: 'University of Lagos', domains: ['@UNILAG.edu.ng'] })
        .expect(201);
      expect(res.body.data).toMatchObject({
        name: 'University of Lagos',
        domains: ['unilag.edu.ng'],
        isActive: true,
        stationCount: 0,
        userCount: 0,
      });

      const [row] = await auditRows(res.body.data.id);
      expect(row).toMatchObject({
        actorId: admin.id,
        action: 'INSTITUTION_CREATED',
        entityType: 'Institution',
      });
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a domain that already belongs to another institution', async () => {
      const { agent } = await signInAdmin();
      await agent
        .post('/api/admin/institutions')
        .send({ name: 'University of Lagos', domains: ['unilag.edu.ng'] })
        .expect(201);
      const res = await agent
        .post('/api/admin/institutions')
        .send({ name: 'Another', domains: ['unilag.edu.ng'] })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'DOMAIN_IN_USE',
        details: { domain: 'unilag.edu.ng' },
      });
    });

    it('rejects unknown fields and bad domains', async () => {
      const { agent } = await signInAdmin();
      await agent
        .post('/api/admin/institutions')
        .send({
          name: 'X Uni',
          domains: ['x.edu.ng'],
          isActive: false,
          extra: 1,
        })
        .expect(400);
      const res = await agent
        .post('/api/admin/institutions')
        .send({ name: 'X Uni', domains: ['not a domain'] })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('lists with search, status filter and cursor paging', async () => {
      const { agent } = await signInAdmin();
      for (const [name, domain] of [
        ['Alpha University', 'alpha.edu.ng'],
        ['Beta University', 'beta.edu.ng'],
        ['Gamma University', 'gamma.edu.ng'],
      ]) {
        await agent
          .post('/api/admin/institutions')
          .send({ name, domains: [domain] })
          .expect(201);
      }

      const first = await agent
        .get('/api/admin/institutions?limit=2')
        .expect(200);
      expect(
        first.body.data.items.map((i: { name: string }) => i.name),
      ).toEqual(['Alpha University', 'Beta University']);
      const second = await agent
        .get(
          `/api/admin/institutions?limit=2&cursor=${first.body.data.nextCursor}`,
        )
        .expect(200);
      expect(second.body.data).toMatchObject({
        items: [{ name: 'Gamma University' }],
        nextCursor: null,
      });

      const search = await agent
        .get('/api/admin/institutions?q=beta.edu.ng')
        .expect(200);
      expect(search.body.data.items).toHaveLength(1);
      const inactive = await agent
        .get('/api/admin/institutions?status=INACTIVE')
        .expect(200);
      expect(inactive.body.data.items).toEqual([]);
    });

    it('switching one off needs a reason, and logs INSTITUTION_DEACTIVATED', async () => {
      const { admin, agent } = await signInAdmin();
      const { body } = await agent
        .post('/api/admin/institutions')
        .send({ name: 'University of Lagos', domains: ['unilag.edu.ng'] })
        .expect(201);
      const id = body.data.id as string;

      await agent
        .patch(`/api/admin/institutions/${id}`)
        .send({ isActive: false })
        .expect(400);
      const res = await agent
        .patch(`/api/admin/institutions/${id}`)
        .send({ isActive: false, reason: 'Term break' })
        .expect(200);
      expect(res.body.data.isActive).toBe(false);

      const rows = await auditRows(id);
      expect(rows.map((r) => r.action)).toEqual([
        'INSTITUTION_CREATED',
        'INSTITUTION_DEACTIVATED',
      ]);
      expect(rows[1]).toMatchObject({
        actorId: admin.id,
        meta: {
          reason: 'Term break',
          changes: { isActive: { from: true, to: false } },
        },
      });

      await agent
        .patch(`/api/admin/institutions/${randomUUID()}`)
        .send({ name: 'Nobody' })
        .expect(404);
    });
  });

  describe('an inactive institution', () => {
    async function inactiveSchool() {
      const institution = await ctx.prisma.institution.create({
        data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
      });
      const deactivate = async () => {
        const { agent } = await signInAdmin();
        await agent
          .patch(`/api/admin/institutions/${institution.id}`)
          .send({ isActive: false, reason: 'Term break' })
          .expect(200);
      };
      return { institution, deactivate };
    }

    it('blocks sign-up with its domains, with a friendly message', async () => {
      const { deactivate } = await inactiveSchool();
      await deactivate();
      const res = await client(ctx.app)
        .post('/api/auth/register')
        .send({
          email: 'ada@students.unilag.edu.ng',
          password: TEST_PASSWORD,
          accountType: 'BUYER',
        })
        .expect(403);
      expect(res.body.code).toBe('INSTITUTION_INACTIVE');
      expect(res.body.message).toMatch(/isn't available at your school/);
      await expect(
        ctx.prisma.user.count({
          where: { email: 'ada@students.unilag.edu.ng' },
        }),
      ).resolves.toBe(0);
    });

    it('is hidden from the public list and lookup', async () => {
      const { institution, deactivate } = await inactiveSchool();
      const visible = await client(ctx.app)
        .get('/api/institutions')
        .expect(200);
      expect(visible.body.data).toHaveLength(1);

      await deactivate();
      const hidden = await client(ctx.app).get('/api/institutions').expect(200);
      expect(hidden.body.data).toEqual([]);
      await client(ctx.app)
        .get(`/api/institutions/${institution.id}`)
        .expect(404);
    });

    it.each([UserRole.BUYER, UserRole.SELLER, UserRole.PICKUP_AGENT])(
      'stops a %s signing in, with the same message',
      async (role) => {
        const { institution, deactivate } = await inactiveSchool();
        const user = await createUser(ctx.prisma, {
          role,
          institutionId: institution.id,
        });
        await deactivate();
        const res = await client(ctx.app)
          .post('/api/auth/login')
          .send({ email: user.email, password: TEST_PASSWORD })
          .expect(403);
        expect(res.body.code).toBe('INSTITUTION_INACTIVE');
        expect(res.body.message).toMatch(/isn't available at your school/);
      },
    );

    it('still lets an admin of that institution sign in', async () => {
      const { institution, deactivate } = await inactiveSchool();
      const admin = await createUser(ctx.prisma, {
        role: UserRole.ADMIN,
        institutionId: institution.id,
      });
      await deactivate();
      await signIn(ctx.app, admin.email);
    });

    it('cuts off a signed-in user on their next token refresh', async () => {
      const { institution, deactivate } = await inactiveSchool();
      const buyer = await createUser(ctx.prisma, {
        institutionId: institution.id,
      });
      const agent = await signIn(ctx.app, buyer.email);
      await agent.get('/api/auth/me').expect(200);

      await deactivate();
      const res = await agent.post('/api/auth/refresh').expect(403);
      expect(res.body.code).toBe('INSTITUTION_INACTIVE');
      await expect(
        ctx.prisma.session.count({
          where: { userId: buyer.id, revokedAt: null },
        }),
      ).resolves.toBe(0);
      // The refresh cleared both cookies, so nothing is left to sign in with
      await agent.get('/api/auth/me').expect(401);
    });

    it('lets everyone back in once it is switched on again', async () => {
      const { institution, deactivate } = await inactiveSchool();
      const seller = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: institution.id,
      });
      await deactivate();
      const { agent } = await signInAdmin();
      await agent
        .patch(`/api/admin/institutions/${institution.id}`)
        .send({ isActive: true })
        .expect(200);
      await signIn(ctx.app, seller.email);
      const [, ...rest] = await auditRows(institution.id);
      expect(rest.map((r) => r.action)).toContain('INSTITUTION_REACTIVATED');
    });
  });

  describe('pickup stations', () => {
    async function setup() {
      const { admin, agent } = await signInAdmin();
      const institution = await ctx.prisma.institution.create({
        data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
      });
      return { admin, agent, institution };
    }

    it('an admin adds a station with opening hours; it is audited', async () => {
      const { admin, agent, institution } = await setup();
      const res = await agent
        .post('/api/admin/pickup-stations')
        .send({
          ...STATION,
          institutionId: institution.id,
          openingHours: [HOURS[1], HOURS[0]],
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        name: STATION.name,
        isActive: true,
        agentCount: 0,
        institution: { id: institution.id, name: 'University of Lagos' },
        openingHours: HOURS, // stored Monday first
      });
      const [row] = await auditRows(res.body.data.id);
      expect(row).toMatchObject({
        actorId: admin.id,
        action: 'STATION_CREATED',
        entityType: 'PickupStation',
      });
    });

    it('rejects bad hours, an unknown institution and a duplicate name', async () => {
      const { agent, institution } = await setup();
      const bad = await agent
        .post('/api/admin/pickup-stations')
        .send({
          ...STATION,
          institutionId: institution.id,
          openingHours: [{ day: 'MON', open: '17:00', close: '09:00' }],
        })
        .expect(400);
      expect(bad.body.message).toContain(
        'MON: closing time must be after opening time',
      );

      const unknown = await agent
        .post('/api/admin/pickup-stations')
        .send({ ...STATION, institutionId: randomUUID() })
        .expect(400);
      expect(unknown.body.code).toBe('INVALID_REFERENCE');

      await agent
        .post('/api/admin/pickup-stations')
        .send({ ...STATION, institutionId: institution.id })
        .expect(201);
      await agent
        .post('/api/admin/pickup-stations')
        .send({
          ...STATION,
          name: STATION.name.toUpperCase(),
          institutionId: institution.id,
        })
        .expect(409);
    });

    it('edits a station (not its institution) and lists by institution', async () => {
      const { agent, institution } = await setup();
      const other = await ctx.prisma.institution.create({
        data: { name: 'Lagos State University', domains: ['lasu.edu.ng'] },
      });
      const { body } = await agent
        .post('/api/admin/pickup-stations')
        .send({ ...STATION, institutionId: institution.id })
        .expect(201);
      await agent
        .post('/api/admin/pickup-stations')
        .send({ ...STATION, institutionId: other.id })
        .expect(201);
      const id = body.data.id as string;

      await agent
        .patch(`/api/admin/pickup-stations/${id}`)
        .send({ institutionId: other.id })
        .expect(400);
      const edited = await agent
        .patch(`/api/admin/pickup-stations/${id}`)
        .send({ contactPhone: '+234 809 999 9999' })
        .expect(200);
      expect(edited.body.data.contactPhone).toBe('+234 809 999 9999');

      const list = await agent
        .get(`/api/admin/pickup-stations?institutionId=${institution.id}`)
        .expect(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0].id).toBe(id);

      const rows = await auditRows(id);
      expect(rows[1]).toMatchObject({
        action: 'STATION_UPDATED',
        meta: {
          changes: {
            contactPhone: {
              from: STATION.contactPhone,
              to: '+234 809 999 9999',
            },
          },
        },
      });
    });

    it('switching a station off needs a reason and is audited', async () => {
      const { admin, agent, institution } = await setup();
      const { body } = await agent
        .post('/api/admin/pickup-stations')
        .send({ ...STATION, institutionId: institution.id })
        .expect(201);
      const id = body.data.id as string;
      await agent
        .patch(`/api/admin/pickup-stations/${id}`)
        .send({ isActive: false })
        .expect(400);
      await agent
        .patch(`/api/admin/pickup-stations/${id}`)
        .send({ isActive: false, reason: 'Building closed' })
        .expect(200);
      const rows = await auditRows(id);
      expect(rows[1]).toMatchObject({
        actorId: admin.id,
        action: 'STATION_DEACTIVATED',
        meta: { reason: 'Building closed' },
      });
    });
  });
});
