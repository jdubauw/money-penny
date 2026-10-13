// Run only against an isolated deployment: creates synthetic account imports.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const config = process.env.TEST_ENV_FILE
    ? Object.fromEntries(fs.readFileSync(process.env.TEST_ENV_FILE, 'utf8').split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    : process.env;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let expected503 = true;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error' || message.text().includes('401')) return;
    if (expected503 && message.text().includes('503')) { expected503 = false; return; }
    errors.push(message.text());
  });
  await page.goto(process.env.TEST_APP_URL || 'http://localhost:18000');
  await page.locator('#username').fill(config.APP_USERNAME || 'admin');
  await page.locator('#password').fill(config.APP_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#shell').waitFor({ state: 'visible' });
  await page.getByRole('link', { name: 'Imports', exact: true }).click();
  const account = 'Batch test ' + Date.now();
  await page.locator('#account-name').fill(account);
  let rejectedOnce = false, attempts = [];
  await page.route('**/api/imports', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postData() || '';
    const filename = /filename="([^"]+)"/.exec(body)?.[1];
    attempts.push(filename);
    if (filename === 'retry.csv' && !rejectedOnce) {
      rejectedOnce = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporary upload failure. Retry this file.' }) });
    }
    if (filename === 'first.csv') await new Promise(resolve => setTimeout(resolve, 250));
    return route.continue();
  });
  const first = Buffer.from('Date,Description,Amount,Type\n01/01/2026,Coffee,20,purchase\n01/02/2026,Card payment,-100,payment\n01/03/2026,Coffee refund,-2,refund\n');
  await page.locator('#statement-file').setInputFiles([
    { name: 'first.csv', mimeType: 'text/csv', buffer: first },
    { name: 'retry.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n02/01/2026,Clinic,15\n') },
    { name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n01/01/2026,Coffee,20\n01/04/2026,H-E-B,30\n') },
    { name: 'first-again.csv', mimeType: 'text/csv', buffer: first },
    { name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a statement') },
  ]);
  assert.equal(await page.locator('#statement-file').getAttribute('multiple'), '');
  await page.getByRole('button', { name: 'Upload & preview', exact: true }).click();
  assert.equal(await page.locator('#account-name').isDisabled(), true, 'Account is fixed while uploading.');
  await page.getByRole('button', { name: 'Retry failed uploads', exact: true }).waitFor();
  assert.equal(await page.locator('[data-upload-status="uploaded"]').count(), 2);
  assert.equal(await page.locator('[data-upload-status="duplicate"]').count(), 1);
  assert.equal(await page.locator('[data-upload-status="failed"]').count(), 2);
  assert.deepEqual(attempts, ['first.csv', 'retry.csv', 'second.csv', 'first-again.csv'], 'One bad file must not stop subsequent uploads.');
  await page.getByRole('button', { name: 'Retry failed uploads', exact: true }).click();
  await page.locator('#notice').getByText('1 uploaded · 0 already uploaded · 1 failed.', { exact: false }).waitFor();
  assert.deepEqual(attempts, ['first.csv', 'retry.csv', 'second.csv', 'first-again.csv', 'retry.csv'], 'Retry must not re-upload successful files.');
  const importCard = name => page.locator('#import-list > div').filter({ has: page.locator('strong', { hasText: name }) }).first();
  await importCard('first.csv').getByRole('button', { name: 'Review import' }).waitFor({ timeout: 20000 });
  await importCard('first.csv').getByRole('button', { name: 'Review import' }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#preview-content [role="checkbox"][data-preview-row]').count(), 3);
  await page.getByRole('button', { name: 'Import selected rows' }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'hidden' });
  await importCard('second.csv').getByRole('button', { name: 'Review import' }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#preview-content [data-preview-row][data-state="checked"]').count(), 1, 'The overlap is unchecked after approving the first statement.');
  await page.getByRole('button', { name: 'Import selected rows' }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'hidden' });
  await importCard('retry.csv').getByRole('button', { name: 'Review import' }).click();
  await page.getByRole('button', { name: 'Import selected rows' }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'hidden' });
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Yearly', exact: true }).click();
  await page.locator('#f-account').selectOption(account);
  await page.locator('#overview-content .metric').getByText('$63.00', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Imports', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Batch browser passed: multiple files, continued uploads after failure, repeat-file detection, failed-only retry, per-statement approval, refreshed overlap checks, exact report totals, and mobile layout.');
})().catch(error => { console.error(error); process.exit(1); });
