from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent

api = r'''/** Same-origin requests with cancellation, deadlines and replayable history. */
class ChessAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.pending = new Map();
        this.historyProvider = null;
        this.onError = null;
    }
    cancelAll() {
        this.pending.forEach(controller => controller.abort());
        this.pending.clear();
    }
    async request(endpoint, payload, channel = endpoint) {
        this.pending.get(channel)?.abort();
        const controller = new AbortController();
        this.pending.set(channel, controller);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        try {
            const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, ...(this.historyProvider?.(payload.fen) || {}) }),
                signal: controller.signal
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status}). Please retry.`);
            }
            return await response.json();
        } catch (error) {
            if (error.name !== 'AbortError' || timedOut) this.onError?.(timedOut
                ? 'The engine took too long. Try again or choose an easier level.'
                : error.message === 'Failed to fetch' ? 'Cannot reach the engine. Check the server, then retry.' : error.message);
            return null;
        } finally {
            clearTimeout(timer);
            if (this.pending.get(channel) === controller) this.pending.delete(channel);
        }
    }
    evaluate(fen) { return this.request('evaluate', { fen }); }
    getAIMove(fen, depth = 2, timeLimit = 3) { return this.request('move', { fen, depth, time_limit: timeLimit }); }
    predict(fen, topK = 3, depth = 3, channel = 'predict') { return this.request('predict', { fen, top_k: topK, depth }, channel); }
    getHeatmap(fen) { return this.request('heatmap', { fen }); }
    validateMove(fen, moveUci) { return this.request('validate', { fen, move_uci: moveUci }); }
}
window.chessAPI = new ChessAPI();
'''
(root / 'frontend/js/api.js').write_text(api, encoding='utf-8')

