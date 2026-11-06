/** Fullscreen the complete playing area, with an in-page fallback for iOS. */
class BoardFullscreen {
    constructor(app) {
        this.app = app;
        this.arena = document.getElementById('play-arena');
        this.button = document.getElementById('btn-fullscreen');
        this.moveEntry = document.querySelector('.move-entry');
        this.marker = document.createComment('keyboard controls home');
        this.moveEntry.before(this.marker);
        this.active = false;
        this.pending = false;
        this.button.addEventListener('click', () => this.toggle());
        document.addEventListener('fullscreenchange', () => this.setActive(document.fullscreenElement === this.arena));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.active && !document.fullscreenElement) this.exit();
        });
        document.getElementById('btn-board-new').addEventListener('click', () => app.showNewGameModal());
        document.getElementById('board-difficulty').addEventListener('change', event => {
            document.getElementById('select-difficulty').value = event.target.value;
            document.getElementById('select-difficulty').dispatchEvent(new Event('change'));
        });
        document.getElementById('board-theme').addEventListener('change', event => {
            document.getElementById('select-theme').value = event.target.value;
            document.getElementById('select-theme').dispatchEvent(new Event('change'));
        });
    }
    async toggle() {
        if (this.pending) return;
        if (this.active) { await this.exit(); return; }
        this.pending = true;
        try {
            if (this.arena.requestFullscreen && document.fullscreenEnabled) await this.arena.requestFullscreen();
            this.setActive(true);
        } catch { this.setActive(true); }
        finally { this.pending = false; }
    }
    async exit() {
        if (document.fullscreenElement === this.arena) {
            try { await document.exitFullscreen(); } catch { /* keep a usable in-page exit */ }
        }
        this.setActive(false);
    }
    setActive(active) {
        this.active = active;
        this.arena.classList.toggle('board-expanded', active);
        document.body.classList.toggle('board-is-expanded', active);
        this.button.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
        this.button.setAttribute('aria-pressed', String(active));
        if (active) {
            document.getElementById('fullscreen-move-controls').append(this.moveEntry);
            document.getElementById('board-difficulty').value = String(this.app.aiDepth);
            document.getElementById('board-theme').value = this.app.board3D.theme;
        } else {
            this.marker.after(this.moveEntry);
        }
        requestAnimationFrame(() => this.app.board3D.onWindowResize());
        this.button.focus({preventScroll:true});
    }
}
window.BoardFullscreen = BoardFullscreen;
