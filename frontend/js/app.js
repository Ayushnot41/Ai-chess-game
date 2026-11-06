/**
 * Grandmaster-AI Master Application Coordinator
 * Handles user interactions, game state, chess.js synchronization, and AI triggers.
 */

class ChessApp {
    constructor() {
        this.board3D = null;
        this.chess = null;
        this.playerColor = 'white';
        this.aiDepth = 4;
        this.isAiThinking = false;
        this.selectedSquare = null;
        this.history = [];
        this.heatmapVisible = false;
        this.kidMode = true;
        this.confettiParticles = [];

        this.init();
    }

    init() {
        // Initialize client-side chess rules instance
        this.chess = new Chess();

        // Initialize 3D WebGL Board
        this.board3D = new Board3D('board-canvas-container', {
            theme: 'wood',
            playerColor: this.playerColor,
            onSquareClick: (sq) => this.handleSquareClick(sq)
        });

        // Initialize Confetti Canvas
        this.initConfetti();

        // Bind DOM elements
        this.bindEvents();

        // Load starting position
        this.board3D.loadFEN(this.chess.fen());
        this.updateTelemetry();
        this.requestPredictions();
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
        this.playerColor = side;
        this.board3D.playerColor = side;
        this.chess.reset();
        this.history = [];
        this.selectedSquare = null;
        this.isAiThinking = false;

        this.board3D.loadFEN(this.chess.fen());
        this.board3D.resetCameraView(side === 'black' ? 'black' : 'white');
        this.updateTelemetry();
        this.renderMoveHistory();
        this.closeModals();

        // If playing as Black, trigger AI first move
        if (this.playerColor === 'black') {
            this.triggerAIMove();
        } else {
            this.requestPredictions();
        }
    }

    handleSquareClick(square) {
        if (this.isAiThinking || this.chess.game_over()) return;

        // Is it the player's turn?
        const currentTurnColor = this.chess.turn() === 'w' ? 'white' : 'black';
        if (currentTurnColor !== this.playerColor) return;

        // If no square currently selected
        if (!this.selectedSquare) {
            const piece = this.chess.get(square);
            if (piece && ((piece.color === 'w' && this.playerColor === 'white') || (piece.color === 'b' && this.playerColor === 'black'))) {
                this.selectedSquare = square;
                const legalMoves = this.chess.moves({ square, verbose: true });
                const destSquares = legalMoves.map(m => m.to);
                this.board3D.showMoveIndicators(destSquares);
            }
            return;
        }

        // A square is already selected
        if (this.selectedSquare === square) {
            // Deselect
            this.selectedSquare = null;
            this.board3D.clearIndicators();
            return;
        }

        // Attempt move from selectedSquare to clicked square
        const moveAttempt = this.chess.move({
            from: this.selectedSquare,
            to: square,
            promotion: 'q' // Auto-promote to Queen
        });

        if (moveAttempt) {
            const fromSq = this.selectedSquare;
            const toSq = square;
            this.selectedSquare = null;
            this.board3D.clearIndicators();

            // Record history
            this.history.push({
                san: moveAttempt.san,
                from: fromSq,
                to: toSq,
                fen: this.chess.fen()
            });

            // Animate on 3D board
            this.board3D.animateMove(fromSq, toSq, moveAttempt.promotion, () => {
                this.onMoveExecuted(moveAttempt);
            });
        } else {
            // Switch selection if clicked another friendly piece
            const piece = this.chess.get(square);
            if (piece && ((piece.color === 'w' && this.playerColor === 'white') || (piece.color === 'b' && this.playerColor === 'black'))) {
                this.selectedSquare = square;
                const legalMoves = this.chess.moves({ square, verbose: true });
                const destSquares = legalMoves.map(m => m.to);
                this.board3D.showMoveIndicators(destSquares);
            } else {
                this.selectedSquare = null;
                this.board3D.clearIndicators();
            }
        }
    }

