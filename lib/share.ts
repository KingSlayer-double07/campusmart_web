// Guide 3.2.4: Share uses the phone's share sheet, else copies the link
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch {
      return 'cancelled'; // the user closed the share sheet
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
