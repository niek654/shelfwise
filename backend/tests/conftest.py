import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="shelfwise-test-")
os.environ["SHELFWISE_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SHELFWISE_DATA_DIR"] = _tmp
os.environ["SHELFWISE_SECRET_KEY"] = "test-secret"


@pytest.fixture(scope="session")
def data_dir():
    return _tmp


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
