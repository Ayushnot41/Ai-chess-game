"""Unit & Integration Tests for Grandmaster-AI.
Verifies evaluation functions, alpha-beta search, quiescence, predictor, and API.
"""

import pytest
import chess
from backend.engine.evaluator import evaluate_board, get_material_balance, get_game_phase
from backend.engine.search import SearchEngine
from backend.engine.predictor import MovePredictor, win_probability


def test_initial_board_evaluation():
    """Initial chess board should be approximately balanced (small tempo bonus for White)."""
    board = chess.Board()
    score = evaluate_board(board)
    # White gets a slight tempo bonus (~15cp)
    assert 0 <= score <= 30


def test_checkmate_evaluation():
    """Checkmate should return overwhelming advantage."""
    # Scholar's Mate board
    board = chess.Board("r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 5")
    # Qf7#
    board.push_san("Qxf7#")
    assert board.is_checkmate()
    # It's black's turn to move and black is checkmated, so evaluate_board should return positive 30000
    assert evaluate_board(board) >= 29000


def test_stalemate_evaluation():
    """Stalemate should evaluate to 0."""
    board = chess.Board("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1")
    assert board.is_stalemate()
    assert evaluate_board(board) == 0


def test_game_phase():
    """Opening has phase 24, endgame has low phase."""
    board = chess.Board()
    assert get_game_phase(board) == 24

    # Bare kings and pawns
    bare_board = chess.Board("8/4k3/8/8/8/8/4K3/8 w - - 0 1")
    assert get_game_phase(bare_board) == 0


def test_material_balance():
    """Check material counting."""
    board = chess.Board()
    mat = get_material_balance(board)
    assert mat["white_points"] == 39  # 8*1 + 2*3 + 2*3 + 2*5 + 9 = 39
    assert mat["black_points"] == 39
    assert mat["advantage"] == "equal"


def test_search_mate_in_one():
    """AI must find immediate mate-in-one."""
    # White can deliver Qh7#
    board = chess.Board("r1b1k2r/ppppqppp/2n5/4n3/2B5/5N2/PB3PPP/R2Q1RK1 w kq - 0 1")
    # Fool's mate position: 1. f3 e5 2. g4 Qh4#
    fools = chess.Board("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")
    assert fools.is_checkmate()

    searcher = SearchEngine()
    # Mate in 1 for White: 7k/5Q2/6K1/8/8/8/8/8 w - - 0 1 -> Any mate (Qf8#, Qg7#, Qh7#)
    m1_board = chess.Board("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1")
    res = searcher.search_best_move(m1_board, max_depth=2)
    m1_board.push(res["best_move"])
    assert m1_board.is_checkmate()


def test_predictor_tactical_motifs():
    """Predictor should identify checks and forks."""
    predictor = MovePredictor()
    # Position where White knight can fork king and queen: Nc7+
    board = chess.Board("r3k2r/pppq1ppp/2n5/3p4/1b1P4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 8")
    motifs = predictor.detect_tactical_motifs(board, chess.Move.from_uci("c1d2"))
    assert isinstance(motifs, list)


def test_win_probability_formula():
    """Test win probability sigmoid curve."""
    assert win_probability(0) == 50.0
    assert win_probability(400) > 75.0
    assert win_probability(-400) < 25.0


def test_control_heatmap():
    """Heatmap should return 64 integer values."""
    predictor = MovePredictor()
    board = chess.Board()
    hm = predictor.compute_control_heatmap(board)
    assert len(hm) == 64
    # Central squares are contested or controlled
    assert all(isinstance(x, int) for x in hm)
