import os
import tempfile

os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='spending-test-')
os.environ['DATABASE_URL'] = 'sqlite:///' + os.environ['DATA_DIR'] + '/test.db'
os.environ['SESSION_SECRET'] = 'test-session-secret-with-at-least-32-chars'
os.environ['APP_PASSWORD'] = 'test-password-long-enough'
os.environ['COOKIE_SECURE'] = 'false'
os.environ['APP_ORIGIN'] = 'http://testserver'

import pytest
from fastapi.testclient import TestClient
from app.database import Base, engine
from app.main import app, login_attempts


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    login_attempts.clear()
    with TestClient(app) as c:
        c.headers['X-Requested-With'] = 'SpendingLedger'
        assert c.post('/api/login', json={'username':'admin','password':os.environ['APP_PASSWORD']}).status_code == 200
        yield c
