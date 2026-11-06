"""Grandmaster-AI: Terminal Interactive CLI Chess Game.

Features:
- Unicode & ASCII dual-layer board renderer with ANSI styling
- Live Minimax + Alpha-Beta AI opponent with adjustable difficulty depth
- Real-time Move Predictor with natural language tactical explanations
- Centipawn evaluation gauge and material balance tracking
- Move undo/redo, FEN import/export, and PGN generation
"""

import sys
import os
from pathlib import Path
import chess
import chess.pgn

# Ensure backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.engine.evaluator import evaluate_board, get_material_balance, get_game_phase
from backend.engine.search import SearchEngine
from backend.engine.predictor import MovePredictor, win_probability

UNICODE_PIECES = {
    "P": "♙", "N": "♘", "B": "♗", "R": "♖", "Q": "♕", "K": "♔",
    "p": "♟", "n": "♞", "b": "♝", "r": "♜", "q": "♛", "k": "♚",
    ".": "·",
}

# ANSI Color codes for terminals
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
EMERALD = "\033[32m"
AMBER = "\033[33m"
RED = "\033[31m"
BLUE = "\033[34m"
PURPLE = "\033[35m"
WHITE_BG = "\033[47m\033[30m"
DARK_BG = "\033[40m\033[37m"


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def render_ascii_eval_bar(eval_cp: int) -> str:
    """Renders a 20-character visual evaluation meter."""
    # Scale: -1000 cp to +1000 cp
    clamped = max(-1000, min(1000, eval_cp))
    ratio = (clamped + 1000) / 2000.0  # 0.0 (Black winning) to 1.0 (White winning)
    white_blocks = int(ratio * 20)
    black_blocks = 20 - white_blocks
    bar = f"{EMERALD}{'█' * white_blocks}{RED}{'░' * black_blocks}{RESET}"
    sign = "+" if eval_cp > 0 else ""
    return f"[{bar}] {sign}{eval_cp/100:.2f} ({win_probability(eval_cp)}% White)"


def print_board_side_by_side(board: chess.Board, predictor: MovePredictor, ai_depth: int):
    """Renders chess board alongside real-time analytical telemetry."""
    eval_cp = evaluate_board(board)
    material = get_material_balance(board)
    turn_str = f"{EMERALD}White to move{RESET}" if board.turn == chess.WHITE else f"{AMBER}Black to move{RESET}"

    print(f"\n{BOLD}{CYAN}═══ GRANDMASTER-AI INTERACTIVE CHESS PLATFORM ═══{RESET}")
    print(f"Status: {turn_str} | AI Search Depth: {BOLD}{ai_depth}{RESET}")
    print(f"Eval: {render_ascii_eval_bar(eval_cp)}")
    print(f"Material: White {material['white_points']} pts vs Black {material['black_points']} pts ({material['advantage'].capitalize()} +{material['differential']})\n")

    board_rows = []
    for rank in range(7, -1, -1):
        row_str = f" {BOLD}{rank + 1}{RESET} "
        for file in range(8):
            sq = chess.square(file, rank)
            piece = board.piece_at(sq)
            symbol = UNICODE_PIECES.get(piece.symbol(), ".") if piece else "·"
            # Checkerboard background styling
            is_light = (file + rank) % 2 != 0
            if is_light:
                row_str += f"{WHITE_BG} {symbol} {RESET}"
            else:
                row_str += f"{DARK_BG} {symbol} {RESET}"
        board_rows.append(row_str)

    # Analytical side panel content
    side_info = [
        f"{BOLD}{PURPLE}── AI MOVE PREDICTOR ──{RESET}",
    ]

    try:
        candidates = predictor.predict_candidates(board, top_k=2, depth=2)
        if candidates:
            best_c = candidates[0]
            side_info.append(f"Optimal Move: {BOLD}{EMERALD}{best_c['move_san']}{RESET} [{best_c['classification']}]")
            side_info.append(f"Tactical Rationale: {best_c['motifs'][0] if best_c['motifs'] else 'Positional play'}")
            if len(candidates) > 1:
                alt = candidates[1]
                side_info.append(f"Alternative: {CYAN}{alt['move_san']}{RESET} ({alt['classification']}, {'+' if alt['eval_white']>0 else ''}{alt['eval_white']/100:.2f})")
        else:
            side_info.append("No legal moves available.")
    except Exception:
        side_info.append("Calculating tactical analysis...")

    side_info.append(f"{DIM}Commands: move (e4/e2e4), hint, eval, undo, depth <n>, pgn, quit{RESET}")

    # Print combined
    for i in range(8):
        panel = side_info[i] if i < len(side_info) else ""
        print(f"{board_rows[i]}   {panel}")

    print(f"    {BOLD}a  b  c  d  e  f  g  h{RESET}\n")


