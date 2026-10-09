import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1366, height: 900 } }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const p = await (await b.newContext(opts)).newPage();
  await p.goto('http://localhost:3000/onboarding/buyers/sign-in');
  await p.waitForLoadState('networkidle');
  await p.getByPlaceholder('School email').fill('admin@campusmart.test');
  await p.getByPlaceholder('Password').fill('LocalAdmin123');
  await p.getByRole('button', { name: /sign in|log in/i }).click();
  await p.waitForURL('**/admin');
  await p.goto('http://localhost:3000/admin/institutions?q=University%20of%20Lagos');
  const scope = name === 'desktop' ? p.getByRole('row', { name: /University of Lagos/ }) : p.getByRole('list', { name: 'Institutions' }).getByRole('listitem').filter({ hasText: 'University of Lagos' });
  await scope.getByRole('button', { name: 'Switch off' }).click();
  const dialog = p.getByRole('dialog', { name: 'Switch off institution?' });
  await dialog.getByLabel('Reason').fill('End of semester');
  await dialog.getByRole('button', { name: 'Switch off' }).click();
  await dialog.getByText(/has 1 order in progress/).waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}-switch-off-blocked.png` });
  console.log(`PASS  ${name}: switching off is refused and the dialog says "has 1 order in progress"`);
}
await b.close();
