"""FastAPI Backend Server for Grandmaster-AI.

Serves RESTful endpoints for the 3D Chess Game:
- /api/evaluate: Heuristic board evaluation & game phase
- /api/move: Minimax + Alpha-Beta AI move generation
- /api/predict: Multi-candidate move prediction with tactical rationale
- /api/heatmap: 64-square White vs Black control differential
- /api/validate: Validates player moves & returns updated board state
- Static file serving for the high-performance 3D WebGL frontend
"""

import os
import sys
from pathlib import Path
from threading import BoundedSemaphore
import chess
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Ensure backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.engine.evaluator import evaluate_board, get_material_balance, get_game_phase
from backend.engine.search import SearchEngine
from backend.engine.predictor import MovePredictor, win_probability

app = FastAPI(
    title="Grandmaster-AI Engine API",
    description="Next-Generation 3D Chess Game and Move Predictor Service",
    version="2.0.0",
)

# CORS setup for web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

search_slots = BoundedSemaphore(2)


def search_capacity():
    """Keep CPU work bounded and return a retryable response when busy."""
    if not search_slots.acquire(blocking=False):
        raise HTTPException(503, "The engine is busy. Please try again shortly.", headers={"Retry-After": "2"})
    try:
        yield
    finally:
        search_slots.release()


# Request & Response Schemas
class FenRequest(BaseModel):
    fen: str = Field(default=chess.STARTING_FEN, max_length=120)
    initial_fen: str | None = Field(default=None, max_length=120)
    moves: list[str] = Field(default_factory=list, max_length=1000)


class MoveRequest(FenRequest):
    depth: int = Field(default=4, ge=1, le=6)
    time_limit: float = Field(default=3.0, ge=0.2, le=10.0)


class PredictRequest(FenRequest):
    top_k: int = Field(default=3, ge=1, le=5)
    depth: int = Field(default=3, ge=1, le=5)
    time_limit: float = Field(default=2.0, ge=0.2, le=5.0)


class ValidateMoveRequest(FenRequest):
    move_uci: str = Field(min_length=4, max_length=5)


def parse_board(req: FenRequest) -> chess.Board:
    try:
        expected = chess.Board(req.fen)
        if not expected.is_valid():
            raise ValueError("The position is not a valid chess board.")
        if req.initial_fen is None:
            if req.moves:
                raise ValueError("Move history requires an initial_fen.")
            return expected
        board = chess.Board(req.initial_fen)
        if not board.is_valid():
            raise ValueError("Invalid starting position.")
        for move in req.moves:
            if len(move) not in (4, 5) or game_finished(board):
                raise ValueError("Invalid move history.")
            parsed = chess.Move.from_uci(move)
            if parsed not in board.legal_moves:
                raise ValueError("Illegal move in history.")
            board.push(parsed)
        if board.fen() != expected.fen():
            raise ValueError("Move history does not match the position.")
        return board
    except ValueError as error:
        raise HTTPException(400, f"Invalid position: {error}") from error


def game_finished(board):
    return board.is_game_over() or board.is_fifty_moves() or board.is_repetition(3)


def game_result(board):
    return board.result() if board.is_game_over() else "1/2-1/2" if game_finished(board) else None


@app.get("/api/status")
def get_status():
    """Engine health check and metadata."""
    return {
        "status": "online",
        "engine": "Grandmaster-AI v2.0",
        "algorithms": [
            "Minimax with Alpha-Beta Pruning",
            "Quiescence Search (Delta Pruning)",
            "PeSTO Tapered Piece-Square Heuristics",
            "Transposition Tables (Polyglot Zobrist Hash)",
            "MVV-LVA Move Ordering & Killer Move Heuristic",
            "Tactical Motif Recognition & Win Probability Sigmoid",
        ],
    }


@app.post("/api/evaluate")
def evaluate_position(req: FenRequest):
    """Calculates static evaluation, material balance, and win probability."""
    board = parse_board(req)

    eval_cp = 0 if game_finished(board) and not board.is_checkmate() else evaluate_board(board)
    material = get_material_balance(board)
    phase = get_game_phase(board)
    win_pct = win_probability(eval_cp)

    return {
        "fen": board.fen(),
        "turn": "white" if board.turn == chess.WHITE else "black",
        "evaluation_cp": eval_cp,
        "evaluation_pawns": round(eval_cp / 100.0, 2),
        "win_probability": {
            "white": win_pct,
            "black": round(100.0 - win_pct, 1),
        },
        "phase": phase,
        "phase_description": "Opening/Middlegame" if phase > 14 else ("Late Middlegame" if phase > 6 else "Endgame"),
        "material": material,
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "is_game_over": game_finished(board),
    }


