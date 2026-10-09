import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareLink } from './share';

describe('shareLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the phone's share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    await expect(shareLink('Desk lamp', 'https://x/p/1')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Desk lamp', url: 'https://x/p/1' });
  });

  it('copies the link otherwise', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareLink('Desk lamp', 'https://x/p/1')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/p/1');
  });
});