path = root / 'frontend/js/app.js'
s = path.read_text(encoding='utf-8')
def method(name, body):
    global s
    pattern = rf'    (?:async )?{name}\([^\n]*\) \{{.*?(?=\n    (?:async )?\w+\([^\n]*\) \{{|\n\}}\n)'
    s, count = re.subn(pattern, lambda _: body.rstrip() + '\n', s, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Method not found: {name}')

s = s.replace('this.aiDepth = 4;', 'this.aiDepth = 1;')
s = s.replace('        this.init();', '''        this.revision = 0;
        this.isAnimating = false;
        this.coachBusy = false;
        this.cachedPrediction = null;
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.init();''', 1)
method('init', '''    init() {
        this.chess = new Chess();
        this.initialFen = this.chess.fen();
        this.board3D = new Board3D('board-canvas-container', {
            theme: 'wood', playerColor: this.playerColor,
            onSquareClick: square => this.handleSquareClick(square)
        });
        this.initConfetti();
        this.bindEvents();
        this.bindExperience();
        window.chessAPI.historyProvider = fen => fen === this.chess.fen() ? {
            initial_fen: this.initialFen,
            moves: this.chess.history({verbose:true}).map(m => m.from + m.to + (m.promotion || ''))
        } : {};
        window.chessAPI.onError = message => this.showError(message);
        this.restoreGame();
        this.board3D.playerColor = this.playerColor;
        this.board3D.loadFEN(this.chess.fen());
        this.board3D.resetCameraView(this.playerColor);
        this.syncMode();
        this.refreshPosition();
        if (!this.isPlayerTurn() && !this.chess.game_over()) this.triggerAIMove();
        else this.requestPredictions();
    }''')
method('startNewGame', '''    startNewGame(side = 'white') {
        this.invalidatePosition();
        this.playerColor = side;
        this.board3D.playerColor = side;
        this.chess.reset();
        this.initialFen = this.chess.fen();
        this.history = [];
        this.board3D.loadFEN(this.chess.fen());
        this.board3D.resetCameraView(side);
        this.closeModals();
        this.refreshPosition();
        this.saveGame();
        if (side === 'black') this.triggerAIMove();
        else this.requestPredictions();
    }''')
method('handleSquareClick', '''    handleSquareClick(square) {
        if (this.isBusy() || !this.isPlayerTurn() || this.chess.game_over()) return;
        const piece = this.chess.get(square);
        if (square === this.selectedSquare) {
            this.selectedSquare = null;
            this.board3D.clearIndicators();
            this.updatePlayStatus();
            return;
        }
        if (this.selectedSquare) {
            const move = this.chess.move({from:this.selectedSquare, to:square,
                promotion:document.getElementById('promotion-piece').value});
            if (move) { this.finishPlayerMove(move); return; }
        }
        if (piece && piece.color === this.chess.turn()) {
            this.selectedSquare = square;
            const moves = this.chess.moves({square, verbose:true});
            this.board3D.showMoveIndicators(moves.map(move => move.to));
            document.getElementById('play-instruction').textContent = moves.length
                ? `${square.toUpperCase()} selected. Choose a highlighted square.`
                : 'That piece cannot move yet. Choose another piece.';
        } else {
            this.selectedSquare = null;
            this.board3D.clearIndicators();
            this.updatePlayStatus();
        }
    }''')
method('onMoveExecuted', '''    async onMoveExecuted(move) {
        this.refreshPosition();
        this.saveGame();
        if (this.checkGameOver()) return;
        if (!this.isPlayerTurn()) await this.triggerAIMove();
        else this.requestPredictions();
    }''')
method('triggerAIMove', '''    async triggerAIMove() {
        if (this.isAiThinking || this.isPlayerTurn() || this.chess.game_over()) return;
        const token = this.positionToken();
        this.isAiThinking = true;
        this.clearError();
        this.updatePlayStatus();
        this.setAiStatus(true, 'Your opponent is thinking…');
        const response = await window.chessAPI.getAIMove(token.fen, this.aiDepth, 3);
        if (!this.isCurrent(token)) return;
        if (!response?.best_move_uci) {
            this.isAiThinking = false;
            this.updatePlayStatus();
            this.showError('The AI could not finish its move. Choose Retry AI to continue.');
            return;
        }
        const uci = response.best_move_uci;
        const move = this.chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4] || 'q'});
        if (!move) {
            this.isAiThinking = false;
            this.updatePlayStatus();
            this.showError('The engine returned a move that does not fit this board. Please retry.');
            return;
        }
        this.recordMove(move);
        this.animateLegalMove(move, () => {
            this.isAiThinking = false;
            this.setAiStatus(false, `AI played ${move.san}. Your turn.`);
            this.onMoveExecuted(move);
        });
    }''')
# Preserve telemetry rendering while rejecting stale responses.
s = s.replace('const evalData = await window.chessAPI.evaluate(this.chess.fen());\n        if (!evalData) return;',
'''const token = this.positionToken();
        const evalData = await window.chessAPI.evaluate(token.fen);
        if (!evalData || !this.isCurrent(token)) return;''')
s = s.replace('if (hm) this.board3D.renderHeatmap(hm.heatmap);', 'if (hm && this.isCurrent(token) && this.heatmapVisible) this.board3D.renderHeatmap(hm.heatmap);')
s = s.replace('`${evalData.win_probability.white}% White / ${evalData.win_probability.black}% Black`', '`Estimated advantage: ${evalData.win_probability.white}% White`')
method('requestPredictions', '''    async requestPredictions() {
        if (!this.isPlayerTurn() || this.chess.game_over()) return null;
        const token = this.positionToken();
        const pred = await window.chessAPI.predict(token.fen, 3, 3);
        if (!pred || !this.isCurrent(token) || !pred.candidates?.length) return null;
        this.cachedPrediction = {fen:token.fen, data:pred};
        const best = pred.candidates[0];
        document.getElementById('hud-best-move').textContent = best.move_san;
        const motifs = document.getElementById('hud-motifs');
        motifs.replaceChildren();
        best.motifs.slice(0,2).forEach(text => {
            const tag = document.createElement('span');
            tag.className = 'motif-tag'; tag.textContent = text; motifs.append(tag);
        });
        document.getElementById('hud-commentary').textContent = this.kidMode
            ? `Try moving your ${best.piece} from ${best.from_square.toUpperCase()} to ${best.to_square.toUpperCase()}. Hint will show you where.`
            : best.explanation.replace(/\\*\\*/g, '');
        const list = document.getElementById('hud-candidates-list');
        list.replaceChildren();
        pred.candidates.forEach((candidate, i) => {
            const row = document.createElement('div'); row.className = 'candidate-row';
            [String(i+1), candidate.move_san, candidate.classification, (candidate.eval_white/100).toFixed(2)].forEach((text,j) => {
                const cell = document.createElement('span');
                cell.className = ['c-rank','c-move','c-class','c-eval'][j]; cell.textContent = text; row.append(cell);
            });
            list.append(row);
        });
        return pred;
    }''')
method('provideHint', '''    async provideHint() {
        if (this.isBusy() || !this.isPlayerTurn() || this.chess.game_over()) return;
        const token = this.positionToken();
        const pred = this.cachedPrediction?.fen === token.fen ? this.cachedPrediction.data : await this.requestPredictions();
        if (!this.isCurrent(token) || !pred?.candidates?.length) return;
        const best = pred.candidates[0];
        this.board3D.showPredictedMoveArrow(best.from_square, best.to_square);
        document.getElementById('play-instruction').textContent = `Move your ${best.piece} from ${best.from_square.toUpperCase()} to ${best.to_square.toUpperCase()}.`;
    }''')
method('undoMove', '''    undoMove() {
        if (this.isBusy() || !this.chess.history().length) return;
        if (this.playerColor === 'black' && this.chess.history().length === 1) return;
        this.invalidatePosition();
        this.chess.undo();
        if (!this.isPlayerTurn() && this.chess.history().length) this.chess.undo();
        this.history = this.chess.history({verbose:true});
        this.board3D.loadFEN(this.chess.fen());
        this.closeModals();
        this.refreshPosition();
        this.saveGame();
        this.requestPredictions();
    }''')
method('toggleHeatmap', '''    async toggleHeatmap() {
        this.heatmapVisible = !this.heatmapVisible;
        document.getElementById('btn-heatmap').setAttribute('aria-pressed', this.heatmapVisible);
        document.getElementById('btn-heatmap').classList.toggle('active', this.heatmapVisible);
        if (!this.heatmapVisible) { this.board3D.clearHeatmap(); return; }
        const token = this.positionToken();
        const data = await window.chessAPI.getHeatmap(token.fen);
        if (data && this.isCurrent(token) && this.heatmapVisible) this.board3D.renderHeatmap(data.heatmap);
    }''')
method('toggleKidMode', '''    toggleKidMode() {
        this.kidMode = !this.kidMode;
        this.syncMode();
        this.saveGame();
        this.requestPredictions();
    }''')
method('playBestMoveForPlayer', '''    async playBestMoveForPlayer() {
        if (this.isBusy() || !this.isPlayerTurn() || this.chess.game_over()) return;
        const token = this.positionToken();
        this.coachBusy = true; this.updatePlayStatus();
        const pred = this.cachedPrediction?.fen === token.fen ? this.cachedPrediction.data
            : await window.chessAPI.predict(token.fen, 1, 3, 'coach');
        if (!this.isCurrent(token)) return;
        this.coachBusy = false;
        if (!pred?.candidates?.length) { this.updatePlayStatus(); return; }
        const uci = pred.candidates[0].move_uci;
        const move = this.chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4] || 'q'});
        if (move) this.finishPlayerMove(move);
        else this.updatePlayStatus();
    }''')
s = s.replace("        const colors = ['#f59e0b'", "        if (this.reducedMotion) return;\n        const colors = ['#f59e0b'",1)
s = s.replace('        listContainer.innerHTML = \'\';\n\n        for (let i', '''        listContainer.innerHTML = '';
        if (!this.history.length) {
            listContainer.textContent = 'Your story starts with the first move.';
            return;
        }

        for (let i''',1)
method('showNewGameModal', '''    showNewGameModal() {
        this.openModal('modal-new-game');
    }''')
method('showFenModal', '''    showFenModal() {
        document.getElementById('input-fen-string').value = this.chess.fen();
        this.openModal('modal-fen');
    }''')
method('applyFenFromModal', '''    async applyFenFromModal() {
        const fen = document.getElementById('input-fen-string').value.trim();
        const token = this.positionToken();
        const candidate = new Chess();
        if (!candidate.load(fen)) { this.showError('That position is not valid. Check the FEN and try again.'); return; }
        const response = await window.chessAPI.request('evaluate', {fen:candidate.fen(), initial_fen:candidate.fen(), moves:[]}, 'position');
        if (!response || !this.isCurrent(token)) return;
        this.invalidatePosition();
        this.chess = candidate;
        this.initialFen = this.chess.fen();
        this.history = [];
        this.board3D.loadFEN(this.chess.fen());
        this.closeModals();
        this.refreshPosition(); this.saveGame();
        if (this.checkGameOver()) return;
        if (!this.isPlayerTurn()) this.triggerAIMove();
        else this.requestPredictions();
    }''')
method('showGameOverModal', '''    showGameOverModal(title, message) {
        document.getElementById('game-over-title').textContent = title;
        document.getElementById('game-over-desc').textContent = message || 'Draw: no pawn has moved and no piece has been captured for 50 moves.';
        this.openModal('modal-game-over');
    }''')
method('closeModals', '''    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
        document.querySelector('.app-header').inert = false;
        document.querySelector('.main-viewport').inert = false;
        this.modalReturnFocus?.focus();
    }''')
extra = r'''
    positionToken() { return {revision:this.revision, fen:this.chess.fen()}; }
    isCurrent(token) { return token.revision === this.revision && token.fen === this.chess.fen(); }
    isPlayerTurn() { return this.chess.turn() === (this.playerColor === 'white' ? 'w' : 'b'); }
    isBusy() { return this.isAiThinking || this.isAnimating || this.coachBusy; }
    invalidatePosition() {
        this.revision++;
        window.chessAPI.cancelAll();
        this.isAiThinking = false; this.isAnimating = false; this.coachBusy = false;
        this.selectedSquare = null; this.cachedPrediction = null;
        this.clearError();
    }
    recordMove(move) {
        this.history.push({san:move.san, from:move.from, to:move.to, fen:this.chess.fen()});
        this.selectedSquare = null; this.cachedPrediction = null;
        this.board3D.clearIndicators(); this.board3D.clearPredictedArrow();
    }
    finishPlayerMove(move) {
        this.clearError(); this.recordMove(move); this.saveGame();
        if (this.kidMode && move.captured) this.triggerConfetti();
        this.animateLegalMove(move, () => this.onMoveExecuted(move));
    }
    animateLegalMove(move, done) {
        const token = this.positionToken();
        this.isAnimating = true; this.updatePlayStatus();
        this.board3D.animateMove(move.from, move.to, move.promotion, () => {
            if (!this.isCurrent(token)) return;
            // Reconcile special moves (castling rook, en passant pawn, promotion).
            this.board3D.loadFEN(this.chess.fen());
            this.board3D.highlightMove(move.from, move.to);
            this.isAnimating = false; done();
        });
    }
    refreshPosition() {
        this.updateTelemetry(); this.renderMoveHistory(); this.updatePlayStatus();
        this.board3D.clearKingCheck();
        if (this.chess.in_check()) this.board3D.setKingCheckHighlight(this.findKingSquare(this.chess.turn()), true);
        if (this.chess.game_over()) {
            document.getElementById('hud-best-move').textContent = '—';
            document.getElementById('hud-commentary').textContent = 'Game complete. Review your moves or start another match.';
            document.getElementById('hud-candidates-list').replaceChildren();
        }
    }
    updatePlayStatus() {
        const ended = this.chess.game_over();
        const player = this.isPlayerTurn();
        document.getElementById('turn-title').textContent = ended ? 'Game complete' : this.coachBusy ? 'Finding your move…' : player ? 'Your turn' : 'AI to move';
        document.getElementById('player-side-label').textContent = `You play ${this.playerColor}`;
        document.getElementById('play-instruction').textContent = ended ? 'Review the game, undo a move, or play again.'
            : this.chess.in_check() && player ? 'Your king is in check. Choose a move that keeps it safe.'
            : player ? 'Choose one of your pieces, then a highlighted square.'
            : this.isAiThinking ? 'The AI is thinking. Your pieces will be ready soon.' : 'Choose Retry AI to continue.';
        ['btn-hint','btn-auto-move','submit-move','move-input','promotion-piece'].forEach(id => document.getElementById(id).disabled = this.isBusy() || !player || ended);
        document.getElementById('btn-undo').disabled = this.isBusy() || !this.history.length || (this.playerColor === 'black' && this.history.length === 1);
        document.getElementById('btn-retry-ai').hidden = player || ended || this.isBusy();
        document.getElementById('select-difficulty').value = String(this.aiDepth);
        document.getElementById('board-canvas-container').setAttribute('aria-busy', String(this.isBusy()));
    }
    syncMode() {
        document.body.classList.toggle('simple-play', this.kidMode);
        const button = document.getElementById('btn-kid-mode');
        button.textContent = this.kidMode ? 'Simple play' : 'Analysis mode';
        button.setAttribute('aria-pressed', String(this.kidMode));
        requestAnimationFrame(() => this.board3D.onWindowResize());
    }
    showError(message) {
        const box = document.getElementById('game-error'); box.textContent = message; box.hidden = false;
    }
    clearError() { document.getElementById('game-error').hidden = true; }
    saveGame() {
        try {
            localStorage.setItem('grandmaster-save-v1', JSON.stringify({version:1, initialFen:this.initialFen,
                moves:this.chess.history({verbose:true}).map(m => m.from + m.to + (m.promotion || '')),
                playerColor:this.playerColor, aiDepth:this.aiDepth, kidMode:this.kidMode, theme:this.board3D.theme}));
            document.getElementById('save-status').textContent = 'Saved on this device';
        } catch { document.getElementById('save-status').textContent = 'Device storage unavailable — export PGN to keep your game'; }
    }
    restoreGame() {
        try {
            const saved = JSON.parse(localStorage.getItem('grandmaster-save-v1'));
            if (!saved || saved.version !== 1) return;
            const candidate = new Chess();
            if (!candidate.load(saved.initialFen) || !Array.isArray(saved.moves) || saved.moves.length > 1000) throw new Error('Invalid save');
            for (const uci of saved.moves) {
                if (typeof uci !== 'string' || !candidate.move({from:uci.slice(0,2), to:uci.slice(2,4), promotion:uci[4] || 'q'})) throw new Error('Invalid move');
            }
            this.chess = candidate; this.initialFen = saved.initialFen;
            this.history = candidate.history({verbose:true});
            this.playerColor = saved.playerColor === 'black' ? 'black' : 'white';
            this.aiDepth = [1,2,4,5].includes(saved.aiDepth) ? saved.aiDepth : 1;
            this.kidMode = saved.kidMode !== false;
            if (['wood','marble','cyberpunk','gold'].includes(saved.theme)) {
                this.board3D.setTheme(saved.theme); document.getElementById('select-theme').value = saved.theme;
            }
            document.getElementById('save-status').textContent = 'Previous game restored';
        } catch { this.showError('The saved game could not be restored. A fresh board is ready.'); }
    }
    exportPGN() {
        const copy = new Chess(); copy.load_pgn(this.chess.pgn());
        copy.header('Event', 'Grandmaster-AI practice', 'White', this.playerColor === 'white' ? 'Player' : 'AI',
            'Black', this.playerColor === 'black' ? 'Player' : 'AI',
            'Result', this.chess.in_checkmate() ? (this.chess.turn() === 'w' ? '0-1' : '1-0') : this.chess.in_draw() ? '1/2-1/2' : '*');
        const url = URL.createObjectURL(new Blob([copy.pgn()], {type:'application/x-chess-pgn'}));
        const link = document.createElement('a'); link.href = url; link.download = 'grandmaster-game.pgn'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    openModal(id) {
        this.modalReturnFocus = document.activeElement;
        const modal = document.getElementById(id); modal.classList.remove('hidden');
        document.querySelector('.app-header').inert = true;
        document.querySelector('.main-viewport').inert = true;
        modal.querySelector('input, button')?.focus();
    }
    bindExperience() {
        document.getElementById('move-form').addEventListener('submit', event => {
            event.preventDefault();
            if (this.isBusy() || !this.isPlayerTurn() || this.chess.game_over()) return;
            const input = document.getElementById('move-input');
            const move = this.chess.move(input.value.trim(), {sloppy:true});
            if (!move) { this.showError('That move is not legal. Try e4 or g1f3, or choose Hint.'); return; }
            input.value = ''; this.finishPlayerMove(move);
        });
        document.getElementById('btn-retry-ai').addEventListener('click', () => this.triggerAIMove());
        document.getElementById('btn-export').addEventListener('click', () => this.exportPGN());
        document.getElementById('select-difficulty').addEventListener('change', () => this.saveGame());
        document.getElementById('select-theme').addEventListener('change', () => this.saveGame());
        document.addEventListener('keydown', event => {
            const modal = document.querySelector('.modal-overlay:not(.hidden)');
            if (!modal) return;
            if (event.key === 'Escape') this.closeModals();
            if (event.key === 'Tab') {
                const controls = [...modal.querySelectorAll('input, button')].filter(el => !el.disabled);
                const first = controls[0], last = controls[controls.length-1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }
'''
s = s.replace('\n}\n\n// Instantiate', '\n' + extra + '}\n\n// Instantiate')
s = s.replace('    window.app = new ChessApp();', '''    try { window.app = new ChessApp(); }
    catch (error) {
        console.error(error);
        const box = document.getElementById('game-error');
        box.textContent = 'The 3D board could not start. Enable WebGL and reload, or use run_cli.bat for the text game.';
        box.hidden = false;
    }''')
path.write_text(s, encoding='utf-8')
print('Updated API client and game coordinator')
