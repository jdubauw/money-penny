// Run against an isolated test deployment. Never run against a populated production ledger.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async()=>{
  const envFile=process.env.TEST_ENV_FILE;
  const config=envFile?Object.fromEntries(fs.readFileSync(envFile,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)])):process.env;
  const base=process.env.TEST_APP_URL||'http://localhost:18000';
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('401')) errors.push(message.text());});
  await page.goto(base);
  await page.locator('#username').fill(config.APP_USERNAME||'admin');
  await page.locator('#password').fill(config.APP_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('#shell').waitFor({state:'visible'});
  const account='Browser smoke '+Date.now();
  await page.getByRole('link',{name:'Upload statement',exact:true}).first().click();
  await page.locator('#account-name').fill(account);
  await page.locator('#statement-file').setInputFiles({name:'browser-test.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Amount,Type\n01/02/2026,H-E-B,25.10,purchase\n01/03/2026,AMAZON MKTPL,80.00,purchase\n01/04/2026,PAYMENT THANK YOU,-100.00,payment\n01/05/2026,H-E-B RETURN,-5.00,refund\n02/01/2026,Annual fee,10.00,fee\n')});
  await page.getByRole('button',{name:'Upload & preview'}).click();
  const importCard=page.locator('#import-list > div').filter({hasText:account}).filter({has:page.locator('strong',{hasText:'browser-test.csv'})});
  await importCard.getByRole('button',{name:'Review import'}).waitFor({timeout:20000});
  await importCard.getByRole('button',{name:'Review import'}).click();
  await page.locator('#preview-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#preview-content [role="checkbox"][data-preview-row]').count(),5);
  await page.getByRole('button',{name:'Import selected rows'}).click();
  await page.locator('#preview-dialog').waitFor({state:'hidden'});
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Yearly',exact:true}).click();
  await page.locator('#f-account').selectOption(account);
  await page.locator('#overview-content .metric').getByText('$110.10',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Transactions',exact:true}).click();
  await page.locator('#ledger button[data-edit]').filter({hasText:'Amazon'}).first().click();
  await page.locator('#edit-dialog').waitFor({state:'visible'});
  await page.locator('#edit-category').fill('Home');
  await page.locator('#edit-subcategory').fill('');
  await page.locator('#edit-rule').check();
  await page.getByRole('button',{name:'Save & mark reviewed'}).click();
  await page.locator('#edit-dialog').waitFor({state:'hidden'});
  await page.getByRole('link',{name:'AI & rules',exact:true}).click();
  await page.locator('#rules-list').getByText('Amazon → Home',{exact:true}).waitFor();
  await page.locator('#ai-provider').selectOption('ollama');
  await page.locator('#ollama-model').fill('test-model');
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.locator('#provider-label').getByText('AI provider: Ollama').waitFor();
  // Restore no-network provider after checking settings persistence.
  await page.locator('#ai-provider').selectOption('none');
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.locator('#provider-label').getByText('Merchant rules only').waitFor();
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await page.locator('#overview-content h2').first().waitFor();
  await page.locator('#overview-content button[data-drill="merchant"]').filter({hasText:'Amazon'}).first().click();
  await page.locator('#transactions').waitFor({state:'visible'});
  assert.equal(await page.locator('#f-account').inputValue(),account);
  assert.equal(await page.locator('#f-vendor').inputValue(),'Amazon');
  await page.locator('#ledger').getByText('Page 1 of 1 · 1 rows',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear merchant',exact:true}).click();
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await page.locator('#overview-content h2').first().waitFor();
  fs.mkdirSync('outputs/app-preview',{recursive:true});
  await page.screenshot({path:'outputs/app-preview/dashboard.png',fullPage:true});
  async function navigate(view) {
    if (page.viewportSize().width < 1024) {
      await page.getByRole('button',{name:'Open menu',exact:true}).click();
      await page.getByRole('dialog',{name:'Navigation menu'}).waitFor();
      await page.locator(`.sheet-content nav [data-view="${view}"]`).click();
      await page.getByRole('dialog',{name:'Navigation menu'}).waitFor({state:'hidden'});
    } else await page.locator(`.desktop-sidebar nav [data-view="${view}"]`).click();
  }
  const widths=[320,375,414,768,1440];
  for(const width of widths) {
    await page.setViewportSize({width,height:1100});
    for(const view of ['overview','transactions','imports','settings']) {
      await navigate(view);
      await page.waitForTimeout(150);
      if (width===375 || width===1440) await page.screenshot({path:`outputs/app-preview/${view}-${width}.png`,fullPage:true});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      assert.equal(overflow,false,`${view} overflows at ${width}`);
      const wraps=await page.locator('button:visible').evaluateAll(buttons=>buttons.filter(b=>b.clientWidth>0&&getComputedStyle(b).whiteSpace!=='nowrap').map(b=>b.textContent));
      assert.deepEqual(wraps,[],`Buttons can wrap at ${width}`);
    }
    await navigate('transactions');
    await page.locator('#ledger button[data-edit]').first().click();
    await page.locator('#edit-dialog').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`Edit dialog overflows at ${width}`);
    await page.locator('#edit-dialog button[data-close]').click();
  }
  await page.setViewportSize({width:375,height:1000});
  await navigate('overview');
  await page.waitForTimeout(200);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('dialog',{name:'Navigation menu'}).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sheet-content')),true,'Drawer traps keyboard focus');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'Navigation menu'}).waitFor({state:'hidden'});
  await navigate('transactions');
  await page.getByRole('button',{name:'Filter transactions',exact:true}).click();
  assert.equal(await page.locator('#f-search').isVisible(),true);
  await page.getByRole('button',{name:'Filter transactions',exact:true}).click();
  assert.equal(await page.locator('#f-search').isVisible(),false);
  await page.getByRole('button',{name:'Select all on this page',exact:true}).click();
  assert.ok((await page.locator('#bulk-edit').textContent()).includes('('));
  await page.screenshot({path:'outputs/app-preview/ledger-mobile.png',fullPage:true});
  await navigate('overview');
  await page.screenshot({path:'outputs/app-preview/mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await page.locator('.sheet-content').boundingBox()).x)<1,'Drawer settles at viewport edge');
  await page.screenshot({path:'outputs/app-preview/mobile-menu.png'});
  await page.getByRole('button',{name:'Close menu',exact:true}).click();
  assert.deepEqual(errors,[],`Browser errors: ${errors.join(', ')}`);
  await browser.close();
  console.log('Browser smoke passed: upload, background extraction, commit, totals, correction, merchant rule, provider settings, and responsive layouts at 320/375/414/768/1440px.');
})().catch(error=>{console.error(error);process.exit(1);});
