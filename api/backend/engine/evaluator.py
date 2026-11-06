"""Board State Evaluator for Grandmaster-AI.

Implements multi-factor positional heuristic evaluation:
- PeSTO Piece-Square Tables (Tapered Middlegame / Endgame)
- Pawn structure analysis (Passed, Doubled, Isolated pawns)
- Mobility and Center Control
- King Safety and Pawn Shield
- Tapered phase evaluation transitioning smoothly from opening to endgame
"""

import chess

# Material constants (Middlegame / Endgame)
MG_VALUE = {
    chess.PAWN: 82,
    chess.KNIGHT: 337,
    chess.BISHOP: 365,
    chess.ROOK: 477,
    chess.QUEEN: 1025,
    chess.KING: 0,
}

EG_VALUE = {
    chess.PAWN: 94,
    chess.KNIGHT: 281,
    chess.BISHOP: 297,
    chess.ROOK: 512,
    chess.QUEEN: 936,
    chess.KING: 0,
}

# Phase weight contributions to determine transition from opening/middlegame to endgame
GAME_PHASE_WEIGHT = {
    chess.PAWN: 0,
    chess.KNIGHT: 1,
    chess.BISHOP: 1,
    chess.ROOK: 2,
    chess.QUEEN: 4,
    chess.KING: 0,
}
TOTAL_PHASE = 24  # 4*1 + 4*1 + 4*2 + 2*4 = 24

# PeSTO Piece-Square Tables (from White's perspective, rank 1 to rank 8)
# Square 0 = a1, 7 = h1 ... 56 = a8, 63 = h8

MG_PAWN_TABLE = [
      0,   0,   0,   0,   0,   0,   0,   0,
     98, 134,  61,  95,  68, 126,  34, -11,
     -6,   7,  26,  31,  65,  56,  25, -20,
    -14,  13,   6,  21,  23,  12,  17, -23,
    -27,  -2,  -5,  12,  17,   6,  10, -25,
    -26,  -4,  -4, -10,   3,   3,  33, -12,
    -35,  -1, -20, -23, -15,  24,  38, -22,
      0,   0,   0,   0,   0,   0,   0,   0,
]

EG_PAWN_TABLE = [
      0,   0,   0,   0,   0,   0,   0,   0,
    178, 173, 158, 134, 147, 132, 165, 187,
     94, 100,  85,  67,  56,  53,  82,  84,
     32,  24,  13,   5,  -2,   4,  17,  17,
     13,   9,  -3,  -7,  -7,  -8,   3,  -1,
      4,   7,  -6,   1,   0,  -5,  -1,  -8,
     13,   8,   8,  10,  13,   0,   2,  -7,
      0,   0,   0,   0,   0,   0,   0,   0,
]

MG_KNIGHT_TABLE = [
    -167, -89, -34, -49,  61, -97, -15, -107,
     -73, -41,  72,  36,  23,  62,   7,  -17,
     -47,  60,  37,  65,  84, 129,  73,   44,
      -9,  17,  19,  53,  37,  69,  18,   22,
     -13,   4,  16,  13,  28,  19,  21,   -8,
     -23,  -9,  12,  10,  19,  17,  25,  -16,
     -29, -53, -12,  -3,  -1,  18, -14,  -19,
    -105, -21, -58, -33, -17, -28, -19,  -23,
]

EG_KNIGHT_TABLE = [
    -58, -38, -13, -28, -31, -27, -63, -99,
    -25,  -8, -25,  -2,  -9, -25, -24, -52,
    -24, -20,  10,   9,  -1,  -9, -19, -41,
    -17,   3,  22,  22,  22,  11,   8, -18,
    -18,  -6,  16,  25,  16,  17,   4, -18,
    -23,  -3,  -1,  15,  10,  -3, -20, -22,
    -42, -20, -10,  -5,  -2, -20, -23, -44,
    -29, -51, -23, -15, -22, -18, -50, -64,
]