    async onMoveExecuted(move) {
        this.updateTelemetry();
        this.renderMoveHistory();

        // Check if game ended
        if (this.checkGameOver()) return;

        // Update King check aura
        if (this.chess.in_check()) {
            const kingSquare = this.findKingSquare(this.chess.turn());
            this.board3D.setKingCheckHighlight(kingSquare, true);
            window.soundEngine.playCheck();
        } else {
            this.board3D.clearKingCheck();
        }

        // Trigger AI turn if needed
        const currentTurnColor = this.chess.turn() === 'w' ? 'white' : 'black';
        if (currentTurnColor !== this.playerColor) {
            await this.triggerAIMove();
        } else {
            this.requestPredictions();
        }
    }

    async triggerAIMove() {
        this.isAiThinking = true;
        this.setAiStatus(true, "Minimax searching optimal branch...");

        const startTime = performance.now();
        const aiResponse = await window.chessAPI.getAIMove(this.chess.fen(), this.aiDepth, 3.0);

        if (!aiResponse || !aiResponse.best_move_uci) {
            this.setAiStatus(false, "Evaluation complete.");
            this.isAiThinking = false;
            return;
        }

        let moveUci = aiResponse.best_move_uci;
        // In Kid-Friendly Level 1, play gentle moves to let kids have fun & win
        if (this.aiDepth === 1 && Math.random() < 0.55) {
            const legalMoves = this.chess.moves({ verbose: true });
            const quietMoves = legalMoves.filter(m => !m.captured);
            const pool = quietMoves.length > 0 ? quietMoves : legalMoves;
            if (pool.length > 0) {
                const randomChoice = pool[Math.floor(Math.random() * pool.length)];
                moveUci = randomChoice.from + randomChoice.to + (randomChoice.promotion || '');
            }
        }

        const fromSq = moveUci.substring(0, 2);
        const toSq = moveUci.substring(2, 4);
        const promo = moveUci.length > 4 ? moveUci[4] : null;

        const moveResult = this.chess.move({
            from: fromSq,
            to: toSq,
            promotion: promo || 'q'
        });

        if (moveResult) {
            this.history.push({
                san: moveResult.san,
                from: fromSq,
                to: toSq,
                fen: this.chess.fen(),
                evalCp: aiResponse.evaluation_cp
            });

            this.board3D.animateMove(fromSq, toSq, promo, () => {
                this.isAiThinking = false;
                this.setAiStatus(false, `AI played ${moveResult.san} (${aiResponse.time_ms}ms, ${aiResponse.nodes.toLocaleString()} nodes)`);
                this.updateTelemetry();
                this.renderMoveHistory();
                this.checkGameOver();

                if (this.chess.in_check()) {
                    const kingSquare = this.findKingSquare(this.chess.turn());
                    this.board3D.setKingCheckHighlight(kingSquare, true);
                    window.soundEngine.playCheck();
                } else {
                    this.board3D.clearKingCheck();
                }

                // Update predictor after AI move
                this.requestPredictions();
            });
        } else {
            this.isAiThinking = false;
            this.setAiStatus(false, "Move execution fallback.");
        }
    }

    async updateTelemetry() {
        const evalData = await window.chessAPI.evaluate(this.chess.fen());
        if (!evalData) return;

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
            winProbText.innerText = `${evalData.win_probability.white}% White / ${evalData.win_probability.black}% Black`;
        }

        // 2. Material Tray Breakdown
        this.renderCapturedMaterial(evalData.material);

