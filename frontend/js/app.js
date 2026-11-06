/**
 * Grandmaster-AI Master Application Coordinator
 * Handles user interactions, game state, chess.js synchronization, and AI triggers.
 */

class ChessApp {
    constructor() {
        this.board3D = null;
        this.chess = null;
        this.playerColor = 'white';
        this.aiDepth = 1;
        this.isAiThinking = false;
        this.selectedSquare = null;
        this.history = [];
        this.heatmapVisible = false;
        this.kidMode = true;
        this.confettiParticles = [];

        this.revision = 0;
        this.isAnimating = false;
        this.coachBusy = false;
        this.cachedPrediction = null;
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.init();
    }

    init() {
        this.chess = new Chess();
        this.initialFen = this.chess.fen();
        this.board3D = new Board3D('board-canvas-container', {
            theme: 'wood', playerColor: this.playerColor,
            onSquareClick: square => this.handleSquareClick(square)
        });
        this.initConfetti();
        this.bindEvents();
        this.bindExperience();
        this.fullscreen = new BoardFullscreen(this);
        this.account = new ChessAccount(this);
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
    }

    bindEvents() {
        // Game Controls
        document.getElementById('btn-new-game').addEventListener('click', () => this.showNewGameModal());
        document.getElementById('btn-hint').addEventListener('click', () => this.provideHint());
        document.getElementById('btn-undo').addEventListener('click', () => this.undoMove());
        document.getElementById('btn-heatmap').addEventListener('click', () => this.toggleHeatmap());
        document.getElementById('btn-sound').addEventListener('click', () => this.toggleSound());

        // Kid Friendly & Auto-Play Controls
        const btnKidMode = document.getElementById('btn-kid-mode');
        if (btnKidMode) {
            btnKidMode.addEventListener('click', () => this.toggleKidMode());
        }

        const btnAutoMove = document.getElementById('btn-auto-move');
        if (btnAutoMove) {
            btnAutoMove.addEventListener('click', () => this.playBestMoveForPlayer());
        }

        // Camera Views
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.board3D.resetCameraView(btn.dataset.view);
            });
        });

        // Theme Selector
        document.getElementById('select-theme').addEventListener('change', (e) => {
            this.board3D.setTheme(e.target.value);
        });

        // Difficulty Selector
        document.getElementById('select-difficulty').addEventListener('change', (e) => {
            this.aiDepth = parseInt(e.target.value, 10);
        });

        // New Game Modal Form
        document.getElementById('modal-start-game').addEventListener('click', () => {
            const side = document.querySelector('input[name="player-side"]:checked').value;
            this.startNewGame(side);
        });

        // FEN Modal
        document.getElementById('btn-fen').addEventListener('click', () => this.showFenModal());
        document.getElementById('modal-apply-fen').addEventListener('click', () => this.applyFenFromModal());
    }

    startNewGame(side = 'white') {
        this.invalidatePosition();
        this.playerColor = side;
        this.board3D.playerColor = side;
        this.chess.reset();
        this.initialFen = this.chess.fen();
        this.history = [];
        this.board3D.loadFEN(this.chess.fen());
        this.board3D.resetCameraView(side);
        this.closeModals();
        this.setAiStatus(false, 'Ready for a new game.');
        this.refreshPosition();
        this.saveGame();
        if (side === 'black') this.triggerAIMove();
        else this.requestPredictions();
    }

    handleSquareClick(square) {
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
    }

    async onMoveExecuted(move) {
        this.refreshPosition();
        this.saveGame();
        if (this.chess.in_check()) window.soundEngine?.playCheck();
        if (this.checkGameOver()) return;
        if (!this.isPlayerTurn()) await this.triggerAIMove();
        else this.requestPredictions();
    }

    async triggerAIMove() {
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
    }

    async updateTelemetry() {
        const token = this.positionToken();
        const evalData = await window.chessAPI.evaluate(token.fen);
        if (!evalData || !this.isCurrent(token)) return;

        // 1. Evaluation Bar
        const evalCp = evalData.evaluation_cp;
        const clamped = Math.max(-1000, Math.min(1000, evalCp));
        const whitePct = Math.round(((clamped + 1000) / 2000) * 100);

        const evalFill = document.getElementById('eval-bar-fill');
        const evalText = document.getElementById('eval-text');
        const winProbText = document.getElementById('win-probability-badge');

        if (evalFill) evalFill.style.height = `${whitePct}%`;
        if (evalText) {
            const sign = evalCp > 0 ? '+' : '';
            evalText.innerText = `${sign}${(evalCp / 100).toFixed(2)}`;
        }
        if (winProbText) {
            winProbText.innerText = `Estimated advantage: ${evalData.win_probability.white}% White`;
        }

        // 2. Material Tray Breakdown
        this.renderCapturedMaterial(evalData.material);

        // 3. Update Heatmap if active
        if (this.heatmapVisible) {
            const hm = await window.chessAPI.getHeatmap(this.chess.fen());
            if (hm && this.isCurrent(token) && this.heatmapVisible) this.board3D.renderHeatmap(hm.heatmap);
        }
    }

    async requestPredictions() {
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
            : best.explanation.replace(/\*\*/g, '');
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
    }

    async provideHint() {
        if (this.isBusy() || !this.isPlayerTurn() || this.chess.game_over()) return;
        const token = this.positionToken();
        const pred = this.cachedPrediction?.fen === token.fen ? this.cachedPrediction.data : await this.requestPredictions();
        if (!this.isCurrent(token) || !pred?.candidates?.length) return;
        const best = pred.candidates[0];
        this.board3D.showPredictedMoveArrow(best.from_square, best.to_square);
        document.getElementById('play-instruction').textContent = `Move your ${best.piece} from ${best.from_square.toUpperCase()} to ${best.to_square.toUpperCase()}.`;
    }

    undoMove() {
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
    }

    async toggleHeatmap() {
        this.heatmapVisible = !this.heatmapVisible;
        document.getElementById('btn-heatmap').setAttribute('aria-pressed', this.heatmapVisible);
        document.getElementById('btn-heatmap').classList.toggle('active', this.heatmapVisible);
        if (!this.heatmapVisible) { this.board3D.clearHeatmap(); return; }
        const token = this.positionToken();
        const data = await window.chessAPI.getHeatmap(token.fen);
        if (data && this.isCurrent(token) && this.heatmapVisible) this.board3D.renderHeatmap(data.heatmap);
    }

    toggleSound() {
        const isEnabled = window.soundEngine.toggle();
        const btn = document.getElementById('btn-sound');
        btn.innerText = isEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
    }

    toggleKidMode() {
        this.kidMode = !this.kidMode;
        this.syncMode();
        this.saveGame();
        this.requestPredictions();
    }

    async playBestMoveForPlayer() {
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
    }

    initConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        const ctx = canvas.getContext('2d');
        const loop = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
                const p = this.confettiParticles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.15; // Gravity
                p.rotation += p.vRot;
                p.life -= 0.012;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
                ctx.restore();

                if (p.life <= 0) {
                    this.confettiParticles.splice(i, 1);
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    triggerConfetti() {
        if (this.reducedMotion) return;
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#38bdf8'];
        const startX = window.innerWidth / 2;
        const startY = window.innerHeight * 0.45;

        for (let i = 0; i < 70; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 3;
            this.confettiParticles.push({
                x: startX,
                y: startY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 4,
                rotation: Math.random() * Math.PI,
                vRot: (Math.random() - 0.5) * 0.2,
                size: Math.random() * 8 + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0
            });
        }
    }

    renderMoveHistory() {
        const listContainer = document.getElementById('moves-history-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        if (!this.history.length) {
            listContainer.textContent = 'Your story starts with the first move.';
            return;
        }

        const fields = this.initialFen.split(' ');
        const startNumber = Number(fields[5]);
        const offset = fields[1] === 'b' ? 1 : 0;
        for (let ply = 0; ply < this.history.length + offset; ply += 2) {
            const row = document.createElement('div'); row.className = 'history-row';
            const values = [`${startNumber + ply / 2}.`, this.history[ply-offset]?.san || '…', this.history[ply+1-offset]?.san || ''];
            values.forEach((value, index) => {
                const cell = document.createElement('span'); cell.className = index ? 'h-move' : 'h-num';
                cell.textContent = value; row.append(cell);
            });
            listContainer.append(row);
        }
        listContainer.scrollTop = listContainer.scrollHeight;
    }

    renderCapturedMaterial(mat) {
        if (!mat) return;
        const wTray = document.getElementById('captured-white-tray');
        const bTray = document.getElementById('captured-black-tray');

        const icons = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛' };
        const initial = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };

        // Captured White pieces = Initial - current
        let capturedWhiteStr = '';
        let capturedBlackStr = '';

        for (let p = 1; p <= 5; p++) {
            const wRemaining = mat.counts.white[p] || 0;
            const bRemaining = mat.counts.black[p] || 0;
            const wCaptured = Math.max(0, initial[p] - wRemaining);
            const bCaptured = Math.max(0, initial[p] - bRemaining);
            capturedWhiteStr += icons[p].repeat(wCaptured);
            capturedBlackStr += icons[p].repeat(bCaptured);
        }

        if (wTray) wTray.innerText = capturedWhiteStr || '—';
        if (bTray) bTray.innerText = capturedBlackStr || '—';

        const advBadge = document.getElementById('material-advantage-badge');
        if (advBadge) {
            if (mat.advantage === 'equal') {
                advBadge.innerText = 'Equal Material';
                advBadge.style.color = '#94a3b8';
            } else {
                advBadge.innerText = `+${mat.differential} ${mat.advantage.toUpperCase()}`;
                advBadge.style.color = mat.advantage === 'white' ? '#10b981' : '#f59e0b';
            }
        }
    }

    findKingSquare(turnColor) {
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const sq = String.fromCharCode(97 + f) + (r + 1);
                const p = this.chess.get(sq);
                if (p && p.type === 'k' && p.color === turnColor) {
                    return sq;
                }
            }
        }
        return null;
    }

    checkGameOver() {
        if (this.chess.game_over()) {
            let title = "Game Over";
            let msg = "";

            if (this.chess.in_checkmate()) {
                const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
                title = `Checkmate! ${winner} Wins!`;
                msg = `Decisive victory achieved through forced tactical sequence.`;
                window.soundEngine.playVictory();
            } else if (this.chess.in_stalemate()) {
                title = "Draw by Stalemate";
                msg = "No legal moves remain, yet King is not in check.";
            } else if (this.chess.in_threefold_repetition()) {
                title = "Draw by Threefold Repetition";
                msg = "Identical board state repeated three times.";
            } else if (this.chess.insufficient_material()) {
                title = "Draw by Insufficient Material";
                msg = "Neither side has sufficient pieces to deliver checkmate.";
            }

            this.showGameOverModal(title, msg);
            return true;
        }
        return false;
    }

    setAiStatus(thinking, message) {
        document.getElementById('ai-status-dot').className = thinking ? 'status-dot pulse-amber' : 'status-dot emerald';
        document.getElementById('ai-status-text').textContent = message;
        document.getElementById('turn-banner')?.classList.toggle('ai-turn', thinking);
    }

    showNewGameModal() {
        this.openModal('modal-new-game');
    }

    showFenModal() {
        document.getElementById('input-fen-string').value = this.chess.fen();
        this.openModal('modal-fen');
    }

    async applyFenFromModal() {
        const fen = document.getElementById('input-fen-string').value.trim();
        const token = this.positionToken();
        const candidate = new Chess();
        const errorBox = document.getElementById('fen-error');
        errorBox.textContent = '';
        if (!candidate.load(fen)) { errorBox.textContent = 'That position is not valid. Check the FEN and try again.'; return; }
        const response = await window.chessAPI.request('evaluate', {fen:candidate.fen(), initial_fen:candidate.fen(), moves:[]}, 'position');
        if (!response) { errorBox.textContent = 'The position could not be loaded. Check that both kings are present and the engine is running.'; return; }
        if (!this.isCurrent(token)) return;
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
    }

    showGameOverModal(title, message) {
        document.getElementById('game-over-title').textContent = title;
        document.getElementById('game-over-desc').textContent = message || 'Draw: no pawn has moved and no piece has been captured for 50 moves.';
        this.openModal('modal-game-over');
    }

    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
        document.querySelector('.app-header').inert = false;
        document.querySelector('.main-viewport').inert = false;
        this.modalReturnFocus?.focus();
    }


    positionToken() { return {revision:this.revision, fen:this.chess.fen()}; }
    isCurrent(token) { return token.revision === this.revision && token.fen === this.chess.fen(); }
    isPlayerTurn() { return this.chess.turn() === (this.playerColor === 'white' ? 'w' : 'b'); }
    isBusy() { return this.isAiThinking || this.isAnimating || this.coachBusy; }
    invalidatePosition() {
        this.revision++;
        window.chessAPI.cancelAll();
        this.isAiThinking = false; this.isAnimating = false; this.coachBusy = false;
        this.selectedSquare = null; this.cachedPrediction = null;
        document.getElementById('hud-best-move').textContent = '—';
        document.getElementById('hud-commentary').textContent = 'Choose a piece to begin. Your coach is preparing a suggestion.';
        document.getElementById('hud-candidates-list').replaceChildren();
        document.getElementById('hud-motifs').replaceChildren();
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
        if (this.kidMode && this.heatmapVisible) {
            this.heatmapVisible = false; this.board3D.clearHeatmap();
            document.getElementById('btn-heatmap').classList.remove('active');
            document.getElementById('btn-heatmap').setAttribute('aria-pressed', 'false');
        }
        requestAnimationFrame(() => this.board3D.onWindowResize());
    }
    showError(message) {
        const box = document.getElementById('game-error'); box.textContent = message; box.hidden = false;
        const arena = document.getElementById('arena-error'); arena.textContent = message; arena.hidden = false;
    }
    clearError() {
        document.getElementById('game-error').hidden = true;
        document.getElementById('arena-error').hidden = true;
    }
    serializeGame() {
        return {version:1,initialFen:this.initialFen,
            moves:this.chess.history({verbose:true}).map(move => move.from+move.to+(move.promotion||'')),
            playerColor:this.playerColor,aiDepth:this.aiDepth,kidMode:this.kidMode,theme:this.board3D.theme};
    }
    loadAccountGame(saved) {
        const candidate = new Chess();
        if (!candidate.load(saved.initialFen)) throw new Error('The saved position is invalid.');
        for (const uci of saved.moves) {
            if (!candidate.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'})) throw new Error('The saved game contains an invalid move.');
        }
        this.invalidatePosition(); this.chess=candidate; this.initialFen=saved.initialFen;
        this.playerColor=saved.playerColor; this.aiDepth=saved.aiDepth; this.kidMode=saved.kidMode;
        this.history=candidate.history({verbose:true}); this.board3D.playerColor=this.playerColor;
        this.board3D.loadFEN(candidate.fen()); this.board3D.setTheme(saved.theme);
        this.board3D.resetCameraView(this.playerColor);
        document.getElementById('select-theme').value=saved.theme;
        this.syncMode(); this.refreshPosition(); this.saveGame(); this.closeModals();
        if (!this.checkGameOver()) {
            if (this.isPlayerTurn()) this.requestPredictions(); else this.triggerAIMove();
        }
    }
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
            this.aiDepth = [1,2,3,4,5].includes(saved.aiDepth) ? saved.aiDepth : 1;
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
    async openModal(id) {
        if (this.fullscreen?.active) await this.fullscreen.exit();
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
                const controls = [...modal.querySelectorAll('input, button')].filter(el => !el.disabled && el.getClientRects().length > 0);
                const first = controls[0], last = controls[controls.length-1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    try { window.app = new ChessApp(); }
    catch (error) {
        console.error(error);
        const box = document.getElementById('game-error');
        box.textContent = 'The 3D board could not start. Enable WebGL and reload, or use run_cli.bat for the text game.';
        box.hidden = false;
    }
});
