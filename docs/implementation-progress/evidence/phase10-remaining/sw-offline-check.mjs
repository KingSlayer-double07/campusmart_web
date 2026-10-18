// Stage "install": open the app so the worker installs. Stage "offline": with the server stopped,
// open a page never visited and see what the worker serves. Both use the same browser profile.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [stage, profile, shot] = process.argv.slice(2);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  viewport: { width: 390, height: 844 },
});
const page = context.pages()[0] ?? (await context.newPage());
if (stage === 'install') {
  await page.goto('http://localhost:3000/~offline', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(3000);
  console.log(JSON.stringify(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)));
} else {
  const resp = await page.goto('http://localhost:3000/stores/never-visited-store-id').catch((e) => ({ error: String(e) }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot });
  console.log(JSON.stringify({
    status: resp.error ? resp.error : resp.status(),
    fromServiceWorker: resp.error ? null : resp.fromServiceWorker(),
    heading: await page.locator('h1').first().textContent().catch(() => null),
    url: page.url(),
  }));
}
await context.close();
