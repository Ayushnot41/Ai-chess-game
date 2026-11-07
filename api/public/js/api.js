/** Same-origin requests with cancellation, deadlines and replayable history. */
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
            let retries = endpoint === 'move' ? 2 : 0;
            let response;
            while (true) {
                response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...(this.historyProvider?.(payload.fen) || {}), ...payload }),
                    signal: controller.signal
                });
                if (response.status === 503 && retries > 0) {
                    retries--;
                    await new Promise(r => setTimeout(r, 250));
                    continue;
                }
                break;
            }
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