MG_BISHOP_TABLE = [
    -29,   4, -82, -37, -25, -42,   7,  -8,
    -26,  16, -18, -13,  30,  59,  18, -47,
    -16,  37,  43,  40,  35,  50,  37,  -2,
     -4,   5,  19,  50,  37,  37,   7,  -2,
     -6,  13,  13,  26,  34,  12,  10,   4,
      0,  15,  15,  15,  14,  27,  18,  10,
      4,  15,  16,   0,   7,  21,  33,   1,
    -33,  -3, -14, -21, -13, -12, -39, -21,
]

EG_BISHOP_TABLE = [
    -14, -21, -11,  -8,  -7,  -9, -17, -24,
     -8,  -4,   7, -12,  -3, -13,  -4, -14,
      2,  -8,   0,  -1,  -2,   6,   0,   4,
     -3,   9,  12,   9,  14,  10,   3,   2,
     -6,   3,  13,  19,   7,  10,  -3,  -9,
    -12,  -3,   8,  10,  13,   3,  -7, -15,
    -14, -18,  -7,  -1,   4,  -9, -15, -27,
    -23,  -9, -23,  -5,  -9, -16,  -5, -17,
]

MG_ROOK_TABLE = [
     32,  42,  32,  51,  63,   9,  31,  43,
     27,  32,  58,  62,  80,  67,  26,  44,
     -5,  19,  26,  36,  17,  45,  61,  16,
    -24, -11,   7,  26,  24,  35,  -8, -20,
    -36, -26, -12,  -1,   9,  -7,   6, -23,
    -45, -25, -16, -17,   3,   0,  -5, -33,
    -44, -16, -20,  -9,  -1,  11,  -6, -71,
    -19, -13,   1,  17,  16,   7, -37, -26,
]

EG_ROOK_TABLE = [
     13,  10,  18,  15,  12,  12,   8,   5,
     11,  13,  13,  11,  -3,   3,   8,   3,
      7,   7,   7,   5,   4,  -3,  -5,  -3,
      4,   3,  13,   1,   2,   1,  -1,   2,
      3,   5,   8,   4,  -5,  -6,  -8, -11,
     -4,   0,  -5,  -1,  -7, -12,  -8, -16,
     -6,  -6,   0,   2,  -9,  -9, -11,  -3,
     -9,   2,   3,  -1,  -5, -13,   4, -20,
]

MG_QUEEN_TABLE = [
    -28,   0,  29,  12,  59,  44,  43,  45,
    -24, -39,  -5,   1, -16,  57,  28,  54,
    -13, -17,   7,   8,  29,  56,  47,  57,
    -27, -27, -16, -16,  -1,  17,  -2,   1,
     -9, -26,  -9, -10,  -2,  -4,   3,  -3,
    -14,   2, -11,  -2,  -5,   2,  14,   5,
    -35,  -8,  11,   2,   8,  15,  -3,   1,
     -1, -18,  -9,  10, -15, -25, -31, -50,
]

EG_QUEEN_TABLE = [
     -9,  22,  22,  27,  27,  19,  10,  20,
    -17,  20,  32,  41,  58,  25,  30,   0,
    -20,   6,   9,  49,  47,  35,  19,   9,
      3,  22,  24,  45,  57,  40,  57,  36,
    -18,  28,  19,  47,  31,  34,  39,  18,
    -16, -27,  15,   6,   9,  17,  10,   5,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -33, -28, -22, -43,  -5, -32, -20, -41,
]

MG_KING_TABLE = [
    -65,  23,  16, -15, -56, -34,   2,  13,
     29,  -1, -20,  -7,  -8,  -4, -38, -29,
     -9,  24,   2, -16, -20,   6,  22, -22,
    -17, -20, -12, -27, -30, -25, -14, -36,
    -49,  -1, -27, -39, -46, -44, -33, -51,
    -14, -14, -22, -46, -44, -30, -15, -27,
      1,   7,  -8, -64, -43, -16,   9,   8,
    -15,  36,  12, -54,   8, -28,  24,  14,
]

