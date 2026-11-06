"""Move Predictor & Tactical Analysis Module for Grandmaster-AI.

Provides:
- Top-K move candidate evaluation with centipawn differential
- Win probability sigmoid projection
- Move quality classification (Brilliant, Best, Good, Inaccuracy, Mistake, Blunder)
- Automated tactical motif recognition (Forks, Pins, Skewers, Discovered Attacks, Outposts)
- Natural language tactical reasoning generator
- 64-square board control / influence heatmap matrix
"""

import math
import chess
from .evaluator import evaluate_board, CENTER_SQUARES
from .search import SearchEngine

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}


def win_probability(eval_cp: int) -> float:
    """Converts centipawn evaluation score to winning probability percentage (0 to 100%)."""
    # Clamped logistic sigmoid: P = 1 / (1 + 10^(-eval / 400))
    clamped_eval = max(-3000, min(3000, eval_cp))
    p = 1.0 / (1.0 + math.pow(10, -clamped_eval / 400.0))
    return round(p * 100.0, 1)


class MovePredictor:
    """Evaluates candidate moves and produces natural language tactical insights."""

    def __init__(self, search_engine: SearchEngine = None):
        self.search = search_engine or SearchEngine()

    def detect_tactical_motifs(self, board: chess.Board, move: chess.Move) -> list[str]:
        """Detects tactical patterns introduced or exploited by the move."""
        motifs = []
        piece_type = board.piece_type_at(move.from_square)
        piece_name = PIECE_NAMES.get(piece_type, "piece").capitalize()
        target_piece = board.piece_type_at(move.to_square)
        color = board.turn
        opponent = not color

        # 1. Direct Check / Double Check
        board.push(move)
        is_check = board.is_check()
        is_checkmate = board.is_checkmate()
        num_checkers = len(board.checkers()) if is_check else 0
        board.pop()

        if is_checkmate:
            motifs.append(f"Delivers checkmate! Game winning tactical blow.")
            return motifs

        if is_check:
            if num_checkers > 1:
                motifs.append(f"Double check! King is forced to evade.")
            else:
                motifs.append(f"Delivers check on the enemy king.")

        # 2. Material Captures & Favorable Trades
        if target_piece:
            target_name = PIECE_NAMES.get(target_piece, "piece")
            if target_piece > piece_type:
                motifs.append(f"Favorable capture: {piece_name} wins higher-value {target_name}.")
            else:
                motifs.append(f"Tactical capture removing enemy {target_name} on {chess.square_name(move.to_square)}.")

        # 3. Fork Detection
        board.push(move)
        attacked_sqs = board.attacks(move.to_square)
        valuable_targets = []
        for sq in attacked_sqs:
            enemy_p = board.piece_type_at(sq)
            if enemy_p and board.color_at(sq) == opponent and enemy_p in (chess.KING, chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT):
                valuable_targets.append(PIECE_NAMES[enemy_p])
        board.pop()

        if len(valuable_targets) >= 2:
            targets_str = " and ".join(valuable_targets[:2])
            motifs.append(f"Fork! {piece_name} simultaneously threatens enemy {targets_str}.")

        # 4. Center Control / Outpost
        if move.to_square in CENTER_SQUARES and piece_type in (chess.KNIGHT, chess.BISHOP, chess.PAWN):
            motifs.append(f"Seizes dominant central outpost on {chess.square_name(move.to_square)}.")

        # 5. Open File Infiltration
        if piece_type == chess.ROOK:
            file_idx = chess.square_file(move.to_square)
            # Check if file is open (no pawns)
            pawns_on_file = [sq for sq in board.pieces(chess.PAWN, chess.WHITE) | board.pieces(chess.PAWN, chess.BLACK) if chess.square_file(sq) == file_idx]
            if not pawns_on_file:
                motifs.append(f"Commands open {chr(ord('a') + file_idx)}-file with heavy rook pressure.")
            elif not any(chess.square_file(sq) == file_idx for sq in board.pieces(chess.PAWN, color)):
                motifs.append(f"Pressures semi-open {chr(ord('a') + file_idx)}-file against vulnerable target.")

        # 6. Pawn Advancement / Promotion Threat
        if piece_type == chess.PAWN:
            rank = chess.square_rank(move.to_square)
            if (color == chess.WHITE and rank >= 6) or (color == chess.BLACK and rank <= 1):
                motifs.append(f"Dangerous passed pawn advancement nearing promotion.")

        # 7. Pin or Skewer
        if piece_type in (chess.BISHOP, chess.ROOK, chess.QUEEN):
            board.push(move)
            for opp_sq in board.pieces(chess.KING, opponent):
                if board.is_pinned(opponent, opp_sq):
                    motifs.append(f"Pins defensive piece against enemy king.")
            board.pop()

        # Fallback positional reasoning
        if not motifs:
            if move.to_square in CENTER_SQUARES:
                motifs.append(f"Solidifies space in the center.")
            else:
                motifs.append(f"Improves piece activity and reinforces defensive coordination.")

        return motifs

    def generate_natural_reasoning(self, board: chess.Board, move: chess.Move, eval_cp: int) -> str:
        """Constructs a coherent grandmaster-style analytical summary for the move."""
        motifs = self.detect_tactical_motifs(board, move)
        san = board.san(move)
        primary = motifs[0] if motifs else "Develops piece smoothly."
        secondary = f" {motifs[1]}" if len(motifs) > 1 else ""

        side = "White" if board.turn == chess.WHITE else "Black"
        win_pct = win_probability(eval_cp if side == "White" else -eval_cp)

        return f"Move **{san}**: {primary}{secondary} Evaluation: {'+' if eval_cp > 0 else ''}{eval_cp/100:.2f}. Estimated advantage for {side}: {win_pct}% (heuristic, not a measured win rate)."

    def predict_candidates(self, board: chess.Board, top_k: int = 3, depth: int = 3, time_limit: float = 4.0) -> list[dict]:
        """Evaluates and ranks top-K candidate moves with explanations."""
        import time
        legal_moves = list(board.legal_moves)
        if not legal_moves or self.search.terminal_score(board, 0) is not None:
            return []

        candidates = []
        turn_factor = 1 if board.turn == chess.WHITE else -1

        # Reset search limits for clean evaluation
        self.search.reset_stats()
        self.search.start_time = time.monotonic()
        self.search.time_limit = time_limit
        self.search.stop_search = False

        # Keep every candidate at the same fully completed depth. An expired
        # search returns a bound, not a score suitable for ranking moves.
        scores = {}
        for move in legal_moves:
            board.push(move)
            try:
                terminal = self.search.terminal_score(board, 1)
                scores[move] = -terminal if terminal is not None else evaluate_board(board) * turn_factor
            finally:
                board.pop()

        completed_depth = 0
        for current_depth in range(1, depth + 1):
            iteration = {}
            for move in self.search.order_moves(board, legal_moves):
                board.push(move)
                try:
                    score = -self.search.negamax(board, current_depth - 1, -999999, 999999, 1)
                finally:
                    board.pop()
                if self.search.stop_search:
                    break
                iteration[move] = score
            if self.search.stop_search:
                break
            scores = iteration
            completed_depth = current_depth

        for move in legal_moves:
            score = scores[move]

            eval_white = score * turn_factor
            san = board.san(move)
            motifs = self.detect_tactical_motifs(board, move)
            explanation = self.generate_natural_reasoning(board, move, eval_white)

            candidates.append({
                "move_uci": move.uci(),
                "move_san": san,
                "from_square": chess.square_name(move.from_square),
                "to_square": chess.square_name(move.to_square),
                "piece": PIECE_NAMES.get(board.piece_type_at(move.from_square), "pawn"),
                "eval_white": eval_white,
                "eval_relative": score,
                "depth": completed_depth,
                "win_probability": win_probability(eval_white),
                "motifs": motifs,
                "explanation": explanation,
            })

        # Sort candidate moves descending by relative score for current player
        candidates.sort(key=lambda x: x["eval_relative"], reverse=True)

        best_score = candidates[0]["eval_relative"] if candidates else 0

        # Classify move qualities relative to best move
        for c in candidates:
            diff = best_score - c["eval_relative"]
            if diff <= 0:
                c["classification"] = "Best"
                c["badge_color"] = "#10b981"  # Emerald
            elif diff <= 25:
                c["classification"] = "Excellent"
                c["badge_color"] = "#06b6d4"  # Cyan
            elif diff <= 60:
                c["classification"] = "Good"
                c["badge_color"] = "#3b82f6"  # Blue
            elif diff <= 120:
                c["classification"] = "Inaccuracy"
                c["badge_color"] = "#f59e0b"  # Amber
            elif diff <= 250:
                c["classification"] = "Mistake"
                c["badge_color"] = "#f97316"  # Orange
            else:
                c["classification"] = "Blunder"
                c["badge_color"] = "#ef4444"  # Red

        return candidates[:top_k]

    def compute_control_heatmap(self, board: chess.Board) -> list[int]:
        """Calculates 64-square control differential (White attacks - Black attacks).

        Returns list of 64 integers indexed from 0 (a1) to 63 (h8).
        Positive = White dominance, Negative = Black dominance, 0 = Contested/Neutral.
        """
        heatmap = [0] * 64
        for sq in chess.SQUARES:
            white_attacks = len(board.attackers(chess.WHITE, sq))
            black_attacks = len(board.attackers(chess.BLACK, sq))
            heatmap[sq] = white_attacks - black_attacks
        return heatmap