@app.post("/api/move", dependencies=[Depends(search_capacity)])
def calculate_ai_move(req: MoveRequest):
    """Calculates optimal AI move using Alpha-Beta pruning search."""
    board = parse_board(req)
    search_engine = SearchEngine()
    predictor = MovePredictor(search_engine)

    if game_finished(board):
        return {
            "game_over": True,
            "result": game_result(board),
            "best_move_uci": None,
            "best_move_san": None,
        }

    search_result = search_engine.search_best_move(
        board, max_depth=req.depth, time_limit=req.time_limit
    )

    best_move = search_result["best_move"]
    if not best_move:
        raise HTTPException(status_code=400, detail="No legal moves available.")

    san = board.san(best_move)
    motifs = predictor.detect_tactical_motifs(board, best_move)
    explanation = predictor.generate_natural_reasoning(board, best_move, search_result["evaluation"])

    # Push move to obtain new board state
    from_sq = chess.square_name(best_move.from_square)
    to_sq = chess.square_name(best_move.to_square)
    board.push(best_move)

    return {
        "best_move_uci": best_move.uci(),
        "best_move_san": san,
        "from_square": from_sq,
        "to_square": to_sq,
        "promotion": chess.piece_symbol(best_move.promotion).upper() if best_move.promotion else None,
        "evaluation_cp": search_result["evaluation"],
        "evaluation_pawns": round(search_result["evaluation"] / 100.0, 2),
        "depth": search_result["depth"],
        "nodes": search_result["nodes"],
        "time_ms": search_result["time_ms"],
        "nps": search_result["nps"],
        "pv": search_result["pv"],
        "motifs": motifs,
        "explanation": explanation,
        "new_fen": board.fen(),
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "is_game_over": game_finished(board),
        "result": game_result(board),
    }


@app.post("/api/predict", dependencies=[Depends(search_capacity)])
def predict_moves(req: PredictRequest):
    """Generates ranked candidate moves with win probabilities and tactical explanations."""
    board = parse_board(req)
    predictor = MovePredictor()

    candidates = predictor.predict_candidates(board, top_k=req.top_k, depth=req.depth, time_limit=req.time_limit)
    current_eval = evaluate_board(board)

    return {
        "fen": board.fen(),
        "turn": "white" if board.turn == chess.WHITE else "black",
        "current_eval_cp": current_eval,
        "win_probability": {
            "white": win_probability(current_eval),
            "black": round(100.0 - win_probability(current_eval), 1),
        },
        "candidates": candidates,
    }


@app.post("/api/heatmap")
def get_control_heatmap(req: FenRequest):
    """Calculates 64-square White vs Black square dominance matrix."""
    board = parse_board(req)
    predictor = MovePredictor()

    heatmap = predictor.compute_control_heatmap(board)
    return {
        "fen": board.fen(),
        "heatmap": heatmap,  # List of 64 integers (-N to +N)
    }


@app.post("/api/validate")
def validate_move(req: ValidateMoveRequest):
    """Validates user move against current board state and returns next state."""
    board = parse_board(req)
    if game_finished(board):
        return {"valid": False, "error": "This game has ended. Start a new game."}

    try:
        move = chess.Move.from_uci(req.move_uci)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UCI move format.")

    # Handle automatic pawn promotion to Queen if omitted in UCI
    if (move not in board.legal_moves and len(req.move_uci) == 4
            and board.piece_type_at(move.from_square) == chess.PAWN
            and chess.square_rank(move.to_square) in (0, 7)):
        pawn_promo_queen = chess.Move(move.from_square, move.to_square, promotion=chess.QUEEN)
        if pawn_promo_queen in board.legal_moves:
            move = pawn_promo_queen

    if move not in board.legal_moves:
        return {"valid": False, "error": "Illegal move for current position."}

    san = board.san(move)
    is_capture = board.is_capture(move)
    captured_piece = None
    if is_capture:
        cap_type = chess.PAWN if board.is_en_passant(move) else board.piece_type_at(move.to_square)
        if cap_type:
            captured_piece = chess.piece_symbol(cap_type).upper()

    board.push(move)
    eval_cp = evaluate_board(board)

    return {
        "valid": True,
        "move_uci": move.uci(),
        "move_san": san,
        "is_capture": is_capture,
        "captured_piece": captured_piece,
        "new_fen": board.fen(),
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "is_game_over": game_finished(board),
        "result": game_result(board),
        "eval_cp": eval_cp,
    }


# Mount frontend static directory if present
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    print("Launching Grandmaster-AI 3D Platform on http://localhost:8000 ...")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
