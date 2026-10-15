// Synthetic reporting fixtures; run only against an isolated test deployment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const config=process.env.TEST_ENV_FILE?Object.fromEntries(fs.readFileSync(process.env.TEST_ENV_FILE,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)])):process.env;
  const base=process.env.TEST_APP_URL||'http://localhost:18000';
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1680,height:1100}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('401'))errors.push(m.text());});
  await page.goto(base);
  await page.locator('#username').fill(config.APP_USERNAME||'admin');
  await page.locator('#password').fill(config.APP_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('#shell').waitFor({state:'visible'});
  const marker=Date.now(),account='Reporting preview '+marker,other='Second card '+marker,credits='Credit preview '+marker;
  const headers={'X-Requested-With':'SpendingLedger'};
  async function seed(account,rows) {
    const csv='Date,Description,Amount,Type\n'+rows.map(([date,category,amount,kind='purchase'])=>[date,category,amount,kind].join(',')).join('\n')+'\n';
    const upload=await page.request.post(base+'/api/imports',{headers,multipart:{account,account_kind:'credit',file:{name:'report.csv',mimeType:'text/csv',buffer:Buffer.from(csv)}}});
    assert.equal(upload.status(),200);
    const id=(await upload.json()).id;
    let preview;
    for(let attempt=0;attempt<60;attempt++){preview=await(await page.request.get(base+'/api/imports/'+id)).json();if(preview.status==='preview')break;if(preview.status==='failed')throw new Error(preview.error);await new Promise(resolve=>setTimeout(resolve,250));}
    assert.equal(preview.status,'preview');
    const committed=await page.request.post(base+'/api/imports/'+id+'/commit',{headers,data:{selected_indices:preview.preview.rows.map((_,i)=>i)}});
    assert.equal(committed.status(),200);
    const ledger=await(await page.request.get(base+'/api/transactions?account='+encodeURIComponent(account))).json();
    for(const category of new Set(rows.map(r=>r[1]))) {
      const result=await page.request.patch(base+'/api/transactions',{headers,data:{ids:ledger.rows.filter(r=>r.description===category).map(r=>r.id),category}});
      assert.equal(result.status(),200);
    }
  }
  await seed(account,[
    ['2025-12-01','Shopping','3000.00'],
    ['2026-05-01','Shopping','8000.00'],['2026-06-01','Shopping','9000.00'],['2026-07-01','Shopping','7000.00'],
    ['2026-08-01','Shopping','10000.00'],['2026-09-01','Shopping','6000.00'],
    ['2026-10-01','Shopping','891.83'],['2026-10-01','Health','464.85'],
    ['2026-10-01','Food','420.95'],['2026-10-01','Gifts & Giving','187.50'],
    ['2026-10-01','Groceries','155.30'],['2026-10-01','Personal Care','92.36'],
    ['2026-10-01','Transportation','55.62'],['2026-10-01','Bills & Utilities','0.56'],
    ['2026-10-02','Card payment','-1000.00','payment'],
  ]);
  await seed(other,[['2026-10-01','Shopping','200.00']]);
  await seed(credits,[['2026-10-01','Shopping','100.00'],['2026-10-02','Travel','-20.00','refund']]);
  await page.reload();
  await page.locator('#f-account').selectOption(account);
  await page.locator('#overview-content[data-report-period="2026-10"]').waitFor();
  await page.locator('#overview-content .metric').getByText('$2,268.97',{exact:true}).waitFor();
  assert.equal(await page.locator('.dashboard-category-table tbody tr').count(),8);
  assert.equal(await page.locator('.report-donut path[data-ts-key^="categories:"]').count(),8);
  assert.equal(await page.locator('[data-series-period]').count(),12);
  assert.equal(await page.getByRole('checkbox',{name:'Compare periods'}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Compare periods'}).check();
  await page.locator('[data-comparison-change]').getByText(/Less than September/).waitFor();
  const shoppingWidth=Number(await page.locator('[data-comparison-category="Shopping"] rect[fill="var(--primary)"]').getAttribute('width'));
  const healthWidth=Number(await page.locator('[data-comparison-category="Health"] rect[fill="var(--primary)"]').getAttribute('width'));
  assert.ok(healthWidth>0 && healthWidth<shoppingWidth*0.6,'Category bars share a consistent scale');
  await page.getByRole('button',{name:'A–Z',exact:true}).click();
  assert.ok((await page.locator('.dashboard-category-table tbody tr').first().innerText()).includes('Bills & Utilities'));
  await page.getByRole('button',{name:'Most spent',exact:true}).click();
  assert.ok((await page.locator('.dashboard-category-table tbody tr').first().innerText()).includes('Shopping'));
  await page.getByRole('button',{name:'Biggest change',exact:true}).click();
  assert.ok((await page.locator('.dashboard-category-table tbody tr').first().innerText()).includes('Shopping'));
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download transactions',exact:true}).click();
  const download=await downloaded;
  const exported=fs.readFileSync(await download.path(),'utf8');
  assert.ok(exported.includes('Card payment')&&!exported.includes(other)&&!exported.includes('2026-09'));
  await page.getByText('Spending details & category distribution',{exact:true}).click();
  const donut=page.locator('.report-donut svg');
  await donut.scrollIntoViewIfNeeded();
  await donut.focus();
  await page.keyboard.press('Home');
  for (let step=0;step<8;step++) {
    const label=await page.locator('.ts-chart-tooltip').innerText();
    if(label.includes('Health:')) break;
    await page.keyboard.press('ArrowRight');
  }
  await page.locator('.ts-chart-tooltip').getByText(/Health:/).waitFor();
  await page.keyboard.press('Enter');
  await page.locator('#ledger').getByText('Page 1 of 1 · 1 rows',{exact:true}).waitFor();
  assert.equal(await page.locator('#f-account').inputValue(),account);
  assert.equal(await page.locator('#f-start').inputValue(),'2026-10-01');
  assert.equal(await page.locator('#f-end').inputValue(),'2026-10-31');
  assert.equal(await page.locator('#f-category').inputValue(),'Health');
  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await page.locator('#overview-content[data-report-period="2026-10"]').waitFor();
  await page.locator('.report-bars rect[data-ts-key^="spending:"][data-ts-key*="2026-09"]').click();
  await page.locator('#overview-content[data-report-period="2026-09"]').waitFor();
  await page.locator('#overview-content .metric').getByText('$6,000.00',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Compare periods'}).isChecked(),true);
  assert.equal(await page.locator('#compare-period').inputValue(),'2026-08');
  await page.locator('[data-comparison-change]').getByText('$4,000.00 less in September 2026 (-40.0%)',{exact:true}).waitFor();
  await page.locator('#compare-period').selectOption('2026-07');
  await page.locator('[data-comparison-change]').getByText('$1,000.00 less in September 2026 (-14.3%)',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Compare periods'}).uncheck();
  await page.getByRole('button',{name:'Quarterly',exact:true}).click();
  await page.locator('#overview-content[data-report-period="2026-Q3"]').waitFor();
  await page.locator('#overview-content .metric').getByText('$23,000.00',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Yearly',exact:true}).click();
  await page.locator('#overview-content .metric').getByText('$42,268.97',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Yearly',exact:true}).click();
  await page.locator('#overview-content[data-report-period="2026"]').waitFor();
  await page.locator('#overview-content .metric').getByText('$42,268.97',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Monthly',exact:true}).click();
  await page.locator('#report-period').selectOption('2025-12');
  await page.locator('#overview-content[data-report-period="2025-12"]').waitFor();
  await page.getByRole('button',{name:'Yearly',exact:true}).click();
  await page.locator('#overview-content[data-report-period="2025"]').waitFor();
  await page.locator('#overview-content .metric').getByText('$3,000.00',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Monthly',exact:true}).click();
  await page.locator('#report-period').selectOption('2026-10');
  await page.locator('#f-account').selectOption(other);
  await page.locator('#overview-content .metric').getByText('$200.00',{exact:true}).waitFor();
  await page.locator('#f-account').selectOption(credits);
  await page.locator('#overview-content .metric').getByText('$80.00',{exact:true}).waitFor();
  await page.getByText('Spending details & category distribution',{exact:true}).click();
  await page.getByText('Percent of positive balances.',{exact:false}).waitFor();
  assert.equal(await page.locator('.report-donut path[data-ts-key*="Travel"]').count(),0);
  await page.locator('#f-account').selectOption(account);
  await page.locator('#overview-content .metric').getByText('$2,268.97',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Compare periods'}).check();
  await page.locator('[data-comparison-change]').getByText(/Less than September/).waitFor();
  if(await page.locator('.dashboard-details').getAttribute('open') !== null) await page.locator('.dashboard-details summary').click();
  await page.evaluate(()=>window.scrollTo(0,0));
  fs.mkdirSync('outputs/app-preview',{recursive:true});
  await page.screenshot({path:'outputs/app-preview/reporting-desktop.png',fullPage:true});
  await page.getByRole('checkbox',{name:'Compare periods'}).check();
  await page.locator('[data-comparison-change]').waitFor();
  for(const width of [320,375,414,768,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Report overflow at '+width);
    assert.equal(await page.locator('.dashboard-summary .metric').evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth)),true,'Comparison totals fit at '+width);
    const missing=await page.locator('button:visible').evaluateAll(buttons=>buttons.filter(b=>getComputedStyle(b).whiteSpace!=='nowrap').map(b=>b.textContent));
    assert.deepEqual(missing,[]);
  }
  await page.setViewportSize({width:375,height:1000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'outputs/app-preview/reporting-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Reporting browser passed: calendar views, year-end summary, account isolation, sorting, percentages, donut and history interactions, scoped export, signed credits, and mobile layouts.');
})().catch(e=>{console.error(e);process.exit(1);});
