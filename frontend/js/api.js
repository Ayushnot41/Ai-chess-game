/**
 * Grandmaster-AI API Client
 * Interfaces with the FastAPI backend engine services.
 */

class ChessAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async evaluate(fen) {
        try {
            const res = await fetch(`${this.baseUrl}/api/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen })
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (err) {
            console.error('API evaluate error:', err);
            return null;
        }
    }

    async getAIMove(fen, depth = 4, timeLimit = 3.0) {
        try {
            const res = await fetch(`${this.baseUrl}/api/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen, depth, time_limit: timeLimit })
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (err) {
            console.error('API getAIMove error:', err);
            return null;
        }
    }

    async predict(fen, topK = 3, depth = 3) {
        try {
            const res = await fetch(`${this.baseUrl}/api/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen, top_k: topK, depth })
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (err) {
            console.error('API predict error:', err);
            return null;
        }
    }

    async getHeatmap(fen) {
        try {
            const res = await fetch(`${this.baseUrl}/api/heatmap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen })
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (err) {
            console.error('API heatmap error:', err);
            return null;
        }
    }

    async validateMove(fen, moveUci) {
        try {
            const res = await fetch(`${this.baseUrl}/api/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen, move_uci: moveUci })
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (err) {
            console.error('API validate error:', err);
            return { valid: false, error: err.message };
        }
    }
}

window.chessAPI = new ChessAPI();
