import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app import ai
from app.database import Import, Job, Session, Transaction
from app.importer import cents, flag_duplicates, read_csv, read_pdf
from app.worker import run_once


CSV = b'Date,Description,Amount,Type\n01/02/2026,H-E-B,25.10,purchase\n01/03/2026,AMAZON MKTPL,80.00,purchase\n01/04/2026,PAYMENT THANK YOU,-100.00,payment\n01/05/2026,H-E-B RETURN,-5.00,refund\n'


def upload(client, data=CSV, account='Test card', options=None, filename='statement.csv'):
    result = client.post('/api/imports', data={'account':account,'account_kind':'credit','options':json.dumps(options or {})},files={'file':(filename,data)})
    assert result.status_code == 200, result.text
    return result.json()['id']


def commit(client, import_id, selected=None):
    assert run_once()
    preview=client.get(f'/api/imports/{import_id}').json()
    assert preview['status']=='preview',preview
    rows=preview['preview']['rows']
    selected=selected if selected is not None else [i for i,r in enumerate(rows) if not r['duplicate_candidate']]
    return client.post(f'/api/imports/{import_id}/commit',json={'selected_indices':selected})


def test_auth_and_csrf(client):
    assert client.get('/api/bootstrap').status_code==200
    assert client.get('/').status_code==200
    assert 'type="module"' in client.get('/').text
    assert client.post('/api/ai/categorize',headers={'Origin':'https://attacker.invalid'}).status_code==403
    assert client.post('/api/ai/categorize',headers={'X-Requested-With':''}).status_code==403
    client.cookies.clear()
    assert client.get('/api/transactions').status_code==401
    assert client.get('/api/imports/1/file').status_code==401
    assert client.post('/api/imports',content=b'not even a valid multipart body').status_code==401
    assert client.get('/health').status_code==200


def test_login_limit_and_password_rotation(client,monkeypatch):
    for _ in range(10):
        assert client.post('/api/login',json={'username':'admin','password':'bad'}).status_code==401
    assert client.post('/api/login',json={'username':'admin','password':'bad'}).status_code==429
    monkeypatch.setenv('APP_PASSWORD','changed-password-long-enough')
    assert client.get('/api/bootstrap').status_code==401


def test_import_preview_commit_and_accounting(client):
    item=upload(client)
    assert client.get('/api/reports').json()['count']==0
    assert commit(client,item).json()['imported']==4
    report=client.get('/api/reports').json()
    assert report['spend_cents']==10010  # 25.10 + 80.00 - 5.00; card payment excluded
    assert report['review_count']==1
    assert report['months']==[['2026-01',10010]]
    assert client.post(f'/api/imports/{item}/commit',json={'selected_indices':[0]}).status_code==409
    assert upload(client)==item
    assert client.get('/api/reports').json()['count']==4


def test_overlap_multiset_and_explicit_selection(client):
    item=upload(client,b'Date,Description,Amount\n01/01/2026,COFFEE,4\n01/01/2026,COFFEE,4\n')
    assert commit(client,item).status_code==200
    second=upload(client,b'Date,Description,Amount\n01/01/2026,COFFEE,4\n01/01/2026,COFFEE,4\n01/01/2026,COFFEE,4\n')
    assert run_once()
    rows=client.get(f'/api/imports/{second}').json()['preview']['rows']
    assert [r['duplicate_candidate'] for r in rows]==[True,True,False]
    assert client.post(f'/api/imports/{second}/commit',json={'selected_indices':[2]}).status_code==200
    assert client.get('/api/reports').json()['spend_cents']==1200


def test_correction_rules_audit_and_ai_manual_protection(client):
    item=upload(client)
    commit(client,item)
    rows=client.get('/api/transactions').json()['rows']
    amazon=next(r for r in rows if 'AMAZON' in r['description'])
    result=client.patch('/api/transactions',json={'ids':[amazon['id']],'category':'Home','subcategory':'Supplies','save_rule':True})
    assert result.status_code==200
    assert client.get('/api/transactions/'+str(amazon['id'])+'/history').json()[0]['before']['category']=='Other'
    assert client.get('/api/rules').json()[0]['category']=='Home'
    client.put('/api/settings/ai',json={'provider':'ollama','ollama_model':'test'})
    assert client.post('/api/ai/categorize').json()['count']==0
    second=upload(client,b'Date,Description,Amount\n02/01/2026,AMAZON MKTPL,15.00\n')
    commit(client,second)
    row=client.get('/api/transactions?start=2026-02-01').json()['rows'][0]
    assert row['category']=='Home' and row['category_source']=='merchant_rule' and not row['needs_review']


