import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Env } from '../config/env';
import { PaystackService } from './paystack.service';

const SECRET = 'sk_test_secret';
const service = (env: Record<string, unknown>) =>
  new PaystackService({
    get: (k: string) => env[k],
  } as unknown as ConfigService<Env, true>);

describe('PaystackService.verifySignature (guide 5.2 step 2)', () => {
  const body = Buffer.from(
    '{"event":"charge.success","data":{"reference":"CM_o1_1"}}',
  );
  const good = createHmac('sha512', SECRET).update(body).digest('hex');
  const paystack = service({
    PAYSTACK_SECRET_KEY: SECRET,
    PAYMENTS_ENABLED: true,
  });

  it('accepts the HMAC-SHA512 of the exact raw body', () => {
    expect(paystack.verifySignature(body, good)).toBe(true);
  });

  it('refuses a wrong, missing or differently sized signature, or a changed body', () => {
    expect(
      paystack.verifySignature(
        body,
        good.replace(/^./, good[0] === 'a' ? 'b' : 'a'),
      ),
    ).toBe(false);
    expect(paystack.verifySignature(body, undefined)).toBe(false);
    expect(paystack.verifySignature(body, 'abc')).toBe(false);
    expect(
      paystack.verifySignature(Buffer.from(`${body.toString()} `), good),
    ).toBe(false);
    expect(paystack.verifySignature(undefined, good)).toBe(false);
  });

  it('refuses everything when no secret key is set', () => {
    expect(
      service({ PAYMENTS_ENABLED: true }).verifySignature(body, good),
    ).toBe(false);
  });
});
