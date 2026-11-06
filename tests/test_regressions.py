"""Regression tests for real API, search and terminal-game failure modes."""

import io
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import chess
import chess.pgn
import pytest
from fastapi.testclient import TestClient

from backend.cli_game import export_game
from backend.engine.predictor import MovePredictor
from backend.engine.search import SearchEngine
from backend.server import app, search_slots

client = TestClient(app)


@pytest.mark.parametrize("endpoint", ["evaluate", "move", "predict", "heatmap", "validate"])
def test_invalid_positions_are_client_errors(endpoint):
    response = client.post(f"/api/{endpoint}", json={"fen": "8/8/8/8/8/8/8/8 w - - 0 1", "move_uci": "e2e4"})
    assert response.status_code == 400


@pytest.mark.parametrize("move", ["0000", "e2e5", "g1f3q", "a7a8n"])
def test_illegal_moves_never_raise_server_error(move):
    response = client.post("/api/validate", json={"move_uci": move})
    assert response.status_code == 200
    assert response.json()["valid"] is False


def test_en_passant_reports_captured_pawn():
    board = chess.Board()
    for move in ["e4", "a6", "e5", "d5"]:
        board.push_san(move)
    data = client.post("/api/validate", json={"fen": board.fen(), "move_uci": "e5d6"}).json()
    assert data["captured_piece"] == "P"
    assert chess.Board(data["new_fen"]).piece_at(chess.D5) is None


@pytest.mark.parametrize("move,piece", [("a7a8", chess.QUEEN), ("a7a8n", chess.KNIGHT)])
def test_promotion(move, piece):
    data = client.post("/api/validate", json={"fen": "7k/P7/8/8/8/8/8/7K w - - 0 1", "move_uci": move}).json()
    assert data["valid"]
    assert chess.Board(data["new_fen"]).piece_type_at(chess.A8) == piece


def test_terminal_mate_has_correct_score():
    board = chess.Board("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1")
    result = SearchEngine().search_best_move(board)
    assert result["best_move"] is None
    assert result["evaluation"] >= 29000


def test_quiescence_searches_quiet_check_evasions():
    board = chess.Board("4k3/8/8/8/8/8/8/K3R3 b - - 0 1")
    assert board.is_check()
    assert not list(board.generate_legal_captures())
    original = board.fen()
    engine = SearchEngine()
    engine.time_limit = 0
    engine.quiescence(board, -999999, 999999)
    assert engine.nodes > 1
    assert board.fen() == original


def test_timeout_keeps_legal_fallback_without_sentinel_score():
    board = chess.Board()
    with patch("backend.engine.search.time.monotonic", side_effect=[0] + [10] * 100):
        result = SearchEngine().search_best_move(board, time_limit=0.001)
    assert result["best_move"] in board.legal_moves
    assert abs(result["evaluation"]) < 30000
    assert result["depth"] == 0
    assert not board.move_stack


def test_predictor_timeout_keeps_comparable_finite_scores():
    board = chess.Board()
    candidates = MovePredictor().predict_candidates(board, depth=5, time_limit=0.000001)
    assert len(candidates) == 3
    assert len({candidate["depth"] for candidate in candidates}) == 1
    assert all(abs(candidate["eval_white"]) <= 30000 for candidate in candidates)
    assert not board.move_stack


def test_repetition_history_is_preserved_and_mismatch_rejected():
    moves = ["g1f3", "g8f6", "f3g1", "f6g8"] * 2
    board = chess.Board()
    for move in moves:
        board.push_uci(move)
    payload = {"fen": board.fen(), "initial_fen": chess.STARTING_FEN, "moves": moves}
    assert client.post("/api/move", json=payload).json()["game_over"] is True
    assert client.post("/api/predict", json=payload).json()["candidates"] == []
    payload["moves"] = moves[:-1]
    assert client.post("/api/evaluate", json=payload).status_code == 400


def test_search_capacity_returns_retryable_error_and_recovers():
    search_slots.acquire()
    search_slots.acquire()
    try:
        response = client.post("/api/move", json={})
        assert response.status_code == 503
        assert response.headers["retry-after"] == "2"
        assert client.get("/api/status").status_code == 200
    finally:
        search_slots.release()
        search_slots.release()
    assert client.post("/api/move", json={"depth": 1}).status_code == 200


def test_concurrent_searches_have_distinct_engine_instances():
    instances = []
    original = SearchEngine.search_best_move

    def traced(self, *args, **kwargs):
        instances.append(self)
        time.sleep(0.03)
        return original(self, *args, **kwargs)

    positions = [chess.Board(), chess.Board()]
    positions[1].push_san("e4")
    with patch.object(SearchEngine, "search_best_move", traced):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda board: client.post("/api/move", json={"fen": board.fen(), "depth": 1}), positions))
    assert len(instances) == 2 and instances[0] is not instances[1]
    for board, response in zip(positions, responses):
        assert response.status_code == 200
        assert chess.Move.from_uci(response.json()["best_move_uci"]) in board.legal_moves


def test_cli_export_after_undo_contains_only_current_game():
    board = chess.Board()
    for move in ["e4", "e5", "Nf3", "Nc6"]:
        board.push_san(move)
    board.pop()
    board.pop()
    board.push_san("Bc4")
    game = chess.pgn.read_game(io.StringIO(export_game(board)))
    assert list(game.mainline_moves()) == board.move_stack
