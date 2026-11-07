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
        this.googleConfig = null;
        this.checkSession();
        this.handleUrlAuth();
        this.initGoogleAuth();
    }
    handleUrlAuth() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('signed_in') === 'google') {
            window.history.replaceState({}, document.title, window.location.pathname);
            this.checkSession().then(() => {
                if (this.user) {
                    this.message.textContent = `Successfully signed in with Google as ${this.user.name || this.user.username}!`;
                }
            });
        } else if (params.get('auth_error')) {
            const err = params.get('auth_error');
            window.history.replaceState({}, document.title, window.location.pathname);
            this.message.textContent = `Google sign-in status: ${err.replace(/_/g, ' ')}. You can also sign in below.`;
        }
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
        document.getElementById('btn-account').textContent = this.user ? (this.user.name || this.user.username) : 'Sign in';
        document.getElementById('account-form').hidden = !!this.user;
        document.getElementById('account-profile').hidden = !this.user;
        document.getElementById('account-switch').hidden = !!this.user;
        const googleContainer = document.getElementById('google-auth-container');
        if (googleContainer) {
            googleContainer.style.display = this.user || !this.googleConfig?.google_enabled ? 'none' : 'block';
        }
        if (this.user) {
            document.getElementById('account-title').textContent = 'Your account';
            document.getElementById('account-username-display').textContent = this.user.name || this.user.username;
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
    async initGoogleAuth() {
        const DEFAULT_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
        const container = document.getElementById('google-auth-container');
        if (container) container.style.display = 'block';

        try {
            const config = await this.request('auth/config');
            this.googleConfig = config || {};
            if (!this.googleConfig.google_client_id) {
                this.googleConfig.google_client_id = DEFAULT_CLIENT_ID;
                this.googleConfig.google_enabled = true;
            }
        } catch {
            this.googleConfig = {
                google_enabled: true,
                google_client_id: DEFAULT_CLIENT_ID
            };
        }

        // Render the Google authentication button immediately
        this.renderGoogleButton();

        // Also monitor for Google Identity Services script if not yet loaded
        if (!window.google?.accounts?.id) {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (window.google?.accounts?.id) {
                    clearInterval(interval);
                    this.renderGoogleButton();
                } else if (attempts > 50) {
                    clearInterval(interval);
                }
            }, 100);
        }
    }
    renderGoogleButton() {
        if (!this.googleConfig?.google_client_id) {
            this.googleConfig = this.googleConfig || {};
            this.googleConfig.google_client_id = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
            this.googleConfig.google_enabled = true;
        }
        const container = document.getElementById('google-auth-container');
        if (container) container.style.display = 'block';

        const target = document.getElementById('google-signin-btn');
        if (!target) return;

        // Render the guaranteed direct Google OAuth button
        this.renderDirectGoogleFallback(target);

        // Also initialize Google Identity Services for one-tap sign-in if supported
        if (window.google?.accounts?.id) {
            try {
                window.google.accounts.id.initialize({
                    client_id: this.googleConfig.google_client_id,
                    callback: response => this.handleGoogleCredential(response),
                    auto_select: false,
                    cancel_on_tap_outside: true
                });
                if (!this.user) {
                    try { window.google.accounts.id.prompt(); } catch {}
                }
            } catch {}
        }
    }
    renderDirectGoogleFallback(target) {
        target.replaceChildren();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary';
        btn.style.cssText = 'width: 280px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 16px; border-radius: 9999px; background: #18181b; border: 1px solid #3f3f46; color: #fff; font-weight: 500; cursor: pointer; transition: background 0.2s;';
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> <span>Continue with Google</span>`;
        btn.addEventListener('click', () => this.launchDirectGoogleOAuth());
        target.appendChild(btn);
    }
    launchDirectGoogleOAuth() {
        if (!this.googleConfig?.google_client_id) return;
        const redirectUri = window.location.origin + '/api/auth/google/callback';
        const state = btoa(JSON.stringify({ redirect_uri: redirectUri }));
        const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(this.googleConfig.google_client_id)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=code&` +
            `scope=${encodeURIComponent('openid email profile')}&` +
            `state=${encodeURIComponent(state)}&` +
            `access_type=online&` +
            `prompt=select_account`;
        window.location.href = url;
    }
    async handleGoogleCredential(response) {
        if (!response?.credential) return;
        this.message.textContent = 'Verifying Google account…';
        try {
            const data = await this.request('auth/google', 'POST', { credential: response.credential });
            this.user = data.user;
            this.message.textContent = '';
            this.render();
            document.getElementById('account-username-display').textContent = this.user.name || this.user.username;
        } catch (error) {
            this.message.textContent = error.message || 'Google sign-in failed.';
        }
    }
}
window.ChessAccount = ChessAccount;
