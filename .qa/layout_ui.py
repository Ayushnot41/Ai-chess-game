from pathlib import Path
import re
root = Path(__file__).resolve().parent.parent
path = root / 'frontend/index.html'
s = path.read_text(encoding='utf-8')
s = s.replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="css/style.css">\n    <link rel="stylesheet" href="css/play.css">')
s = s.replace('IIT-Engineered 3D Chess Platform &amp; Minimax Predictor', 'A little curiosity. A better next move.')
s = s.replace('IIT-Engineered 3D Chess Platform & Minimax Predictor', 'A little curiosity. A better next move.')
s = s.replace('<body>', '<body class="simple-play">')
s = re.sub(r'(<option value="1")[^>]*>[^<]+', r'\1 selected>Beginner · depth 1', s)
s = re.sub(r'(<option value="2")[^>]*>[^<]+', r'\1>Casual · depth 2', s)
s = re.sub(r'(<option value="4")[^>]*>[^<]+', r'\1>Challenging · depth 4', s)
s = re.sub(r'(<option value="5")[^>]*>[^<]+', r'\1>Expert · depth 5', s)
s = s.replace('title="AI Search Depth"', 'title="AI Search Depth" aria-label="Difficulty"')
s = s.replace('title="Board 3D Theme"', 'title="Board 3D Theme" aria-label="Board theme"')
s = re.sub(r'(<button id="btn-kid-mode"[^>]*>).*?(</button>)', r'\1Simple play\2', s)
s = re.sub(r'(<button id="btn-auto-move"[^>]*>).*?(</button>)', r'\1Help me move\2', s)
s = re.sub(r'(<button id="btn-hint"[^>]*>).*?(</button>)', r'\1Hint\2', s)
s = re.sub(r'(<button id="btn-undo"[^>]*>).*?(</button>)', r'\1Undo\2', s)
s = re.sub(r'(<button id="btn-heatmap"[^>]*>).*?(</button>)', r'\1Heatmap\2', s)
s = s.replace('New Match</button>', 'New game</button>').replace('Launch Match</button>', 'Start playing</button>')
s = s.replace('AI Move Predictor</div>', 'Your chess coach</div>')
s = s.replace('Configure your side and match parameters against the Minimax AI.', 'Choose your pieces. Starting a new game replaces the saved game on this device.')
s = s.replace('<div id="turn-banner" class="turn-banner player-turn">', '<div id="turn-banner" class="turn-banner player-turn" role="status" aria-live="polite">')
s = re.sub(r'<span id="turn-banner-icon">.*?</span>\s*<span id="turn-banner-text">.*?</span>', '''<div class="turn-copy"><strong id="turn-title">Your turn</strong><span id="player-side-label">You play white</span></div>
                    <p id="play-instruction">Choose one of your pieces, then a highlighted square.</p>''', s)
s = s.replace('<div id="board-canvas-container"></div>', '<div id="board-canvas-container" role="img" aria-label="Interactive 3D chessboard. Select a piece then a highlighted square, or use the keyboard move field below."></div>')
s = s.replace('<button id="btn-auto-move"', '<button id="btn-retry-ai" class="btn-primary" hidden>Retry AI</button>\n                <button id="btn-auto-move"')
s = s.replace('        <!-- Right Column: AI Analysis', '''        <!-- Right Column: AI Analysis''')
s = s.replace('<aside class="analytics-sidebar">', '''<aside class="analytics-sidebar" aria-label="Chess coach and move history">
            <div id="game-error" role="alert" hidden></div>
            <section class="move-entry">
                <h2>Make your move</h2>
                <p>Tap a piece on the board, or type a move.</p>
                <form id="move-form">
                    <label for="move-input">Keyboard move</label>
                    <div class="move-input-row"><input id="move-input" class="input-text" placeholder="e4 or g1f3" autocomplete="off" maxlength="12" spellcheck="false"><button id="submit-move" class="btn-primary" type="submit">Play</button></div>
                    <details class="promotion-options"><summary>Pawn promotion</summary><label for="promotion-piece">When a pawn reaches the last row</label><select id="promotion-piece" class="select-input"><option value="q">Queen (recommended)</option><option value="n">Knight</option><option value="r">Rook</option><option value="b">Bishop</option></select></details>
                </form>
                <details class="how-to-play"><summary>How to play</summary><p>You play the light pieces first. Select a piece, then a highlighted square. Keep your king safe. Win by trapping the other king: checkmate.</p><p>Stuck? Try Hint. Undo lets you try another idea. Drag the board to look around; choose 2D Tactical for a view from above.</p></details>
            </section>''')
s = s.replace('        </aside>\n    </main>', '''            <div class="save-controls"><span id="save-status">Your game saves on this device</span><button id="btn-export" class="btn-secondary">Export PGN</button></div>
        </aside>
    </main>''')
s = s.replace('<div id="modal-new-game" class="modal-overlay hidden">', '<div id="modal-new-game" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-label="Start a new game">')
s = s.replace('<div id="modal-fen" class="modal-overlay hidden">', '<div id="modal-fen" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-label="Load chess position">')
s = s.replace('<div id="modal-game-over" class="modal-overlay hidden">', '<div id="modal-game-over" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="game-over-title">')
s = s.replace('<label class="form-label">Position FEN</label>', '<label class="form-label" for="input-fen-string">Position FEN</label>')
s = s.replace('<button class="btn-primary" onclick="window.app.startNewGame(\'white\')">Play Again</button>', '<button class="btn-secondary" onclick="window.app.closeModals()">Review game</button><button class="btn-primary" onclick="window.app.startNewGame(\'white\')">Play again</button>')
path.write_text(s, encoding='utf-8')
print('Updated game markup; retained existing theme, camera and board controls')
