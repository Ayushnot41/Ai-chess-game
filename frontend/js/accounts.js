/** Optional accounts. Explicit cloud save/load avoids overwriting another device. */
class ChessAccount {
    constructor(app) {
        this.app = app;
        this.user = null;
        this.cloudRevision = null;
        this.mode = 'login';
        this.busy = false;
        this.message = document.getElementById('account-message');
        document.getElementById('btn-account').addEventListener('click', () => this.open());
        document.getElementById('account-form').addEventListener('submit', event => { event.preventDefault(); this.authenticate(); });
        document.getElementById('account-switch').addEventListener('click', () => this.setMode(this.mode === 'login' ? 'register' : 'login'));
        document.getElementById('account-logout').addEventListener('click', () => this.logout());
        document.getElementById('account-save').addEventListener('click', () => this.save());
        document.getElementById('account-load').addEventListener('click', () => this.load());
        this.checkSession();
    }
    async request(path, method='GET', payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(`/api/${path}`, {method, credentials:'include', signal:controller.signal,
                headers:{'Content-Type':'application/json','X-Chess-Client':'1'}, body:payload ? JSON.stringify(payload) : undefined});
            const data = await response.json();
            if (!response.ok) {
                const error = new Error(typeof data.detail === 'string' ? data.detail : 'Check the username and password requirements.');
                error.status = response.status; throw error;
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('The account server is taking longer than expected. Please try again.');
            throw error;
        } finally { clearTimeout(timer); }
    }
    async checkSession() {
        try { this.user = (await this.request('auth/me')).user; }
        catch { this.user = null; }
        this.render();
    }
    async open() {
        this.message.textContent = '';
        this.render();
        await this.app.openModal('modal-account');
        if (this.user) {
            try {
                const data = await this.request('account/game');
                this.cloudRevision = data.revision;
                document.getElementById('account-cloud-state').textContent = data.game ? `${data.game.moves.length} moves saved to your account.` : 'No game saved to this account yet.';
                document.getElementById('account-load').disabled = !data.game;
            } catch (error) { this.message.textContent = error.message; }
        }
    }
    setMode(mode) {
        this.mode = mode; this.message.textContent = '';
        document.getElementById('account-title').textContent = mode === 'register' ? 'Create your account' : 'Welcome back';
        document.getElementById('account-submit').textContent = mode === 'register' ? 'Create account' : 'Sign in';
        document.getElementById('account-switch').textContent = mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account';
        document.getElementById('account-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
        document.getElementById('confirm-password-label').hidden = mode !== 'register';
        document.getElementById('account-confirm').required = mode === 'register';
    }
    render() {
        document.getElementById('btn-account').textContent = this.user ? this.user.username : 'Sign in';
        document.getElementById('account-form').hidden = !!this.user;
        document.getElementById('account-profile').hidden = !this.user;
        document.getElementById('account-switch').hidden = !!this.user;
        if (this.user) {
            document.getElementById('account-title').textContent = 'Your account';
            document.getElementById('account-username-display').textContent = this.user.username;
        } else this.setMode(this.mode);
    }
    setBusy(busy) {
        this.busy = busy;
        document.querySelectorAll('#account-form button, #account-profile button, #account-switch').forEach(button => button.disabled = busy);
    }
    async authenticate() {
        if (this.busy) return;
        const password = document.getElementById('account-password').value;
        if (this.mode === 'register' && password !== document.getElementById('account-confirm').value) {
            this.message.textContent = 'The two passwords do not match.'; return;
        }
        this.setBusy(true); this.message.textContent = 'Signing you in…';
        try {
            const result = await this.request(`auth/${this.mode}`, 'POST', {username:document.getElementById('account-username').value.trim(),password});
            this.user = result.user; document.getElementById('account-form').reset();
            this.render(); this.message.textContent = 'Signed in. Your current board has not changed.';
            const saved = await this.request('account/game'); this.cloudRevision = saved.revision;
            document.getElementById('account-cloud-state').textContent = saved.game ? 'An account game is available to load.' : 'Save your current game to continue on another device.';
        } catch (error) { this.message.textContent = error.message; }
        finally { this.setBusy(false); }
    }
    async logout() {
        if (this.busy) return;
        this.setBusy(true);
        try {
            await this.request('auth/logout','POST'); this.user=null; this.cloudRevision=null;
            this.render(); this.message.textContent='Signed out. You can keep playing as a guest.';
        } catch (error) { this.message.textContent=error.message; }
        finally { this.setBusy(false); }
    }
    async save() {
        if (this.busy) return;
        this.setBusy(true);
        try {
            const state=this.app.serializeGame();
            const result=await this.request('account/game','PUT',{...state,expected_revision:this.cloudRevision});
            this.cloudRevision=result.revision; this.message.textContent='Game saved to your account.';
            document.getElementById('account-cloud-state').textContent=`${state.moves.length} moves saved to your account.`;
        } catch (error) { this.message.textContent=error.message; }
        finally { this.setBusy(false); }
    }
    async load() {
        if (this.busy) return;
        if (this.app.isBusy()) { this.message.textContent='Wait for the current move to finish, then load your game.'; return; }
        if (this.app.chess.history().length && !confirm('Replace the current board with your account game? Export PGN first if you want to keep this game.')) return;
        this.setBusy(true);
        try {
            const result=await this.request('account/game');
            if (!result.game) { this.message.textContent='There is no game saved to this account yet.'; return; }
            this.app.loadAccountGame(result.game); this.cloudRevision=result.revision;
            this.message.textContent='Account game loaded.';
        } catch (error) { this.message.textContent=error.message; }
        finally { this.setBusy(false); }
    }
}
window.ChessAccount = ChessAccount;