def test_credit_not_automatically_refund(client):
    item=upload(client,b'Date,Description,Amount\n01/01/2026,Unknown credit,-10\n')
    commit(client,item)
    report=client.get('/api/reports').json()
    assert report['spend_cents']==0 and report['unclassified_credit_cents']==-1000
    row=client.get('/api/transactions').json()['rows'][0]
    client.patch('/api/transactions',json={'ids':[row['id']],'category':'Shopping','kind':'refund'})
    assert client.get('/api/reports').json()['spend_cents']==-1000


def test_filters_and_export_formula_protection(client):
    item=upload(client,b'Date,Description,Amount\n01/01/2026,=HYPERLINK(),10\n02/02/2026,H-E-B,20\n')
    commit(client,item)
    assert client.get('/api/transactions?start=2026-02-01&min_amount=15&category=Food').json()['count']==1
    assert client.get('/api/reports?end=2026-01-31').json()['spend_cents']==1000
    assert client.get('/api/reports?vendor=H-E-B').json()['spend_cents']==2000
    assert "'=HYPERLINK()" in client.get('/api/export').text
    assert client.get('/api/transactions?search=%25').json()['count']==0
    assert client.get('/api/reports?start=2026-02-01&end=2026-01-01').status_code==422
    assert client.get('/api/reports?min_amount=NaN').status_code==422
    assert client.get('/api/reports?min_amount=100&max_amount=10').status_code==422


def test_bad_uploads_and_commit_validation(client):
    assert client.post('/api/imports',data={'account':'A'},files={'file':('a.exe',b'abc')}).status_code==422
    assert client.post('/api/imports',data={'account':'A'},files={'file':('a.pdf',b'not a pdf')}).status_code==422
    item=upload(client,b'Date,Description,Amount\nnot-a-date,Merchant,10\n')
    assert run_once()
    assert client.get(f'/api/imports/{item}').json()['status']=='failed'
    item=upload(client)
    assert run_once()
    assert client.post(f'/api/imports/{item}/commit',json={'selected_indices':[0,0]}).status_code==422
    assert client.post(f'/api/imports/{item}/commit',json={'selected_indices':[-1]}).status_code==422


def test_warning_requires_acknowledgement(client):
    item=upload(client)
    run_once()
    with Session() as s:
        record=s.get(Import,item);record.preview={**record.preview,'warnings':['Check totals']};s.commit()
    assert client.post(f'/api/imports/{item}/commit',json={'selected_indices':[0]}).status_code==422
    assert client.post(f'/api/imports/{item}/commit',json={'selected_indices':[0],'acknowledge_warnings':True}).status_code==200


def test_csv_mapping_signs_and_bad_rows(tmp_path):
    path=tmp_path/'statement.csv'
    path.write_text('When;Payee;Value\n31/01/2026;Coffee;-4.50\n')
    result=read_csv(path,{'mapping':{'date':'When','description':'Payee','amount':'Value'},'date_format':'%d/%m/%Y','negative_expenses':True},'credit')
    assert result['rows'][0]['amount_cents']==450
    path.write_text('Date,Description,Debit,Credit\n2026-01-01,Coffee,4,\n2026-01-02,Payroll,,100\n')
    rows=read_csv(path,{},'checking')['rows']
    assert [(r['amount_cents'],r['kind']) for r in rows]==[(400,'purchase'),(-10000,'income')]
    path.write_text('Date,Description,Amount\n01/01/2026,Coffee,\n')
    with pytest.raises(ValueError,match='Missing amount'): read_csv(path,{},'credit')
    path.write_text('Date,Description,Amount\n01/01/2026,Coffee,1.001\n')
    with pytest.raises(ValueError): read_csv(path,{},'credit')
    assert cents('(1,234.56)')==-123456
    with pytest.raises(ValueError): cents('Infinity')
    with pytest.raises(ValueError): cents('4,50')


def test_real_existing_pdfs_reconcile():
    paths=list((Path(__file__).resolve().parents[1]/'input').glob('*.pdf'))
    if not paths: pytest.skip('Private statement fixtures are intentionally excluded from source control.')
    for path in paths:
        data=read_pdf(path)
        assert data['rows']
        assert not data['warnings'],(path.name,data['warnings'],data['reconciliation'])


