import { throttleTracker } from './account-throttler.guard';

const verify = (token: string) => (token === 'valid' ? 'user-1' : null);

describe('throttleTracker', () => {
  it('keys signed-in requests by the verified user id', () => {
    expect(
      throttleTracker(
        { ip: '10.0.0.1', cookies: { access_token: 'valid' } },
        verify,
      ),
    ).toBe('user:user-1');
  });

  it('keys sign-in style requests by the lowercased email, not the IP', () => {
    expect(
      throttleTracker(
        {
          ip: '10.0.0.1',
          body: { email: ' Ada@UNILAG.edu.ng ', password: 'x' },
        },
        verify,
      ),
    ).toBe('email:ada@unilag.edu.ng');
  });

  it('two students behind one campus IP get separate limits', () => {
    const a = throttleTracker(
      { ip: '102.89.1.10', body: { email: 'a@unilag.edu.ng' } },
      verify,
    );
    const b = throttleTracker(
      { ip: '102.89.1.10', body: { email: 'b@unilag.edu.ng' } },
      verify,
    );
    expect(a).not.toBe(b);
  });

  it('the same email shares one limit across IPs', () => {
    const a = throttleTracker(
      { ip: '1.1.1.1', body: { email: 'a@unilag.edu.ng' } },
      verify,
    );
    const b = throttleTracker(
      { ip: '2.2.2.2', body: { email: 'a@unilag.edu.ng' } },
      verify,
    );
    expect(a).toBe(b);
  });

  it('ignores an expired or forged token and falls back to the email, then the IP', () => {
    expect(
      throttleTracker(
        {
          ip: '10.0.0.1',
          cookies: { access_token: 'forged' },
          body: { email: 'a@unilag.edu.ng' },
        },
        verify,
      ),
    ).toBe('email:a@unilag.edu.ng');
    expect(
      throttleTracker(
        { ip: '10.0.0.1', cookies: { access_token: 'forged' } },
        verify,
      ),
    ).toBe('ip:10.0.0.1');
  });

  it('falls back to the IP when there is no token and no email', () => {
    expect(throttleTracker({ ip: '10.0.0.1', body: {} }, verify)).toBe(
      'ip:10.0.0.1',
    );
    expect(
      throttleTracker({ ip: '10.0.0.1', body: { email: 42 } }, verify),
    ).toBe('ip:10.0.0.1');
  });
});
