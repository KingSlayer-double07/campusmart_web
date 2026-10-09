// Phase 9 slice A browser walk: Chromium -> next dev (:3000, API_ORIGIN=http://localhost:4000) -> NestJS (:4000) -> local campusmart_dev (seeded).
// Run: INST='...' DOMAIN='...' STATION='...' node admin-walk.mjs <screenshot dir>  (names must be new on each run)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3000';
const INST = process.env.INST ?? 'Yaba College of Technology';
const DOMAIN = process.env.DOMAIN ?? 'yabatech.edu.ng';
const STATION = process.env.STATION ?? 'Library Pickup Point';
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OUT = process.argv[2];
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

async function signIn(page) {
  await page.goto(`${BASE}/onboarding/buyers/sign-in`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('School email').fill('admin@campusmart.test');
  await page.getByPlaceholder('Password').fill('LocalAdmin123');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/admin', { timeout: 20000 });
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── Desktop ──
const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await desktop.newPage();
await signIn(page);
await page.getByRole('heading', { name: 'Admin console' }).waitFor();
await page.waitForTimeout(800);
await shot(page, 'desktop-overview');
check('Admin lands on /admin overview after sign-in', page.url().endsWith('/admin'));

await page.getByRole('link', { name: 'Institutions' }).first().click();
await page.getByRole('heading', { name: 'Institutions' }).waitFor();
await page.getByText('University of Lagos').first().waitFor();
await shot(page, 'desktop-institutions');
check('Institutions table lists the seeded school', await page.getByRole('cell', { name: /University of Lagos/ }).count());

await page.getByRole('button', { name: 'Add institution' }).first().click();
const dialog = page.getByRole('dialog', { name: 'Add institution' });
await dialog.getByLabel('Name').fill(INST);
await dialog.getByLabel('Student email domains').fill(DOMAIN.toUpperCase());
await dialog.getByLabel('Student email domains').press('Enter');
await dialog.getByLabel('Student email domains').fill('not a domain');
await dialog.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(300);
await shot(page, 'desktop-institution-form-error');
check('A bad domain is explained inline', await dialog.getByText(/doesn't look like an email domain/).count());
await dialog.getByLabel('Student email domains').fill(`staff.${DOMAIN}`);
await page.waitForTimeout(200);
await shot(page, 'desktop-institution-form');
await dialog.getByRole('button', { name: 'Add institution' }).click();
await page.getByText('Institution added').waitFor();
await page.waitForTimeout(400);
await shot(page, 'desktop-institution-added');
check('Saving adds the row (with the typed-but-not-added domain too)', await page.getByRole('cell', { name: new RegExp(esc(`staff.${DOMAIN}`)) }).count());

const lasuRow = page.getByRole('row', { name: new RegExp(esc(INST)) });
await lasuRow.getByRole('button', { name: 'Switch off' }).click();
const confirm = page.getByRole('dialog', { name: 'Switch off institution?' });
await confirm.waitFor();
await confirm.getByRole('button', { name: 'Switch off' }).click();
await page.waitForTimeout(200);
check('Switching off without a reason is refused', await confirm.getByText(/Please give a reason/).count());
await confirm.getByLabel('Reason').fill('Not launching until next term');
await page.waitForTimeout(150);
await shot(page, 'desktop-switch-off-dialog');
await confirm.getByRole('button', { name: 'Switch off' }).click();
await page.getByText('Switched off', { exact: true }).first().waitFor();
await page.waitForTimeout(500);
check('The row shows Switched off', await lasuRow.getByText('Switched off').count());

// Collins' rule, seen by a student: a switched-off school's sign-up gets a friendly message
const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const g = await guest.newPage();
await g.goto(`${BASE}/onboarding/buyers/sign-up`);
await g.waitForLoadState('networkidle');
await g.getByPlaceholder('School email').fill(`ada@students.${DOMAIN}`);
await g.getByPlaceholder('Password', { exact: true }).fill('Campus2026');
await g.getByPlaceholder('Confirm password').fill('Campus2026');
await g.getByRole('button', { name: /create an account/i }).click();
await g.getByText(/isn't available at your school right now/).waitFor();
await g.screenshot({ path: `${OUT}/phone-signup-switched-off.png` });
check('Sign-up with a switched-off school shows the friendly message (not the waitlist)', !g.url().includes('/waitlist'));
await guest.close();

await page.getByRole('tab', { name: 'Switched off' }).click();
await page.waitForURL(/status=INACTIVE/);
await page.waitForTimeout(600);
await shot(page, 'desktop-institutions-filtered');
check('Status filter lives in the URL', page.url().includes('status=INACTIVE'));

await page.getByRole('link', { name: 'Pickup stations' }).first().click();
await page.getByRole('heading', { name: 'Pickup stations' }).waitFor();
await page.getByText('Main Gate Pickup Point').first().waitFor();
await shot(page, 'desktop-stations');
check('Stations table lists the seeded stations', await page.getByRole('cell', { name: /Main Gate Pickup Point/ }).count());

await page.getByRole('button', { name: 'Add station' }).first().click();
const sform = page.getByRole('dialog', { name: 'Add pickup station' });
await sform.getByLabel('Institution').selectOption({ label: 'University of Lagos' });
await sform.getByLabel('Station name').fill(STATION);
await sform.getByLabel('Address or directions').fill('Main library, ground floor, by the porters lodge');
await sform.getByLabel('Contact person').fill('Chidi Okafor');
await sform.getByLabel('Contact phone').fill('+234 802 555 0101');
await sform.getByRole('switch', { name: 'Open on Saturday' }).click();
await sform.getByLabel('Saturday opens at').fill('10:00');
await sform.getByLabel('Saturday closes at').fill('09:00');
await page.waitForTimeout(200);
check('A day that closes before it opens is flagged', await sform.getByText('Closes before it opens').count());
await shot(page, 'desktop-station-form');
await sform.getByLabel('Saturday closes at').fill('14:00');
await sform.getByRole('button', { name: 'Add station' }).click();
await page.getByText('Station added').waitFor();
await page.waitForTimeout(500);
await shot(page, 'desktop-station-added');
check('The new station appears with its hours', await page.getByRole('cell', { name: new RegExp(esc(STATION)) }).count());

// ── Phone ──
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const m = await phone.newPage();
await signIn(m);
await m.getByRole('heading', { name: 'Admin console' }).waitFor();
await m.waitForTimeout(800);
await shot(m, 'phone-overview');
const width = await m.evaluate(() => document.documentElement.scrollWidth);
check('No sideways scrolling on a 390px phone (overview)', width <= 390, `scrollWidth=${width}`);

await m.goto(`${BASE}/admin/institutions`);
await m.getByRole('heading', { name: 'Institutions' }).waitFor();
await m.getByRole('list', { name: 'Institutions' }).getByText('University of Lagos').waitFor();
await m.waitForTimeout(500);
await shot(m, 'phone-institutions');
const w2 = await m.evaluate(() => document.documentElement.scrollWidth);
check('Institutions render as cards with no sideways scrolling', w2 <= 390 && (await m.getByRole('list', { name: 'Institutions' }).isVisible()), `scrollWidth=${w2}`);

await m.goto(`${BASE}/admin/stations`);
await m.getByRole('heading', { name: 'Pickup stations' }).waitFor();
await m.getByRole('list', { name: 'Pickup stations' }).getByText('Main Gate Pickup Point').waitFor();
await m.waitForTimeout(500);
await shot(m, 'phone-stations');
await m.screenshot({ path: `${OUT}/phone-stations-viewport.png` });
check('The admin pill nav is visible on phones', await m.getByRole('navigation', { name: 'Admin' }).last().isVisible());
check("The shopper 'Install Campusmart' prompt stays off the admin console", (await m.getByText('Install Campusmart').count()) === 0);
const w3 = await m.evaluate(() => document.documentElement.scrollWidth);
check('Stations render as cards with no sideways scrolling', w3 <= 390, `scrollWidth=${w3}`);

await m.getByRole('button', { name: 'Add station' }).first().click();
await m.getByRole('dialog', { name: 'Add pickup station' }).waitFor();
await m.waitForTimeout(600);
await m.screenshot({ path: `${OUT}/phone-station-form.png` });
check('The station form opens as a bottom sheet on phones', true);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
