"""API Endpoint Tests for Grandmaster-AI FastAPI backend."""

import pytest
from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)


def test_status_endpoint():
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert "engine" in data


def test_evaluate_endpoint():
    res = client.post("/api/evaluate", json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"})
    assert res.status_code == 200
    data = res.json()
    assert data["turn"] == "white"
    assert "evaluation_cp" in data
    assert "win_probability" in data
    assert data["win_probability"]["white"] >= 45.0


def test_predict_endpoint():
    res = client.post("/api/predict", json={
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "top_k": 3,
        "depth": 2
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["candidates"]) > 0
    first = data["candidates"][0]
    assert "move_san" in first
    assert "classification" in first
    assert "explanation" in first


def test_heatmap_endpoint():
    res = client.post("/api/heatmap", json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"})
    assert res.status_code == 200
    data = res.json()
    assert len(data["heatmap"]) == 64


def test_validate_move_legal():
    res = client.post("/api/validate", json={
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "move_uci": "e2e4"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["move_san"] == "e4"
    assert "new_fen" in data


def test_validate_move_illegal():
    res = client.post("/api/validate", json={
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "move_uci": "e2e5"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False


def test_ai_move_endpoint():
    res = client.post("/api/move", json={
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "depth": 2,
        "time_limit": 2.0
    })
    assert res.status_code == 200
    data = res.json()
    assert "best_move_uci" in data
    assert "best_move_san" in data
    assert "new_fen" in data
    assert "nodes" in data
