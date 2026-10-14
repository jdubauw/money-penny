// UI-only checks on an isolated synthetic deployment; does not submit dropped files.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.TEST_APP_URL || 'http://localhost:18000');
  await page.locator('#username').fill(process.env.APP_USERNAME || 'admin');
  await page.locator('#password').fill(process.env.APP_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('link',{name:'Imports',exact:true}).click();
  const submit=page.getByRole('button',{name:'Upload & preview',exact:true});
  assert.equal(await submit.isDisabled(),true);
  await page.locator('#account-name').fill('Chase preview');
  const credit=page.getByRole('radio',{name:'Credit card',exact:true});
  await credit.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('radio',{name:'Checking / bank',exact:true}).getAttribute('aria-checked'),'true');
  await page.keyboard.press('Home');assert.equal(await credit.getAttribute('aria-checked'),'true');
  fs.mkdirSync('outputs/app-preview',{recursive:true});
  await page.screenshot({path:'outputs/app-preview/imports-refresh-desktop.png'});
  await page.locator('.import-dropzone').evaluate(element=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File(['Date,Description,Amount\n01/01/2026,Coffee,10\n'],'drop-one.csv',{type:'text/csv'}));
    transfer.items.add(new File(['Date,Description,Amount\n01/02/2026,Coffee,12\n'],'drop-two.csv',{type:'text/csv'}));
    element.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  await page.getByText('2 files selected',{exact:true}).waitFor();
  assert.equal(await page.locator('#upload-results [data-upload-status="waiting"]').count(),2);
  assert.equal(await submit.isDisabled(),false);
  await page.locator('.import-format-options summary').click();
  assert.equal(await page.locator('#date-format').isVisible(),true);
  await page.locator('.import-format-options summary').click();
  for(const width of [320,375,414,768,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Imports overflow at '+width);
  }
  await page.setViewportSize({width:375,height:1000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'outputs/app-preview/imports-refresh-mobile.png'});
  assert.deepEqual(errors,[]);await browser.close();
  console.log('Imports UI passed: file drop, upload guard, keyboard account types, CSV accordion, and mobile layouts.');
})().catch(error=>{console.error(error);process.exit(1)});