def test_ollama_protocol_and_validation(monkeypatch):
    captured=[]
    def handler(request):
        captured.append(json.loads(request.content))
        assert request.url.path=='/api/chat'
        return httpx.Response(200,json={'message':{'content':json.dumps({'category':'Food','subcategory':'Dining','explanation':'Restaurant'})}})
    real_client=httpx.Client
    monkeypatch.setattr(ai.httpx,'Client',lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    cfg={'provider':'ollama','ollama_model':'test'}
    rows=[SimpleNamespace(id=i,description='Restaurant',vendor='Restaurant') for i in [81,209]]
    suggestions=ai.categorize_rows(cfg,rows,['Food','Other'])
    assert [s.id for s in suggestions]==[81,209]
    assert all(s.category=='Food' for s in suggestions)
    assert len(captured)==2
    assert 'id' not in captured[0]['format']['properties']
    assert captured[0]['format']['properties']['category']['enum']==['Food','Other']
    assert captured[0]['stream'] is False
    assert 'amount' not in captured[0]['messages'][1]['content']
    monkeypatch.setattr(ai,'request_json',lambda *a:{'category':'Invented','subcategory':'','explanation':'Invalid'})
    with pytest.raises(ValueError,match='unsupported category'):ai.categorize_rows(cfg,rows,['Food','Other'])


def test_batch_categorization_rejects_wrong_ids(monkeypatch):
    rows=[SimpleNamespace(id=1,description='Restaurant',vendor='Restaurant')]
    monkeypatch.setattr(ai,'request_json',lambda *a:{'suggestions':[{'id':99,'category':'Food','subcategory':'Dining','explanation':'bad id'}]})
    with pytest.raises(ValueError,match='unexpected IDs'):
        ai.categorize_rows({'provider':'openai'},rows,['Food','Other'])


def test_openai_protocol_does_not_expose_key(monkeypatch,client):
    monkeypatch.setenv('OPENAI_API_KEY','test-secret-key')
    def handler(request):
        body=json.loads(request.content)
        assert request.url.path=='/v1/responses'
        assert request.headers['authorization']=='Bearer test-secret-key'
        assert body['store'] is False and body['text']['format']['strict'] is True
        return httpx.Response(200,json={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'{"ok":true}'}]}]})
    real_client=httpx.Client
    monkeypatch.setattr(ai.httpx,'Client',lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    schema={'type':'object','properties':{'ok':{'type':'boolean'}},'required':['ok'],'additionalProperties':False}
    assert ai.request_json({'provider':'openai','openai_model':'test'},schema,'Test',{})=={'ok':True}
    bootstrap=client.get('/api/bootstrap').text
    assert 'test-secret-key' not in bootstrap and 'openai_key_configured' in bootstrap


def test_provider_failure_and_manual_race(client,monkeypatch):
    item=upload(client,b'Date,Description,Amount\n01/01/2026,Unknown Store,10\n')
    commit(client,item)
    client.put('/api/settings/ai',json={'provider':'ollama','ollama_model':'test'})
    job_id=client.post('/api/ai/categorize').json()['job_id']
    def suggest(cfg,rows,categories):
        client.patch('/api/transactions',json={'ids':[rows[0].id],'category':'Home'})
        return [ai.Suggestion(id=rows[0].id,category='Food',subcategory='Dining',explanation='Guess')]
    monkeypatch.setattr('app.worker.categorize_rows',suggest)
    run_once()
    assert client.get('/api/transactions').json()['rows'][0]['category']=='Home'
    assert client.get('/api/jobs').json()[0]['result']['categorized']==0


def test_ai_filter_is_validated(client,monkeypatch):
    client.put('/api/settings/ai',json={'provider':'ollama','ollama_model':'test'})
    plan={'start':'2026-01-01','end':None,'search':None,'category':'Food','account':None,'kind':'purchase','min_amount':50,'max_amount':None,'explanation':'Food purchases over $50.'}
    monkeypatch.setattr(ai,'request_json',lambda *a:plan)
    result=client.post('/api/ai/filter',json={'question':'Food over $50'})
    assert result.status_code==200 and result.json()['min_amount']==50
    plan['category']='invented category'
    assert client.post('/api/ai/filter',json={'question':'Food over $50'}).status_code==422


def test_failed_ai_job_keeps_transactions_and_masks_provider_error(client,monkeypatch):
    item=upload(client,b'Date,Description,Amount\n01/01/2026,Unknown Store,10\n')
    commit(client,item)
    client.put('/api/settings/ai',json={'provider':'openai','openai_model':'test'})
    client.post('/api/ai/categorize')
    def fail(*args):
        response=httpx.Response(401,request=httpx.Request('POST','https://api.example.invalid/responses'))
        raise httpx.HTTPStatusError('secret-key-in-provider-error',request=response.request,response=response)
    monkeypatch.setattr('app.worker.categorize_rows',fail)
    run_once()
    job=client.get('/api/jobs').json()[0]
    assert job['status']=='failed' and 'HTTP 401' in job['error']
    assert 'secret-key' not in job['error']
    assert client.get('/api/transactions').json()['rows'][0]['category']=='Other'


def test_interrupted_worker_jobs_are_requeued(client):
    from app.database import now
    from app.worker import recover_interrupted_jobs
    with Session() as session:
        job=Job(kind='import',payload={'import_id':999},status='running',started_at=now())
        session.add(job);session.commit()
        job_id=job.id
    recover_interrupted_jobs()
    with Session() as session:
        assert session.get(Job,job_id).status=='queued'


def test_reset_requires_confirmation_and_password(client):
    item=upload(client)
    commit(client,item)
    with Session() as session:
        original=Path(session.get(Import,item).path)
    assert client.post('/api/settings/reset',json={'confirmation':'wrong','password':'test-password-long-enough'}).status_code==422
    assert client.post('/api/settings/reset',json={'confirmation':'DELETE ALL DATA','password':'wrong'}).status_code==403
    assert original.exists()
    assert client.get('/api/transactions').json()['count']==4


def test_reset_clears_archive_and_rules_but_keeps_ai_settings(client):
    from app.database import Audit, Rule, Setting
    item=upload(client)
    commit(client,item)
    tx=client.get('/api/transactions').json()['rows'][0]
    assert client.patch('/api/transactions',json={'ids':[tx['id']],'category':'Home','save_rule':True}).status_code==200
    client.put('/api/settings/ai',json={'provider':'ollama','ollama_model':'saved-model'})
    with Session() as session:
        original=Path(session.get(Import,item).path)
        orphan=original.parent/'leftover.csv'
        orphan.write_text('Previous failed upload')
    result=client.post('/api/settings/reset',json={'confirmation':'DELETE ALL DATA','password':'test-password-long-enough'})
    assert result.status_code==200,result.text
    assert not original.exists() and not orphan.exists()
    with Session() as session:
        for model in [Transaction,Import,Job,Rule,Audit]:
            assert session.query(model).count()==0
        assert session.get(Setting,'ai').value['ollama_model']=='saved-model'
    assert client.get('/api/bootstrap').json()['accounts']==[]
    assert client.get('/api/transactions').json()['count']==0
    # The same statement can be imported again after the reset.
    fresh=upload(client)
    assert commit(client,fresh).status_code==200


@pytest.mark.parametrize('status',['queued','running'])
def test_reset_blocks_active_jobs(client,status):
    item=upload(client)
    with Session() as session:
        job=session.query(Job).first()
        job.status=status
        original=Path(session.get(Import,item).path)
        session.commit()
    assert client.post('/api/settings/reset',json={'confirmation':'DELETE ALL DATA','password':'test-password-long-enough'}).status_code==409
    assert original.exists()
    assert len(client.get('/api/imports').json())==1


def test_reset_restores_files_on_database_failure(client,monkeypatch):
    from sqlalchemy.orm import Session as OrmSession
    item=upload(client)
    commit(client,item)
    with Session() as session:
        original=Path(session.get(Import,item).path)
    def fail_commit(self):
        raise RuntimeError('Simulated database failure')
    monkeypatch.setattr(OrmSession,'commit',fail_commit)
    response=client.post('/api/settings/reset',json={'confirmation':'DELETE ALL DATA','password':'test-password-long-enough'})
    assert response.status_code==500
    assert original.exists()
    assert client.get('/api/transactions').json()['count']==4


def test_reset_retry_finishes_failed_file_cleanup(client,monkeypatch):
    import shutil
    item=upload(client)
    commit(client,item)
    with Session() as session:
        archive=Path(session.get(Import,item).path).parent.parent
    real_remove=shutil.rmtree
    def fail_remove(path):
        raise PermissionError('Simulated storage failure')
    monkeypatch.setattr(shutil,'rmtree',fail_remove)
    body={'confirmation':'DELETE ALL DATA','password':'test-password-long-enough'}
    assert client.post('/api/settings/reset',json=body).status_code==500
    assert list(archive.glob('reset-trash-*'))
    monkeypatch.setattr(shutil,'rmtree',real_remove)
    assert client.post('/api/settings/reset',json=body).status_code==200
    assert not list(archive.glob('reset-trash-*'))


@pytest.mark.parametrize('description,amount,kind,category,expected_kind',[
    ('SQ *COSMIC ICE CREAM CO. Houston TX',1389,'purchase','Food','purchase'),
    ('PHILLIPS 66 - SKIPPERS HUNTSVILLE TX',9331,'purchase','Gas','purchase'),
    ('AUTOMATIC PAYMENT - THANK YOU',-4000,'credit','Payments','payment'),
    ('GOOGLE *YOUTUBETV g.co/helppay# CA',8984,'purchase','Entertainment','purchase'),
    ('SQ *UNKNOWN STORE Houston TX',2000,'purchase','Other','purchase'),
])
def test_specific_merchant_rules(description,amount,kind,category,expected_kind):
    from datetime import date
    from app.importer import make_row
    row=make_row(date(2026,9,24),description,amount,kind)
    assert row['category']==category and row['kind']==expected_kind
    assert row['amount_cents']==amount


def test_apply_builtin_rules_updates_existing_unknowns_and_preserves_manual(client):
    from app.database import Audit
    from datetime import date
    descriptions=['SQ *COSMIC ICE CREAM CO. Houston TX','PHILLIPS 66 - SKIPPERS HUNTSVILLE TX','AUTOMATIC PAYMENT - THANK YOU','GOOGLE *YOUTUBETV g.co/helppay# CA','SQ *UNKNOWN STORE']
    with Session() as session:
        for i,desc in enumerate(descriptions):
            session.add(Transaction(import_id=1,row_index=i,account='Card',date=date(2026,9,1),description=desc,vendor=desc,amount_cents=-4000 if i==2 else 1000,kind='credit' if i==2 else 'purchase',category='Other',needs_review=True))
        session.add(Transaction(import_id=1,row_index=5,account='Card',date=date(2026,9,1),description=descriptions[0],vendor='Cosmic',amount_cents=1000,kind='purchase',category='Other',category_source='manual'))
        session.commit()
    result=client.post('/api/transactions/apply-rules')
    assert result.status_code==200 and result.json()['updated']==4
    with Session() as session:
        rows=session.query(Transaction).order_by(Transaction.row_index).all()
        assert [r.category for r in rows]==['Food','Gas','Payments','Entertainment','Other','Other']
        assert rows[2].kind=='payment' and rows[2].amount_cents==-4000
        assert not rows[2].needs_review
        assert rows[5].category_source=='manual'
        assert session.query(Audit).count()==4
    assert client.post('/api/transactions/apply-rules').json()['updated']==0


def test_worker_prioritizes_imports_and_yields_between_ai_requests(client, monkeypatch):
    from app import worker
    from sqlalchemy import select
    # Even an older categorization yields to a newly queued import.
    with Session() as session:
        job = Job(kind="categorize", payload={"config": {"provider": "ollama"}, "ids": []})
        session.add(job)
        session.commit()
        ai_id = job.id
    first = upload(client)
    assert run_once()
    assert client.get(f"/api/imports/{first}").json()["status"] == "preview"
    with Session() as session:
        assert session.get(Job, ai_id).status == "queued"
    commit_result = client.post(f"/api/imports/{first}/commit", json={"selected_indices": [0, 1]})
    assert commit_result.status_code == 200
    with Session() as session:
        rows = session.scalars(select(Transaction)).all()
        for row in rows:
            row.category = "Other"
        session.get(Job, ai_id).payload = {"config": {"provider": "ollama"}, "ids": [r.id for r in rows]}
        session.commit()
    calls = []
    second = None
    def fake_categorize(cfg, rows, categories):
        nonlocal second
        assert len(rows) == 1
        if calls:
            assert client.get(f"/api/imports/{second}").json()["status"] == "preview"
            with Session() as session:
                progress = session.get(Job, ai_id).result
                assert progress["processed"] == 1
                assert progress["total"] == 2
        else:
            second = upload(client, account="Second import during AI")
        calls.append(rows[0].id)
        return [SimpleNamespace(id=rows[0].id, category="Shopping", subcategory="", explanation="Test")]
    monkeypatch.setattr(worker, "categorize_rows", fake_categorize)
    assert run_once()
    assert len(calls) == 2
    with Session() as session:
        completed = session.get(Job, ai_id)
        assert completed.status == "completed"
        assert completed.result["processed"] == completed.result["total"] == 2
        assert completed.result["categorized"] == 2
