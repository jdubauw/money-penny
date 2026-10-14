import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location('prepare_backup', Path(__file__).resolve().parents[1] / 'scripts/prepare_backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def fake_docker(monkeypatch, fail=None):
    calls=[]
    def run(*args, **kwargs):
        calls.append(args)
        if args[0]=='ps':
            name=args[4].split('=')[-1]
            return SimpleNamespace(stdout=name+'\n')
        if args[0]=='inspect':
            return SimpleNamespace(stdout=json.dumps([{'Id':args[1],'Config':{'Image':'test-image'},'Image':'sha256:test'}]))
        if 'pg_dump' in args:
            if fail=='dump': raise RuntimeError('Dump failed')
            kwargs['stdout'].write(b'PGDMP synthetic fixture')
        if 'pg_restore' in args:
            assert kwargs['stdin'].read().startswith(b'PGDMP')
        if args[0]=='cp':
            if fail=='copy': raise RuntimeError('Copy failed')
            folder=Path(args[2])/'uploads'
            folder.mkdir()
            (folder/'statement.csv').write_text('synthetic statement')
        return SimpleNamespace(stdout='')
    monkeypatch.setattr(backup,'docker',run)
    return calls


def test_backup_publishes_complete_bundle_and_restarts(monkeypatch,tmp_path):
    calls=fake_docker(monkeypatch)
    destination=tmp_path/'backup'
    config=tmp_path/'deployment'
    config.mkdir()
    (config/'.env').write_text('APP_USERNAME=test')
    backup.prepare('test-project',destination,config)
    assert (destination/'ledger.dump').read_bytes().startswith(b'PGDMP')
    assert (destination/'files/uploads/statement.csv').exists()
    assert (destination/'configuration/.env').exists()
    assert json.loads((destination/'manifest.json').read_text())['compose_project']=='test-project'
    assert [c for c in calls if c[0]=='start']==[('start','web'),('start','worker')]
    assert calls.index(('stop','--time','60','worker')) < next(i for i,c in enumerate(calls) if 'pg_dump' in c)
    backup.prepare('test-project',destination,config)
    assert not (tmp_path/'.backup.previous').exists()


@pytest.mark.parametrize('failure',['dump','copy'])
def test_failed_preparation_keeps_last_backup_and_restarts(monkeypatch,tmp_path,failure):
    destination=tmp_path/'backup'
    destination.mkdir()
    (destination/'manifest.json').write_text(json.dumps({'compose_project':'test-project'}))
    (destination/'ledger.dump').write_bytes(b'old-valid-backup')
    calls=fake_docker(monkeypatch,failure)
    with pytest.raises(RuntimeError): backup.prepare('test-project',destination)
    assert (destination/'ledger.dump').read_bytes()==b'old-valid-backup'
    assert [c for c in calls if c[0]=='start']==[('start','web'),('start','worker')]
    assert not list(tmp_path.glob('.money-penny-stage-*'))


def test_backup_refuses_unrelated_destination(monkeypatch,tmp_path):
    destination=tmp_path/'backup'
    destination.mkdir()
    (destination/'important-file').write_text('preserve')
    calls=fake_docker(monkeypatch)
    with pytest.raises(RuntimeError,match='not a backup'): backup.prepare('test-project',destination)
    assert not calls
    assert (destination/'important-file').read_text()=='preserve'
