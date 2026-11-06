"""Search Engine for Grandmaster-AI.

Implements:
- Negamax formulation of Minimax with Alpha-Beta Pruning
- Quiescence Search with Delta Pruning (resolves the horizon effect)
- Transposition Table caching with Polyglot Zobrist Hashing
- Move Ordering: Hash Move, MVV-LVA, Killer Move Heuristic, History Heuristic
- Iterative Deepening with Principal Variation (PV) tracking
"""

import time
import chess
import chess.polyglot
from .evaluator import evaluate_board

# Transposition Table Entry Flags
FLAG_EXACT = 0
FLAG_LOWERBOUND = 1
FLAG_UPPERBOUND = 2

# Piece values for MVV-LVA move ordering
VICTIM_SCORES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}


class TranspositionTable:
    """Fixed-size LRU-like Transposition Table using Zobrist hashes."""

    def __init__(self, max_entries: int = 500000):
        self.table = {}
        self.max_entries = max_entries
        self.hits = 0

    def get(self, key: int):
        entry = self.table.get(key)
        if entry:
            self.hits += 1
        return entry

    def store(self, key: int, depth: int, score: int, flag: int, best_move: chess.Move = None):
        if len(self.table) >= self.max_entries:
            # Clear 25% of entries if table fills up
            keys_to_remove = list(self.table.keys())[: self.max_entries // 4]
            for k in keys_to_remove:
                del self.table[k]
        self.table[key] = (depth, score, flag, best_move)

    def clear(self):
        self.table.clear()
        self.hits = 0


class SearchEngine:
    """Alpha-Beta adversarial search engine with tournament-grade heuristics."""

    def __init__(self):
        self.tt = TranspositionTable(max_entries=300000)
        self.nodes = 0
        self.killer_moves = [[None, None] for _ in range(64)]  # Up to 64 ply depth
        self.history_scores = {}  # (from_sq, to_sq) -> frequency score
        self.start_time = 0.0
        self.time_limit = 5.0
        self.stop_search = False

    def reset_stats(self):
        self.nodes = 0
        self.killer_moves = [[None, None] for _ in range(64)]
        self.history_scores.clear()
        self.stop_search = False

    def score_move(self, board: chess.Board, move: chess.Move, hash_move: chess.Move = None, ply: int = 0) -> int:
        """Assigns priority scores to moves for optimal Alpha-Beta branch pruning."""
        # 1. Transposition table best move gets highest priority
        if hash_move and move == hash_move:
            return 200000

        # 2. Captures scored via MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
        if board.is_capture(move):
            victim_type = board.piece_type_at(move.to_square) or chess.PAWN
            attacker_type = board.piece_type_at(move.from_square) or chess.PAWN
            mvv_lva = (VICTIM_SCORES[victim_type] * 10) - VICTIM_SCORES[attacker_type]
            return 100000 + mvv_lva

        # 3. Promotions
        if move.promotion:
            return 90000 + (VICTIM_SCORES.get(move.promotion, 0) // 10)

        # 4. Killer moves (quiet moves that previously triggered beta cutoffs at this ply)
        if ply < 64:
            if move == self.killer_moves[ply][0]:
                return 80000
            elif move == self.killer_moves[ply][1]:
                return 75000

        # 5. History heuristic
        return self.history_scores.get((move.from_square, move.to_square), 0)

    def order_moves(self, board: chess.Board, moves, hash_move: chess.Move = None, ply: int = 0):
        """Returns generator of moves ordered by highest likelihood of pruning."""
        scored_moves = []
        for move in moves:
            score = self.score_move(board, move, hash_move, ply)
            scored_moves.append((score, move))
        scored_moves.sort(key=lambda x: x[0], reverse=True)
        return [m[1] for m in scored_moves]

    def quiescence(self, board: chess.Board, alpha: int, beta: int, q_depth: int = 0) -> int:
        """Quiescence search: evaluates tactical capture chains until position settles."""
        self.nodes += 1

        # Check time limit periodically
        if (self.nodes & 2047) == 0 and self.time_limit > 0:
            if (time.time() - self.start_time) > self.time_limit:
                self.stop_search = True
                return alpha

        # Stand-pat static evaluation
        side_to_move = 1 if board.turn == chess.WHITE else -1
        stand_pat = evaluate_board(board) * side_to_move

        if stand_pat >= beta:
            return beta
        if stand_pat > alpha:
            alpha = stand_pat

        # Maximum quiescence depth guard
        if q_depth >= 8:
            return alpha

        # Delta pruning: skip if even capturing a queen cannot raise alpha
        if stand_pat + 975 < alpha and not board.is_check():
            return alpha

        # Only evaluate tactical captures
        capture_moves = list(board.generate_legal_captures())
        if not capture_moves:
            return alpha

        ordered_captures = self.order_moves(board, capture_moves, None, 0)

        for move in ordered_captures:
            board.push(move)
            score = -self.quiescence(board, -beta, -alpha, q_depth + 1)
            board.pop()

            if self.stop_search:
                return alpha

            if score >= beta:
                return beta
            if score > alpha:
                alpha = score

        return alpha

    def negamax(self, board: chess.Board, depth: int, alpha: int, beta: int, ply: int) -> int:
        """Negamax algorithm with Alpha-Beta pruning and transposition caching."""
        self.nodes += 1

        if (self.nodes & 2047) == 0 and self.time_limit > 0:
            if (time.time() - self.start_time) > self.time_limit:
                self.stop_search = True
                return alpha

        # Transposition table probe
        zobrist_key = chess.polyglot.zobrist_hash(board)
        tt_entry = self.tt.get(zobrist_key)
        hash_move = None

        if tt_entry:
            tt_depth, tt_score, tt_flag, tt_best_move = tt_entry
            hash_move = tt_best_move
            if tt_depth >= depth and ply > 0:
                if tt_flag == FLAG_EXACT:
                    return tt_score
                elif tt_flag == FLAG_LOWERBOUND:
                    alpha = max(alpha, tt_score)
                elif tt_flag == FLAG_UPPERBOUND:
                    beta = min(beta, tt_score)
                if alpha >= beta:
                    return tt_score

        # Terminal conditions
        if board.is_checkmate():
            return -30000 + ply  # Prioritize faster mates

        if (
            board.is_stalemate()
            or board.is_insufficient_material()
            or board.can_claim_threefold_repetition()
            or board.can_claim_fifty_moves()
        ):
            return 0

        # Leaf node: proceed to Quiescence Search
        if depth <= 0:
            return self.quiescence(board, alpha, beta, 0)

        legal_moves = list(board.legal_moves)
        if not legal_moves:
            return 0

        ordered_moves = self.order_moves(board, legal_moves, hash_move, ply)

        best_score = -999999
        best_move = None
        orig_alpha = alpha

        for move in ordered_moves:
            board.push(move)
            score = -self.negamax(board, depth - 1, -beta, -alpha, ply + 1)
            board.pop()

            if self.stop_search:
                return alpha

            if score > best_score:
                best_score = score
                best_move = move

            if score > alpha:
                alpha = score
                if alpha >= beta:
                    # Beta Cutoff
                    if not board.is_capture(move) and ply < 64:
                        # Store killer move
                        if self.killer_moves[ply][0] != move:
                            self.killer_moves[ply][1] = self.killer_moves[ply][0]
                            self.killer_moves[ply][0] = move
                        # Increment history score
                        key = (move.from_square, move.to_square)
                        self.history_scores[key] = self.history_scores.get(key, 0) + (depth * depth)
                    break

        # Store result in Transposition Table
        if not self.stop_search:
            if best_score <= orig_alpha:
                tt_flag = FLAG_UPPERBOUND
            elif best_score >= beta:
                tt_flag = FLAG_LOWERBOUND
            else:
                tt_flag = FLAG_EXACT
            self.tt.store(zobrist_key, depth, best_score, tt_flag, best_move)

        return best_score

    def search_best_move(self, board: chess.Board, max_depth: int = 4, time_limit: float = 3.0) -> dict:
        """Finds optimal move using Iterative Deepening with Alpha-Beta search."""
        self.reset_stats()
        self.start_time = time.time()
        self.time_limit = time_limit

        best_move = None
        best_eval = 0
        depth_reached = 1
        pv_line = []

        legal_moves = list(board.legal_moves)
        if not legal_moves:
            return {
                "best_move": None,
                "best_move_uci": None,
                "best_move_san": None,
                "evaluation": 0,
                "depth": 0,
                "nodes": 0,
                "time_ms": 0,
                "nps": 0,
                "pv": [],
            }

        if len(legal_moves) == 1:
            move = legal_moves[0]
            return {
                "best_move": move,
                "best_move_uci": move.uci(),
                "best_move_san": board.san(move),
                "evaluation": evaluate_board(board),
                "depth": 1,
                "nodes": 1,
                "time_ms": 1,
                "nps": 1000,
                "pv": [board.san(move)],
            }

        # Iterative Deepening
        for current_depth in range(1, max_depth + 1):
            alpha = -999999
            beta = 999999
            iteration_best_move = None
            iteration_best_eval = -999999

            zobrist_key = chess.polyglot.zobrist_hash(board)
            tt_entry = self.tt.get(zobrist_key)
            hash_move = tt_entry[3] if tt_entry else None

            ordered_moves = self.order_moves(board, legal_moves, hash_move, 0)

            for move in ordered_moves:
                board.push(move)
                score = -self.negamax(board, current_depth - 1, -beta, -alpha, 1)
                board.pop()

                if self.stop_search:
                    break

                if score > iteration_best_eval:
                    iteration_best_eval = score
                    iteration_best_move = move

                if score > alpha:
                    alpha = score

            if self.stop_search:
                # If interrupted during deepening, retain best move from previous complete depth
                if best_move is None:
                    best_move = iteration_best_move or legal_moves[0]
                    best_eval = iteration_best_eval
                break

            if iteration_best_move:
                best_move = iteration_best_move
                best_eval = iteration_best_eval
                depth_reached = current_depth

            # Check for mate found
            if abs(best_eval) >= 29000:
                break

        elapsed = max(0.001, time.time() - self.start_time)
        nps = int(self.nodes / elapsed)

        # Convert score to White's perspective
        side_factor = 1 if board.turn == chess.WHITE else -1
        white_perspective_eval = best_eval * side_factor

        # Trace Principal Variation
        pv_san = []
        if best_move:
            try:
                pv_san.append(board.san(best_move))
            except Exception:
                pv_san.append(best_move.uci())

        return {
            "best_move": best_move,
            "best_move_uci": best_move.uci() if best_move else None,
            "best_move_san": pv_san[0] if pv_san else None,
            "evaluation": white_perspective_eval,
            "depth": depth_reached,
            "nodes": self.nodes,
            "time_ms": int(elapsed * 1000),
            "nps": nps,
            "pv": pv_san,
        }
