/**
 * Grandmaster-AI Procedural Web Audio Engine
 * High-fidelity, zero-latency Web Audio API synthesis for chess piece interactions.
 * Fully compliant with modern browser autoplay policies with proactive gesture unlock.
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.enabled = true;
        this.unlocked = false;

        // Auto-unlock AudioContext on first user interaction anywhere on the document
        this._bindGestureUnlock();
    }

    _bindGestureUnlock() {
        const unlock = () => {
            if (this.unlocked && this.ctx && this.ctx.state === 'running') return;
            this.initContext();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => {
                    this.unlocked = true;
                }).catch(() => {});
            } else if (this.ctx && this.ctx.state === 'running') {
                this.unlocked = true;
            }
        };

        ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach(evt => {
            window.addEventListener(evt, unlock, { once: false, passive: true });
        });
    }

    initContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
                this.masterGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    _scheduleSound(generator) {
        if (!this.enabled) return;
        const ctx = this.initContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                if (ctx.state === 'running') generator(ctx, Math.max(ctx.currentTime, 0.001) + 0.005);
            }).catch(() => {});
        } else {
            generator(ctx, Math.max(ctx.currentTime, 0.001) + 0.005);
        }
    }

    playMove() {
        this._scheduleSound((ctx, now) => {
            // 1. High transient knock (wood contact)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(360, now);
            osc.frequency.exponentialRampToValueAtTime(90, now + 0.06);

            gain.gain.setValueAtTime(0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(now);
            osc.stop(now + 0.075);

            // 2. Low woody body resonance
            const sub = ctx.createOscillator();
            const subGain = ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(140, now);
            sub.frequency.exponentialRampToValueAtTime(50, now + 0.08);

            subGain.gain.setValueAtTime(0.25, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

            sub.connect(subGain);
            subGain.connect(this.masterGain || ctx.destination);
            sub.start(now);
            sub.stop(now + 0.095);
        });
    }

    playCapture() {
        this._scheduleSound((ctx, now) => {
            // 1. Sharp piece collision crack
            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(520, now);
            clickOsc.frequency.exponentialRampToValueAtTime(120, now + 0.05);

            clickGain.gain.setValueAtTime(0.55, now);
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            clickOsc.connect(clickGain);
            clickGain.connect(this.masterGain || ctx.destination);
            clickOsc.start(now);
            clickOsc.stop(now + 0.065);

            // 2. Deep acoustic impact thud
            const subOsc = ctx.createOscillator();
            const subGain = ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(180, now);
            subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.16);

            subGain.gain.setValueAtTime(0.65, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

            subOsc.connect(subGain);
            subGain.connect(this.masterGain || ctx.destination);
            subOsc.start(now);
            subOsc.stop(now + 0.17);
        });
    }

    playCheck() {
        this._scheduleSound((ctx, now) => {
            // Distinct double-tone alert chime (E5 -> A5)
            const tones = [
                { freq: 659.25, start: 0, dur: 0.22 },
                { freq: 880.00, start: 0.08, dur: 0.32 }
            ];

            tones.forEach(t => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(t.freq, now + t.start);

                gain.gain.setValueAtTime(0.32, now + t.start);
                gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);

                osc.connect(gain);
                gain.connect(this.masterGain || ctx.destination);
                osc.start(now + t.start);
                osc.stop(now + t.start + t.dur + 0.01);
            });
        });
    }

    playCastle() {
        // Swift double piece slide
        this.playMove();
        setTimeout(() => this.playMove(), 80);
    }

    playVictory() {
        this._scheduleSound((ctx, now) => {
            // Ascending C Major fanfare arpeggio (C5, E5, G5, C6)
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.11);

                gain.gain.setValueAtTime(0.35, now + idx * 0.11);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.45);

                osc.connect(gain);
                gain.connect(this.masterGain || ctx.destination);
                osc.start(now + idx * 0.11);
                osc.stop(now + idx * 0.11 + 0.46);
            });
        });
    }
}

window.soundEngine = new SoundEngine();
