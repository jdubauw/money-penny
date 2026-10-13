// Destructive check: run only against an isolated deployment with synthetic data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const base = process.env.TEST_APP_URL;
  assert.ok(base, 'Set TEST_APP_URL to an isolated test deployment.');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  const headers = { 'X-Requested-With': 'SpendingLedger' };
  await page.goto(base);
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill(process.env.APP_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#shell').waitFor();
  const uploaded = await page.request.post(base + '/api/imports', { headers, multipart: {
    account: 'Reset test card', account_kind: 'credit',
    file: { name: 'reset-test.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n01/01/2026,Coffee,10.00\n') },
  } });
  assert.equal(uploaded.status(), 200);
  const id = (await uploaded.json()).id;
  let preview;
  for (let i = 0; i < 60; i++) {
    preview = await (await page.request.get(base + '/api/imports/' + id)).json();
    if (preview.status === 'preview') break;
    await page.waitForTimeout(250);
  }
  assert.equal(preview.status, 'preview');
  assert.equal((await page.request.post(base + '/api/imports/' + id + '/commit', { headers, data: { selected_indices: [0] } })).status(), 200);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('.sheet-content [data-view="settings"]').click();
  await page.getByRole('button', { name: 'Reset all data', exact: true }).click();
  const destroy = page.getByRole('button', { name: 'Delete all data permanently', exact: true });
  assert.equal(await destroy.isDisabled(), true);
  await page.locator('#reset-confirmation').fill('DELETE ALL DATA');
  await page.locator('#reset-password').fill('incorrect-password');
  await destroy.click();
  await page.getByRole('alert').filter({ hasText: 'Incorrect password' }).waitFor();
  assert.ok((await (await page.request.get(base + '/api/transactions')).json()).count > 0);
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator('#reset-password').fill(process.env.APP_PASSWORD);
  fs.mkdirSync('outputs/app-preview', { recursive: true });
  await page.screenshot({ path: 'outputs/app-preview/reset-mobile.png' });
  await destroy.click();
  await page.waitForURL(base + '/');
  await page.locator('#shell').waitFor();
  await page.locator('#reset-dialog').waitFor({ state: 'hidden' });
  const bootstrap = await (await page.request.get(base + '/api/bootstrap')).json();
  assert.deepEqual(bootstrap.accounts, []);
  assert.equal((await (await page.request.get(base + '/api/transactions')).json()).count, 0);
  assert.deepEqual(await (await page.request.get(base + '/api/imports')).json(), []);
  assert.equal((await page.request.get(base + '/api/imports/' + id + '/file')).status(), 404);
  await browser.close();
  console.log('Reset browser passed: typed confirmation, password rejection, mobile dialog, cleared ledger and statement files, refreshed session.');
})().catch(error => { console.error(error); process.exit(1); });
