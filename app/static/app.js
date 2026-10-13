'use strict';
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
const state = {view:'overview', page:1, bootstrap:null, selected:new Set(), rows:[], preview:null, previewPage:1, previewSelected:new Set(), editIds:[], plan:null, jobsSeen:new Set()};
let pollTimer;
function notice(message, error=false) { $('#notice').textContent=message; $('#notice').classList.toggle('error',error); $('#notice').hidden=false; const dialog=document.querySelector('dialog[open]'); if(dialog&&error){let alert=dialog.querySelector('.dialog-notice');if(!alert){alert=document.createElement('p');alert.className='dialog-notice error';alert.setAttribute('role','alert');dialog.querySelector('.dialog-head').after(alert);}alert.textContent=message;} }
async function api(path, options={}) {
  options.headers = {...options.headers, 'X-Requested-With':'SpendingLedger'};
  if(options.body && !(options.body instanceof FormData)) {options.headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
  const response=await fetch(path, options);
  if(!response.ok) {
    const result=await response.json().catch(()=>({detail:`Request failed (${response.status})`}));
    if(response.status===401 && path!=='/api/login') showLogin();
    throw new Error(typeof result.detail==='string'?result.detail:'Check the form values and try again.');
  }
  return response.status===204?null:response.json();
}
async function action(button, task) {
  document.querySelectorAll('.dialog-notice').forEach(el=>el.remove());
  const label=button?.textContent;
  if(button) {button.disabled=true;button.textContent='Working…';button.setAttribute('aria-busy','true');}
  try {await task();} catch(error) {notice(error.message,true);}
  finally {if(button) {button.disabled=false;button.textContent=label;button.removeAttribute('aria-busy');}}
}
function showLogin() {$('#shell').hidden=true;$('#login').hidden=false;clearInterval(pollTimer);}
function options(values, first) {return `<option value="">${esc(first)}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');}
async function bootstrap() {
  state.bootstrap=await api('/api/bootstrap');
  const b=state.bootstrap;
  for(const [id,values,label] of [['f-account',b.accounts,'All accounts'],['f-category',b.categories,'All categories'],['f-kind',b.kinds,'All types'],['edit-kind',b.kinds,'Keep existing types']]) {
    const value=$('#'+id).value; $('#'+id).innerHTML=options(values,label);$('#'+id).value=value;
  }
  $('#account-list').innerHTML=b.accounts.map(v=>`<option value="${esc(v)}">`).join('');
  $('#category-list').innerHTML=b.categories.map(v=>`<option value="${esc(v)}">`).join('');
  $('#provider-label').textContent=b.ai.provider==='none'?'Merchant rules only':`AI provider: ${b.ai.provider==='ollama'?'Ollama':'OpenAI'}`;
  for(const key of ['provider','ollama_model','openai_model']) $('#settings-form').elements[key].value=b.ai[key];
  $('#provider-details').innerHTML=`<p>Ollama server: ${esc(b.ai.ollama_url)}<br>OpenAI endpoint: ${esc(b.ai.openai_url)}<br>OpenAI key: ${b.ai.openai_key_configured?'configured on server':'not configured'}</p>`;
}
function filters() {
  const data=new FormData($('#filter-form'));const result={};
  for(const [key,value] of data.entries()) if(value!=='') result[key]=key==='review'?'true':value;
  return result;
}
function merchantChip() { const v=$('#f-vendor').value; $('#merchant-filter').hidden=!v; $('#merchant-filter').innerHTML=v?`<span>Merchant: ${esc(v)}</span><button type="button" id="clear-merchant">Clear merchant</button>`:''; }
function qs(extra={}) {return new URLSearchParams({...filters(),...extra}).toString();}
function navigate(view) {
  state.view=view;$('#notice').hidden=true;
  const titles={overview:['Overview','Spending across your imported accounts.'],transactions:['Transactions','Find, categorize, and review every transaction.'],imports:['Imports','Upload an export, check the extraction, then approve the rows.'],settings:['AI & rules','Choose a provider and teach the app your merchant preferences.']};
  $('#page-title').textContent=titles[view][0];$('#page-subtitle').textContent=titles[view][1];
  for(const name of Object.keys(titles)) $('#'+name).hidden=name!==view;
  $('#shared-filters').hidden=!['overview','transactions'].includes(view);
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view?'page':'false'));
  refresh().catch(error=>notice(error.message,true));
}
async function refresh() {
  merchantChip();
  if(state.view==='overview') await renderOverview();
  else if(state.view==='transactions') await renderLedger();
  else if(state.view==='imports') await renderImports();
  else await renderSettings();
}
function bars(items, type) {
  if(!items.length) return '<p class="muted">No spending transactions match these filters.</p>';
  const max=Math.max(...items.map(([,v])=>Math.abs(v)),1);
  return items.map(([label,value])=>`<div class="bar-row"><button class="link" data-drill="${type}" data-value="${esc(label)}">${esc(label)}</button><span>${money(value)}</span><progress value="${Math.abs(value)}" max="${max}" aria-label="${esc(label)} spending"></progress></div>`).join('');
}
async function renderOverview() {
  const r=await api('/api/reports?'+qs());
  $('#overview-content').innerHTML=r.count?`<div class="metrics"><div class="metric"><label>Net spending</label><strong>${money(r.spend_cents)}</strong><small>Purchases, fees, interest, less refunds</small></div><div class="metric"><label>Transactions</label><strong>${r.count.toLocaleString()}</strong><small>${esc(r.date_start)} through ${esc(r.date_end)}</small></div><div class="metric"><label>Needs review</label><strong>${r.review_count.toLocaleString()}</strong><button class="link" data-show-review>Review transactions →</button></div></div>
    ${r.unclassified_credit_cents?`<p class="warning">${money(Math.abs(r.unclassified_credit_cents))} in unclassified credits is excluded from net spending. Review these as refunds, payments, or another type.</p>`:''}
    <div class="analysis"><div><h2>Spending by category</h2>${bars(r.categories,'category')}</div><div><h2>Monthly spending</h2>${bars(r.months,'month')}</div><div><h2>Top merchants</h2>${bars(r.vendors,'merchant')}</div><div><h2>Report coverage</h2><p class="muted">${r.statement_ranges.length} committed statement export(s). Missing months and accounts are not estimated.</p><p>Income recorded: ${money(r.income_cents)}</p><p class="muted">Payments and transfers are excluded. General credits remain separate until you classify them. Category and merchant charts show net spending.</p></div></div>`:
    `<div class="empty"><h2>${Object.keys(filters()).length?'No matching transactions':'Start with a statement'}</h2><p class="muted">${Object.keys(filters()).length?'Adjust or reset your filters to see more transactions.':'Upload a CSV or supported PDF export to build your spending history.'}</p><button data-empty-action class="primary">${Object.keys(filters()).length?'Reset filters':'Upload statement'}</button></div>`;
}
function rowHtml(row, preview=false, index=0) {
  const checked=preview?state.previewSelected.has(index):state.selected.has(row.id);
  return `<tr><td data-label="Select"><label class="check"><input type="checkbox" ${checked?'checked':''} ${preview?`data-preview-row="${index}"`:`data-row="${row.id}"`} aria-label="Select ${esc(row.vendor)} on ${esc(row.date)}"></label></td><td data-label="Date">${esc(row.date)}</td><td data-label="Merchant">${preview?esc(row.vendor):`<button class="link" data-edit="${row.id}">${esc(row.vendor)}</button>`}<span class="desc">${esc(row.description)}</span>${preview&&row.duplicate_candidate?'<span class="badge">Possible duplicate</span>':''}</td><td data-label="Account">${esc(preview?state.preview.account:row.account)}</td><td data-label="Category">${esc(row.category)}<span class="desc">${esc(row.kind)}</span>${row.needs_review?'<span class="badge">Needs review</span>':''}</td><td data-label="Amount" class="amount">${money(row.amount_cents)}</td></tr>`;
}
function table(rowsHtml) {return `<div class="table-wrap"><table><thead><tr><th scope="col">Select</th><th scope="col">Date</th><th scope="col">Merchant / description</th><th scope="col">Account</th><th scope="col">Category / type</th><th scope="col">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;}
async function renderLedger() {
  const result=await api('/api/transactions?'+qs({page:state.page}));state.rows=result.rows;
  $('#ledger').innerHTML=result.count?`${table(result.rows.map(r=>rowHtml(r)).join(''))}<div class="pager"><button data-page="-1" ${state.page===1?'disabled':''}>Previous</button><span>Page ${result.page} of ${result.pages} · ${result.count.toLocaleString()} rows</span><button data-page="1" ${state.page>=result.pages?'disabled':''}>Next</button><button id="select-page">Select this page</button></div>`:'<div class="empty"><h3>No matching transactions</h3><p class="muted">Upload a statement or adjust your filters.</p></div>';
  $('#bulk-edit').textContent=state.selected.size?`Edit selected (${state.selected.size})`:'Edit selected';
}
async function renderImports() {
  const items=await api('/api/imports');
  $('#import-list').innerHTML=items.length?items.map(i=>`<div class="import-item"><div class="spread"><div><strong>${esc(i.filename)}</strong><div class="muted">${esc(i.account)} · ${esc(i.status)}${i.row_count?` · ${i.row_count} extracted rows`:''}</div></div><div class="flex">${i.status==='preview'?`<button class="primary" data-preview="${i.id}">Review import</button>`:''}<a href="/api/imports/${i.id}/file">Original file</a></div></div>${i.error?`<p class="error">${esc(i.error)}</p>`:''}</div>`).join(''):'<p class="muted">Your uploaded statements will appear here.</p>';
}
function previewHtml() {
  const item=state.preview,p=item.preview,rows=p.rows,start=(state.previewPage-1)*100;
  $('#preview-content').innerHTML=`<p><strong>${esc(item.filename)}</strong> · ${esc(item.account)}</p><p class="muted">${rows.length} extracted transactions. Possible duplicates are unchecked by default; keep them if they are separate purchases.</p>
    ${p.warnings?.length?`<div class="warning"><strong>Check reconciliation before importing</strong><ul>${p.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><label class="check"><input type="checkbox" id="ack-warnings">I checked these warnings against the original statement</label></div>`:''}
    ${p.reconciliation?.length?`<details><summary>Statement totals and extraction</summary><ul>${p.reconciliation.map(r=>`<li>${esc(r.label)}: statement ${r.expected_cents===null?'unknown':money(r.expected_cents)} · extracted ${money(r.actual_cents)} · difference ${r.difference_cents===null?'unknown':money(r.difference_cents)}</li>`).join('')}</ul>${p.unparsed_lines?.length?`<ul>${p.unparsed_lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}</details>`:''}
    <div class="flex"><a href="/api/imports/${item.id}/file">Download original</a><button id="preview-select-all">Select all rows</button><button id="preview-clear">Clear selection</button></div>
    ${table(rows.slice(start,start+100).map((r,i)=>rowHtml(r,true,start+i)).join(''))}<div class="pager"><button data-preview-page="-1" ${state.previewPage===1?'disabled':''}>Previous</button><span>Page ${state.previewPage} of ${Math.ceil(rows.length/100)}</span><button data-preview-page="1" ${start+100>=rows.length?'disabled':''}>Next</button></div><div class="spread rule"><span id="preview-count">${state.previewSelected.size} selected</span><button class="primary" id="commit-import">Import selected rows</button></div>`;
}
async function openPreview(id) {
  const item=await api('/api/imports/'+id);
  if(item.status!=='preview') throw new Error('This import is not ready for review yet.');
  state.preview=item;state.previewPage=1;state.previewSelected=new Set(item.preview.rows.map((r,i)=>r.duplicate_candidate?null:i).filter(i=>i!==null));previewHtml();$('#preview-dialog').showModal();
}
async function renderSettings() {
  const [rules,jobs]=await Promise.all([api('/api/rules'),api('/api/jobs')]);
  $('#rules-list').innerHTML=rules.length?rules.map(r=>`<div class="spread import-item"><span>${esc(r.vendor)} → ${esc(r.category)}${r.subcategory?` / ${esc(r.subcategory)}`:''}</span><button data-delete-rule="${r.id}">Remove rule</button></div>`).join(''):'<p class="muted">No saved merchant rules yet.</p>';
  $('#jobs-list').innerHTML=jobs.length?jobs.map(j=>`<div class="import-item">${esc(j.kind)} #${j.id} · ${esc(j.status)}${j.error?`<p class="error">${esc(j.error)}</p>`:''}${j.result.categorized!==undefined?`<p>${j.result.categorized} transactions categorized; review the suggestions in the ledger.</p>`:''}</div>`).join(''):'<p class="muted">No processing jobs yet.</p>';
}
async function openEdit(ids) {
  state.editIds=ids;const rows=state.rows.filter(r=>ids.includes(r.id));
  $('#edit-form').reset();$('#edit-category').value=rows[0]?.category||'Other';$('#edit-subcategory').value=rows[0]?.subcategory||'';
  $('#edit-rule').disabled=rows.length!==ids.length||new Set(rows.map(r=>r.vendor)).size!==1;
  if(ids.length===1&&rows[0]) {
    const r=rows[0];$('#edit-kind').value=r.kind;
    const history=await api(`/api/transactions/${r.id}/history`);
    $('#edit-details').innerHTML=`<p><strong>${esc(r.vendor)}</strong><br>${esc(r.description)}<br>${esc(r.date)} · ${money(r.amount_cents)} · ${esc(r.account)}</p><p class="muted">Category source: ${esc(r.category_source)}${r.explanation?` · ${esc(r.explanation)}`:''}</p><p><a href="/api/imports/${r.import_id}/file">Download original statement</a></p>${history.length?`<details><summary>Correction history (${history.length})</summary>${history.map(h=>`<p>${esc(h.at)} · ${esc(h.before.category)} → ${esc(h.after.category)} · ${esc(h.before.kind)} → ${esc(h.after.kind)}</p>`).join('')}</details>`:''}`;
  } else $('#edit-details').innerHTML=`<p>Update ${ids.length} selected transactions. Leave transaction type unchanged unless the same type applies to every selected row.</p>`;
  $('#edit-dialog').showModal();
}
function resetFilters() {$('#filter-form').reset();$('#f-vendor').value='';merchantChip();state.page=1;state.selected.clear();}
function readCsvPrefs() {
  for(const key of ['date','description','amount','debit','credit','type'])$('#map-'+key).value='';$('#date-format').value='%m/%d/%Y';$('#amount-sign').value='positive';
  try {const raw=localStorage.getItem('csv:'+$('#account-name').value.trim());if(!raw)return;const p=JSON.parse(raw);$('#date-format').value=p.date_format;$('#amount-sign').value=p.negative_expenses?'negative':'positive';for(const key of ['date','description','amount','debit','credit','type']) $('#map-'+key).value=p.mapping[key]||'';} catch { /* Browser storage can be unavailable. */ }
}
async function start() {
  await bootstrap();$('#login').hidden=true;$('#shell').hidden=false;await refresh();
  clearInterval(pollTimer);
  pollTimer=setInterval(async()=>{
    if(document.hidden||$('#shell').hidden) return;
    try {
      const jobs=await api('/api/jobs');
      for(const job of jobs) {
        if(['completed','failed'].includes(job.status)&&!state.jobsSeen.has(job.id)) {
          state.jobsSeen.add(job.id);
          if(job.kind==='categorize') {notice(job.status==='failed'?job.error:`AI categorized ${job.result.categorized} transactions. Review its suggestions in the ledger.`,job.status==='failed');if(['overview','transactions'].includes(state.view))await refresh();}
        }
      }
      if(state.view==='imports') await renderImports();
      if(state.view==='settings') await renderSettings();
    } catch(error) {if(!$('#shell').hidden) notice(error.message,true);}
  },4000);
}
$('#mapping-fields').innerHTML=['date','description','amount','debit','credit','type'].map(key=>`<div><label for="map-${key}">${key[0].toUpperCase()+key.slice(1)} column</label><input id="map-${key}" placeholder="Auto-detect" maxlength="200"></div>`).join('');
$('#account-name').addEventListener('change',readCsvPrefs);
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('#login-error').textContent='';
  try {await api('/api/login',{method:'POST',body:Object.fromEntries(new FormData(event.target))});$('#password').value='';await start();}catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}
});
$('#logout').addEventListener('click',event=>action(event.currentTarget,async()=>{await api('/api/logout',{method:'POST'});showLogin();}));
document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
$('#upload-shortcut').addEventListener('click',()=>navigate('imports'));
$('#filter-form').addEventListener('submit',event=>{event.preventDefault();state.page=1;state.selected.clear();action(event.submitter,refresh);});
$('#reset-filters').addEventListener('click',()=>{resetFilters();refresh().catch(e=>notice(e.message,true));});
$('#ask-toggle').addEventListener('click',()=>{$('#ask-form').hidden=!$('#ask-form').hidden;if(!$('#ask-form').hidden)$('#question').focus();});
$('#ask-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{
  state.plan=await api('/api/ai/filter',{method:'POST',body:{question:$('#question').value}});
  $('#plan-content').innerHTML=`<p>${esc(state.plan.explanation)}</p><dl>${Object.entries(state.plan).filter(([k,v])=>k!=='explanation'&&v!==null).map(([k,v])=>`<dt>${esc(k.replaceAll('_',' '))}</dt><dd>${esc(v)}</dd>`).join('')||'<p>No additional filters.</p>'}</dl>`;$('#plan-dialog').showModal();
});});
$('#apply-plan').addEventListener('click',()=>{resetFilters();for(const [key,value] of Object.entries(state.plan)){const input=$('#filter-form').elements[key];if(input&&value!==null)input.value=value;}$('#plan-dialog').close();navigate('transactions');notice(state.plan.explanation);});
$('#upload-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{
  const data=new FormData(event.target);const mapping={};for(const key of ['date','description','amount','debit','credit','type']){const value=$('#map-'+key).value.trim();if(value)mapping[key]=value;}
  const prefs={date_format:$('#date-format').value,negative_expenses:$('#amount-sign').value==='negative',mapping};data.set('options',JSON.stringify(prefs));
  const item=await api('/api/imports',{method:'POST',body:data});try{localStorage.setItem('csv:'+data.get('account').trim(),JSON.stringify(prefs));}catch{}
  notice(item.already_uploaded?'This file was already uploaded for this account.':`Uploaded ${item.filename}. Extraction is queued; review it in the archive when ready.`);$('#statement-file').value='';await bootstrap();await renderImports();if(item.status==='preview')await openPreview(item.id);
});});
$('#settings-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{await api('/api/settings/ai',{method:'PUT',body:Object.fromEntries(new FormData(event.target))});await bootstrap();notice('AI settings saved.');});});
$('#test-ai').addEventListener('click',event=>action(event.currentTarget,async()=>{await api('/api/ai/test',{method:'POST'});notice('Saved AI provider responded successfully.');}));
$('#categorize').addEventListener('click',event=>action(event.currentTarget,async()=>{const job=await api('/api/ai/categorize',{method:'POST'});notice(job.job_id?`Categorization job #${job.job_id} ${job.already_running?'is already running':'queued'}. You can keep using the app.`:'No unknown spending transactions need categorization.');}));
$('#export').addEventListener('click',()=>{window.location.href='/api/export?'+qs();});
$('#bulk-edit').addEventListener('click',event=>action(event.currentTarget,async()=>{if(!state.selected.size)throw new Error('Select one or more ledger rows first.');await openEdit([...state.selected]);}));
$('#edit-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{
  await api('/api/transactions',{method:'PATCH',body:{ids:state.editIds,category:$('#edit-category').value,subcategory:$('#edit-subcategory').value,kind:$('#edit-kind').value||null,save_rule:$('#edit-rule').checked}});$('#edit-dialog').close();state.selected.clear();await bootstrap();await refresh();notice('Transactions saved and marked reviewed.');
});});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.row) {const id=Number(target.dataset.row);if(target.checked)state.selected.add(id);else state.selected.delete(id);$('#bulk-edit').textContent=`Edit selected (${state.selected.size})`;}
  if(target.dataset.previewRow!==undefined) {const i=Number(target.dataset.previewRow);if(target.checked)state.previewSelected.add(i);else state.previewSelected.delete(i);$('#preview-count').textContent=`${state.previewSelected.size} selected`;}
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.close)$('#'+button.dataset.close).close();
  if(button.dataset.preview)action(button,()=>openPreview(Number(button.dataset.preview)));
  if(button.dataset.edit)action(button,()=>openEdit([Number(button.dataset.edit)]));
  if(button.dataset.page){state.page+=Number(button.dataset.page);state.selected.clear();action(button,renderLedger);}
  if(button.dataset.previewPage){state.previewPage+=Number(button.dataset.previewPage);previewHtml();}
  if(button.id==='select-page'){state.rows.forEach(r=>state.selected.add(r.id));renderLedger().catch(e=>notice(e.message,true));}
  if(button.id==='preview-select-all'){state.previewSelected=new Set(state.preview.preview.rows.map((_,i)=>i));previewHtml();}
  if(button.id==='preview-clear'){state.previewSelected.clear();previewHtml();}
  if(button.id==='commit-import')action(button,async()=>{const result=await api(`/api/imports/${state.preview.id}/commit`,{method:'POST',body:{selected_indices:[...state.previewSelected],acknowledge_warnings:!!$('#ack-warnings')?.checked}});$('#preview-dialog').close();await bootstrap();await renderImports();notice(`${result.imported} transactions imported. You can now explore them in Overview or Transactions.`);});
  if(button.dataset.deleteRule)action(button,async()=>{await api('/api/rules/'+button.dataset.deleteRule,{method:'DELETE'});await renderSettings();notice('Merchant rule removed. Existing transactions are unchanged.');});
  if(button.hasAttribute('data-show-review')){$('#f-review').checked=true;state.page=1;navigate('transactions');}
  if(button.hasAttribute('data-empty-action')){if(Object.keys(filters()).length){resetFilters();refresh().catch(e=>notice(e.message,true));}else navigate('imports');}
  if(button.id==='clear-merchant'){$('#f-vendor').value='';refresh().catch(e=>notice(e.message,true));}
  if(button.dataset.drill){const value=button.dataset.value;state.page=1;state.selected.clear();if(button.dataset.drill==='category')$('#f-category').value=value;else if(button.dataset.drill==='merchant')$('#f-vendor').value=value;else{const [year,month]=value.split('-').map(Number);const from=value+'-01',through=`${value}-${new Date(year,month,0).getDate()}`;$('#f-start').value=[$('#f-start').value,from].filter(Boolean).sort().at(-1);$('#f-end').value=[$('#f-end').value,through].filter(Boolean).sort()[0];}navigate('transactions');}
});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
start().catch(()=>showLogin());