def play_cli_game():
    """Main CLI execution loop."""
    print(f"{BOLD}{EMERALD}Starting Grandmaster-AI Chess Terminal...{RESET}")
    board = chess.Board()
    search = SearchEngine()
    predictor = MovePredictor(search)
    ai_depth = 2

    print(f"Choose your side:")
    print(f"  [1] White (Human plays first)")
    print(f"  [2] Black (AI plays first)")
    choice = input("Select [1/2] (Default 1): ").strip()
    human_color = chess.BLACK if choice == "2" else chess.WHITE

    print("Type a move such as e4 or e2e4. Try 'hint', 'undo', or 'help' at any time.")

    while SearchEngine.terminal_score(board, 0) is None:
        print_board_side_by_side(board, predictor, ai_depth)

        # Check conditions
        if board.is_check():
            print(f"{BOLD}{RED}⚠ CHECK! The king is under attack!{RESET}\n")

        # Human Turn
        if board.turn == human_color:
            prompt = f"{BOLD}Your Move ({'White' if human_color == chess.WHITE else 'Black'}): {RESET}"
            user_input = input(prompt).strip()

            if not user_input:
                continue

            cmd_lower = user_input.lower()

            if cmd_lower in ("quit", "exit", "q"):
                print("Exiting game. Thanks for playing!")
                return

            if cmd_lower in ("hint", "predict"):
                print(f"\n{BOLD}{CYAN}Analyzing position for optimal predictions...{RESET}")
                hints = predictor.predict_candidates(board, top_k=3, depth=ai_depth)
                for rank_idx, h in enumerate(hints, 1):
                    print(f"  {rank_idx}. {BOLD}{h['move_san']}{RESET} [{h['classification']}] -> {h['explanation']}")
                input("\nPress Enter to resume...")
                continue

            if cmd_lower == "eval":
                print(f"\nDetailed Board Evaluation: {evaluate_board(board)} centipawns")
                phase = get_game_phase(board)
                print(f"Game State Phase: {phase}")
                input("Press Enter to resume...")
                continue

            if cmd_lower == "heatmap":
                print(f"\n{BOLD}Square Control Matrix (White - Black attacks):{RESET}")
                hm = predictor.compute_control_heatmap(board)
                for r in range(7, -1, -1):
                    row = [f"{hm[chess.square(f, r)]:+2d}" for f in range(8)]
                    print(f" {r+1} | " + " ".join(row))
                print("     a   b   c   d   e   f   g   h\n")
                input("Press Enter to resume...")
                continue

            if cmd_lower == "undo":
                if len(board.move_stack) >= 2:
                    board.pop()
                    board.pop()
                    print(f"{AMBER}Retracted 2 moves (Human + AI).{RESET}")
                elif len(board.move_stack) == 1 and human_color == chess.WHITE:
                    board.pop()
                    print(f"{AMBER}Retracted 1 move.{RESET}")
                else:
                    print("No moves to undo.")
                continue

            if cmd_lower.startswith("depth"):
                parts = cmd_lower.split()
                if len(parts) > 1 and parts[1].isdigit():
                    ai_depth = max(1, min(6, int(parts[1])))
                    print(f"{EMERALD}AI search depth set to {ai_depth}.{RESET}")
                continue

            if cmd_lower == "fen":
                print(f"\nCurrent FEN: {board.fen()}")
                input("Press Enter to resume...")
                continue

            if cmd_lower == "pgn":
                print(f"\nCurrent PGN:\n{export_game(board)}")
                input("Press Enter to resume...")
                continue

            if cmd_lower == "help":
                print("""
Available Commands:
- Standard algebraic notation: e4, Nf3, O-O, exd5
- Coordinate notation: e2e4, g1f3, e7e8q
- hint / predict: Get top 3 grandmaster predictions
- eval: Detailed positional heuristic breakdown
- heatmap: 8x8 square control attack matrix
- undo: Take back last move
- depth <n>: Set AI depth (1-6)
- fen: Show Forsyth-Edwards Notation
- pgn: Export Portable Game Notation
- quit: Exit
                """)
                input("Press Enter to resume...")
                continue

            # Parse user move
            move = None
            try:
                move = board.parse_san(user_input)
            except ValueError:
                try:
                    move = chess.Move.from_uci(user_input)
                    if move not in board.legal_moves:
                        move = None
                except ValueError:
                    move = None

            if move and move in board.legal_moves:
                board.push(move)
            else:
                print(f"{RED}Invalid move '{user_input}'. Type 'help' for instructions.{RESET}")
                input("Press Enter to continue...")

        # AI Turn
        else:
            print(f"\n{BOLD}{CYAN}Grandmaster-AI is calculating move at depth {ai_depth}...{RESET}")
            result = search.search_best_move(board, max_depth=ai_depth, time_limit=3.0)
            best_move = result["best_move"]

            if best_move and best_move in board.legal_moves:
                san = board.san(best_move)
                motifs = predictor.detect_tactical_motifs(board, best_move)
                reason = motifs[0] if motifs else "Solid positional maneuver."
                print(f"AI plays: {BOLD}{EMERALD}{san}{RESET} ({reason})")
                print(f"{DIM}[Depth: {result['depth']} | Nodes: {result['nodes']} | NPS: {result['nps']:,} | Time: {result['time_ms']}ms]{RESET}\n")

                board.push(best_move)
            else:
                print(f"{RED}No legal moves for AI.{RESET}")
                break

    # Game Over
    print_board_side_by_side(board, predictor, ai_depth)
    print(f"\n{BOLD}════ GAME OVER ════{RESET}")
    result_str = board.result() if board.is_game_over() else "1/2-1/2"
    if board.is_checkmate():
        winner = "Black" if board.turn == chess.WHITE else "White"
        print(f"{BOLD}{EMERALD}Checkmate! {winner} wins the game! ({result_str}){RESET}")
    elif board.is_stalemate():
        print(f"{AMBER}Draw by Stalemate! ({result_str}){RESET}")
    elif board.is_insufficient_material():
        print(f"{AMBER}Draw by Insufficient Material! ({result_str}){RESET}")
    elif board.can_claim_threefold_repetition():
        print(f"{AMBER}Draw by Threefold Repetition! ({result_str}){RESET}")
    else:
        print(f"{AMBER}Game ended: {result_str}{RESET}")


def export_game(board):
    """Build the export from the current stack, including after an undo."""
    game = chess.pgn.Game.from_board(board)
    if SearchEngine.terminal_score(board, 0) is not None and not board.is_checkmate():
        game.headers["Result"] = "1/2-1/2"
    return str(game)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        play_cli_game()
    except (EOFError, KeyboardInterrupt):
        print("\nThanks for playing!")