        // 3. Update Heatmap if active
        if (this.heatmapVisible) {
            const hm = await window.chessAPI.getHeatmap(this.chess.fen());
            if (hm) this.board3D.renderHeatmap(hm.heatmap);
        }
    }

    async requestPredictions() {
        const pred = await window.chessAPI.predict(this.chess.fen(), 3, 3);
        if (!pred || !pred.candidates || pred.candidates.length === 0) return;

        const best = pred.candidates[0];

        // Update Grandmaster HUD
        const bestMoveBadge = document.getElementById('hud-best-move');
        const motifsContainer = document.getElementById('hud-motifs');
        const commentaryText = document.getElementById('hud-commentary');
        const candidatesContainer = document.getElementById('hud-candidates-list');

        if (bestMoveBadge) {
            bestMoveBadge.innerText = best.move_san;
            bestMoveBadge.style.backgroundColor = best.badge_color;
        }

        if (motifsContainer) {
            motifsContainer.innerHTML = '';
            best.motifs.forEach(motif => {
                const tag = document.createElement('span');
                tag.className = 'motif-tag';
                tag.innerText = motif;
                motifsContainer.appendChild(tag);
            });
        }

        if (commentaryText) {
            if (this.kidMode) {
                // Friendly kid-mode translations
                let friendlyTip = `⭐ <b>Coach Tip:</b> Move your piece to <b>${best.to_square.toUpperCase()}</b>!`;
                if (best.motifs && best.motifs.length > 0) {
                    const m = best.motifs[0].toLowerCase();
                    if (m.includes('capture')) friendlyTip = `⚔️ <b>Awesome move!</b> Capture the enemy piece on ${best.to_square.toUpperCase()}!`;
                    else if (m.includes('check')) friendlyTip = `👑 <b>Attack the King!</b> Deliver check on ${best.to_square.toUpperCase()}!`;
                    else if (m.includes('fork')) friendlyTip = `🌟 <b>Super Double Attack!</b> Threaten two pieces at once!`;
                    else if (m.includes('center')) friendlyTip = `🚀 <b>Central Control!</b> Jump into the powerful center of the board!`;
                }
                commentaryText.innerHTML = `${friendlyTip}<br><span style="font-size: 11px; color: #94a3b8;">Click <b>⚡ Play Best Move</b> below if you want help!</span>`;
            } else {
                commentaryText.innerHTML = best.explanation;
            }
        }

        if (candidatesContainer) {
            candidatesContainer.innerHTML = '';
            pred.candidates.forEach((c, idx) => {
                const row = document.createElement('div');
                row.className = 'candidate-row';
                const sign = c.eval_white > 0 ? '+' : '';
                row.innerHTML = `
                    <div class="c-rank">#${idx + 1}</div>
                    <div class="c-move" style="color: ${c.badge_color}">${c.move_san}</div>
                    <div class="c-class">${c.classification}</div>
                    <div class="c-eval">${sign}${(c.eval_white / 100).toFixed(2)}</div>
                `;
                candidatesContainer.appendChild(row);
            });
        }
    }

    async provideHint() {
        const pred = await window.chessAPI.predict(this.chess.fen(), 1, 3);
        if (pred && pred.candidates.length > 0) {
            const best = pred.candidates[0];
            this.board3D.showPredictedMoveArrow(best.from_square, best.to_square);
            this.setAiStatus(false, `Hint: ${best.move_san} (${best.motifs[0] || 'Optimal move'})`);
        }
    }

    undoMove() {
        if (this.isAiThinking || this.history.length === 0) return;

        // Undo 2 plies (User + AI)
        if (this.history.length >= 2) {
            this.chess.undo();
            this.chess.undo();
            this.history.pop();
            this.history.pop();
        } else {
            this.chess.undo();
            this.history.pop();
        }

        this.board3D.loadFEN(this.chess.fen());
        this.updateTelemetry();
        this.renderMoveHistory();
        this.requestPredictions();
        this.board3D.clearPredictedArrow();
        this.board3D.clearKingCheck();
    }

    toggleHeatmap() {
        this.heatmapVisible = !this.heatmapVisible;
        const btn = document.getElementById('btn-heatmap');
        if (this.heatmapVisible) {
            btn.classList.add('active');
            window.chessAPI.getHeatmap(this.chess.fen()).then(data => {
                if (data) this.board3D.renderHeatmap(data.heatmap);
            });
        } else {
            btn.classList.remove('active');
            this.board3D.clearHeatmap();
        }
    }

    toggleSound() {
        const isEnabled = window.soundEngine.toggle();
        const btn = document.getElementById('btn-sound');
        btn.innerText = isEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
    }

    toggleKidMode() {
        this.kidMode = !this.kidMode;
        const btn = document.getElementById('btn-kid-mode');
        if (btn) {
            btn.innerText = this.kidMode ? '⭐ Kid Friendly: ON' : '⚙️ Kid Friendly: OFF';
            btn.style.color = this.kidMode ? '#fbbf24' : '#94a3b8';
            btn.style.borderColor = this.kidMode ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)';
        }
        this.requestPredictions();
    }

    async playBestMoveForPlayer() {
        if (this.isAiThinking || this.chess.game_over()) return;
        const currentTurnColor = this.chess.turn() === 'w' ? 'white' : 'black';
        if (currentTurnColor !== this.playerColor) return;

        this.setAiStatus(true, "AI Coach is playing optimal move for you...");
        const pred = await window.chessAPI.predict(this.chess.fen(), 1, 3);
        if (!pred || !pred.candidates || pred.candidates.length === 0) {
            this.setAiStatus(false, "No legal moves.");
            return;
        }

        const best = pred.candidates[0];
        const fromSq = best.from_square;
        const toSq = best.to_square;
        const promo = best.move_uci.length > 4 ? best.move_uci[4] : 'q';

        const moveAttempt = this.chess.move({
            from: fromSq,
            to: toSq,
            promotion: promo
        });

        if (moveAttempt) {
            this.history.push({
                san: moveAttempt.san,
                from: fromSq,
                to: toSq,
                fen: this.chess.fen()
            });

            this.board3D.clearIndicators();
            this.board3D.clearPredictedArrow();

            if (moveAttempt.captured) {
                this.triggerConfetti();
            }

            this.board3D.animateMove(fromSq, toSq, moveAttempt.promotion, () => {
                this.onMoveExecuted(moveAttempt);
            });
        }
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

        for (let i = 0; i < this.history.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = this.history[i];
            const blackMove = this.history[i + 1];

            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `
                <span class="h-num">${moveNum}.</span>
                <span class="h-move">${whiteMove.san}</span>
                <span class="h-move">${blackMove ? blackMove.san : ''}</span>
            `;
            listContainer.appendChild(row);
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
        const statusDot = document.getElementById('ai-status-dot');
        const statusText = document.getElementById('ai-status-text');
        if (statusDot) {
            statusDot.className = thinking ? 'status-dot pulse-amber' : 'status-dot emerald';
        }
        if (statusText) {
            statusText.innerText = message;
        }

        const banner = document.getElementById('turn-banner');
        const bannerIcon = document.getElementById('turn-banner-icon');
        const bannerText = document.getElementById('turn-banner-text');
        if (banner && bannerText && bannerIcon) {
            if (thinking) {
                banner.className = 'turn-banner ai-turn';
                bannerIcon.innerText = '🤖';
                bannerText.innerText = `AI IS THINKING... (Minimax Depth ${this.aiDepth})`;
            } else {
                banner.className = 'turn-banner player-turn';
                bannerIcon.innerText = '🟢';
                bannerText.innerText = "YOUR TURN — Click a piece or tap '⚡ Play Best Move'";
            }
        }
    }

    showNewGameModal() {
        document.getElementById('modal-new-game').classList.remove('hidden');
    }

    showFenModal() {
        document.getElementById('input-fen-string').value = this.chess.fen();
        document.getElementById('modal-fen').classList.remove('hidden');
    }

    applyFenFromModal() {
        const fenStr = document.getElementById('input-fen-string').value.trim();
        const valid = this.chess.load(fenStr);
        if (valid) {
            this.history = [];
            this.board3D.loadFEN(this.chess.fen());
            this.updateTelemetry();
            this.renderMoveHistory();
            this.requestPredictions();
            this.closeModals();
        } else {
            alert('Invalid FEN position string.');
        }
    }

    showGameOverModal(title, message) {
        document.getElementById('game-over-title').innerText = title;
        document.getElementById('game-over-desc').innerText = message;
        document.getElementById('modal-game-over').classList.remove('hidden');
    }

    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessApp();
});