EG_KING_TABLE = [
    -74, -35, -18, -18, -11,  15,   4, -17,
    -12,  17,  14,  17,  17,  38,  23,  11,
     10,  17,  23,  15,  20,  45,  44,  13,
     -8,  22,  24,  27,  26,  33,  26,   3,
    -18,  -4,  21,  24,  27,  23,   9, -11,
    -19,  -3,  11,  21,  23,  16,   7,  -9,
    -27, -11,   4,  13,  14,   4,  -5, -17,
    -53, -34, -21, -11, -28, -14, -24, -43,
]

MG_TABLES = {
    chess.PAWN: MG_PAWN_TABLE,
    chess.KNIGHT: MG_KNIGHT_TABLE,
    chess.BISHOP: MG_BISHOP_TABLE,
    chess.ROOK: MG_ROOK_TABLE,
    chess.QUEEN: MG_QUEEN_TABLE,
    chess.KING: MG_KING_TABLE,
}

EG_TABLES = {
    chess.PAWN: EG_PAWN_TABLE,
    chess.KNIGHT: EG_KNIGHT_TABLE,
    chess.BISHOP: EG_BISHOP_TABLE,
    chess.ROOK: EG_ROOK_TABLE,
    chess.QUEEN: EG_QUEEN_TABLE,
    chess.KING: EG_KING_TABLE,
}

CENTER_SQUARES = {chess.D4, chess.E4, chess.D5, chess.E5}
EXTENDED_CENTER = {
    chess.C3, chess.D3, chess.E3, chess.F3,
    chess.C4, chess.F4, chess.C5, chess.F5,
    chess.C6, chess.D6, chess.E6, chess.F6,
}


def get_game_phase(board: chess.Board) -> int:
    """Calculates non-linear game phase (0 = pure endgame, 24 = opening)."""
    phase = 0
    for piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN):
        count = len(board.pieces(piece_type, chess.WHITE)) + len(board.pieces(piece_type, chess.BLACK))
        phase += count * GAME_PHASE_WEIGHT[piece_type]
    return min(phase, TOTAL_PHASE)


def evaluate_pawn_structure(board: chess.Board, color: chess.Color) -> int:
    """Evaluates passed, doubled, and isolated pawns."""
    score = 0
    pawns = board.pieces(chess.PAWN, color)
    opponent_pawns = board.pieces(chess.PAWN, not color)

    pawn_files = [chess.square_file(sq) for sq in pawns]

    # Doubled pawns penalty
    for file_idx in range(8):
        count = pawn_files.count(file_idx)
        if count > 1:
            score -= 15 * (count - 1)

    # Isolated and Passed pawns
    for sq in pawns:
        f = chess.square_file(sq)
        r = chess.square_rank(sq)

        # Isolated pawn: no friendly pawns on adjacent files
        has_neighbor = any(abs(other_f - f) == 1 for other_f in pawn_files)
        if not has_neighbor:
            score -= 15

        # Passed pawn: no opponent pawns in front on same or adjacent files
        passed = True
        for opp_sq in opponent_pawns:
            opp_f = chess.square_file(opp_sq)
            opp_r = chess.square_rank(opp_sq)
            if abs(opp_f - f) <= 1:
                if color == chess.WHITE and opp_r > r:
                    passed = False
                    break
                elif color == chess.BLACK and opp_r < r:
                    passed = False
                    break

        if passed:
            advancement = r if color == chess.WHITE else (7 - r)
            score += 10 + (advancement * advancement * 4)

    return score


def evaluate_king_safety(board: chess.Board, color: chess.Color, phase: int) -> int:
    """Evaluates king pawn shield and exposure during opening/middlegame."""
    if phase < 6:
        # King safety matters less in late endgame where king becomes active
        return 0

    score = 0
    king_sq = board.king(color)
    if king_sq is None:
        return 0

    king_file = chess.square_file(king_sq)
    king_rank = chess.square_rank(king_sq)

    # Castled king shield bonus
    if (color == chess.WHITE and king_rank == 0) or (color == chess.BLACK and king_rank == 7):
        if king_file in (1, 2, 6, 7):
            friendly_pawns = board.pieces(chess.PAWN, color)
            shield_files = [max(0, king_file - 1), king_file, min(7, king_file + 1)]
            for f in shield_files:
                has_shield_pawn = any(chess.square_file(sq) == f for sq in friendly_pawns)
                if has_shield_pawn:
                    score += 15
                else:
                    score -= 15

    return score


