# Grandmaster-AI: college demo and engineering handoff

Updated 6 November 2026.

## Start the game

From the project folder, install Python dependencies with `python -m pip install -r requirements.txt`.

- **3D browser game:** double-click `run_web.bat`, then visit http://localhost:8000.
- **Text-based assignment deliverable:** double-click `run_cli.bat`, or run `python backend/cli_game.py`. Choose a side and enter moves such as `e4`, `Nf3`, or `e2e4`. Commands include `hint`, `undo`, `depth 2`, `pgn`, and `quit`.
- **Tests:** `python -m pytest -q` or `run_tests.bat`.
- **API reference:** http://localhost:8000/docs while the server is running.

Python 3.13 was used for verification. Direct dependencies are pinned to the versions installed during this run. For an isolated environment, create a venv with `python -m venv .venv` and use `.venv\Scripts\python.exe` for installation and launching.

## Play without learning technical controls

Simple play starts at Beginner difficulty. Select one of your pieces, then a highlighted destination. The turn banner explains what to do. Hint shows a suggested move; Help me move plays a suggestion; Undo takes back your turn and the AI reply. The keyboard field accepts algebraic and coordinate notation. The promotion selector offers queen, rook, bishop and knight.

Analysis mode reveals the position loader, estimated advantage, ranked candidates and square-control heatmap. These are educational heuristics, not calibrated probabilities or a claim of grandmaster strength. The difficulty setting controls search depth; search also has a time budget.

The current match saves in this browser on this device, including its starting position and moves. Reloading resumes it. Export PGN downloads a portable record. Starting a new game replaces this local save. Clearing browser data removes it. This version has no accounts, online multiplayer, shared leaderboard or cloud database; none are needed for the submitted human-versus-AI assignment. No API keys or paid AI service are required.

## Engineering changes

### Search and API

- Retains a handcrafted evaluator, negamax Minimax, alpha-beta pruning, iterative deepening, move ordering, transposition storage and quiescence search.
- Check evasions and promotions are searched at tactical leaves. Terminal states are checked before cache reuse.
- Monotonic deadlines retain the last completed search; interrupted candidate rankings never expose sentinel scores. Candidate moves are compared at the same completed depth.
- Mutable search state belongs to one request. Two expensive requests are admitted per server process; additional ones receive HTTP 503 with `Retry-After`. This is a bounded local-demo service, not a distributed job queue.
- Position validation rejects malformed and impossible boards, invalid move histories and inconsistent FEN/history pairs. En passant capture metadata and promotion handling are corrected.
- CORS defaults to same-origin use. To allow a separate frontend, set `CHESS_ALLOWED_ORIGINS` to a comma-separated list of exact origins before starting the server. There are no server secrets to put in the browser.
- Repetition history is reconstructed from `initial_fen` and `moves`. For consistent beginner play, threefold repetition and the 50-move threshold automatically end the game when reached, rather than requiring a separate claim button. This differs from tournament claim procedures.
- Transposition scores are conservatively reused only after a pawn move or capture; other entries help ordering. This avoids confusing identical positions with different repetition histories.

### Browser and graphics

- New-game revisions, position checks and request cancellation prevent old responses from mutating a new match. Failed AI requests expose Retry AI.
- Animation cancellation and board reconciliation keep castling, en passant and underpromotion aligned with chess rules. Dragging the camera no longer selects a square on pointer-down.
- Wood textures, beveled board layers, coordinate lettering, smooth turned profiles, detailed knight silhouette and environment lighting improve the existing procedural 3D scene. Existing themes and camera presets remain available.
- High-DPI canvas rendering, responsive camera sizing, reduced motion and disposal of replaced meshes/materials support clarity and resource use. Rendering pauses while the page is hidden. Frame rate depends on device and GPU; no universal FPS guarantee is claimed.
- Local licensed copies of Three.js r128, OrbitControls and chess.js 0.10.3 allow offline play after installation. Source URLs and SHA-256 hashes are in `frontend/vendor/manifest.json`. Google Fonts are optional; system fallbacks work offline.
- Keyboard move input, dialog focus containment, error announcements, visible focus and 44px controls improve access. This is not a formal accessibility certification; the canvas does not expose a complete screen-reader chessboard.

## Verification observed

| Check | Result |
| --- | --- |
| Python tests | 36 passed; one dependency deprecation warning from Starlette/AnyIO |
| CLI interaction | Human `e4`, an AI reply, and `quit`; exit code 0 |
| Python compile check | Passed |
| JavaScript syntax checks | Passed for changed game/rendering files |
| Chrome browser suite | 24 checks passed; no page JavaScript errors |
| Responsive and visual inspection | Desktop, analysis mode, phone and 3840×2160 screenshots inspected |
| Offline dependency test | External requests blocked; board and prediction still initialized against the local server |
| Git whitespace check | Passed |

The browser suite covers a real pointer selection, legal move indicators, keyboard play, AI reply, save/resume, undo, castling, en passant, underpromotion, stale-response rejection, failed-request recovery, PGN export and modal focus. Desktop testing used headless Chrome with software WebGL; this does not substitute for testing every physical phone/GPU.

To reproduce browser checks:

1. Install Node.js development dependencies with `npm install` (only needed for browser tests).
2. Start `python -m uvicorn backend.server:app --host 127.0.0.1 --port 8017` in one terminal.
3. Run `npm run test:browser` in another. Chrome must be installed. Set `CHESS_TEST_URL` if using another port.
4. Screenshots are written under `.qa/`.

## College presentation outline

1. Play a move in the terminal to demonstrate the required script.
2. Explain that evaluation combines material, piece-square placement, pawn structure and king safety.
3. Explain negamax as a compact form of Minimax; alpha-beta avoids branches that cannot change the decision.
4. Compare difficulty levels and show the API's completed depth, visited nodes and elapsed time.
5. Demonstrate the same engine through the 3D interface, then use a hint and explain that it is a depth-limited suggestion, not a mathematical proof of the best move.
6. Show the regression tests and a special move, then export the game.

See [RESEARCH.md](RESEARCH.md) for sources, skill selection and the initial analysis. Existing design-system files and deployment work were preserved. Another development tool committed changes during this session; no Git commits, resets or pushes were made by this implementation workflow, and no Antigravity/Gemini process was operated.