def evaluate_board(board: chess.Board) -> int:
    """Returns static evaluation score in centipawns from the perspective of White.

    Positive score = White advantage, Negative score = Black advantage.
    Incorporates PeSTO tapered evaluation, pawn structure, king safety, center control.
    """
    if board.is_checkmate():
        # Checkmate for side to move
        return -30000 if board.turn == chess.WHITE else 30000

    if (
        board.is_stalemate()
        or board.is_insufficient_material()
        or board.can_claim_threefold_repetition()
        or board.can_claim_fifty_moves()
    ):
        return 0

    phase = get_game_phase(board)

    white_mg = 0
    white_eg = 0
    black_mg = 0
    black_eg = 0

    # Piece values & PeSTO Piece-Square Tables
    for piece_type in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING):
        # White pieces
        for sq in board.pieces(piece_type, chess.WHITE):
            white_mg += MG_VALUE[piece_type] + MG_TABLES[piece_type][sq]
            white_eg += EG_VALUE[piece_type] + EG_TABLES[piece_type][sq]
            # Center control bonus for minor pieces
            if sq in CENTER_SQUARES and piece_type in (chess.PAWN, chess.KNIGHT, chess.BISHOP):
                white_mg += 15
            elif sq in EXTENDED_CENTER and piece_type in (chess.KNIGHT, chess.BISHOP):
                white_mg += 6

        # Black pieces (mirror square for black's table perspective)
        for sq in board.pieces(piece_type, chess.BLACK):
            mirrored_sq = chess.square_mirror(sq)
            black_mg += MG_VALUE[piece_type] + MG_TABLES[piece_type][mirrored_sq]
            black_eg += EG_VALUE[piece_type] + EG_TABLES[piece_type][mirrored_sq]
            # Center control bonus for minor pieces
            if sq in CENTER_SQUARES and piece_type in (chess.PAWN, chess.KNIGHT, chess.BISHOP):
                black_mg += 15
            elif sq in EXTENDED_CENTER and piece_type in (chess.KNIGHT, chess.BISHOP):
                black_mg += 6

    # Pawn structures
    white_mg += evaluate_pawn_structure(board, chess.WHITE)
    black_mg += evaluate_pawn_structure(board, chess.BLACK)
    white_eg += evaluate_pawn_structure(board, chess.WHITE)
    black_eg += evaluate_pawn_structure(board, chess.BLACK)

    # King safety (scaled by phase)
    white_mg += evaluate_king_safety(board, chess.WHITE, phase)
    black_mg += evaluate_king_safety(board, chess.BLACK, phase)

    # Bishop pair bonus
    if len(board.pieces(chess.BISHOP, chess.WHITE)) >= 2:
        white_mg += 30
        white_eg += 40
    if len(board.pieces(chess.BISHOP, chess.BLACK)) >= 2:
        black_mg += 30
        black_eg += 40

    # Tapered score interpolation
    mg_score = white_mg - black_mg
    eg_score = white_eg - black_eg
    eval_score = ((mg_score * phase) + (eg_score * (TOTAL_PHASE - phase))) // TOTAL_PHASE

    # Tempo bonus (slight initiative for the side whose turn it is)
    eval_score += 15 if board.turn == chess.WHITE else -15

    return eval_score


def get_material_balance(board: chess.Board) -> dict:
    """Returns material counts and advantage breakdown for UI."""
    counts = {
        "white": {p: len(board.pieces(p, chess.WHITE)) for p in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)},
        "black": {p: len(board.pieces(p, chess.BLACK)) for p in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)},
    }
    std_val = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
    white_pts = sum(counts["white"][p] * std_val[p] for p in std_val)
    black_pts = sum(counts["black"][p] * std_val[p] for p in std_val)
    diff = white_pts - black_pts
    return {
        "white_points": white_pts,
        "black_points": black_pts,
        "advantage": "white" if diff > 0 else ("black" if diff < 0 else "equal"),
        "differential": abs(diff),
        "counts": counts,
    }
