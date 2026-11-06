/**
 * Procedural Web Audio API Synthesizer for Digimon Digital Card Battle (PS1)
 *
 * Zero-asset retro PS1 Digivice / Cyber-Arena sound generator using Web Audio API
 * oscillators, frequency sweeps, arpeggios, and filtered noise bursts.
 * Safe in headless Node/Vitest environments where `window` or `AudioContext` is undefined.
 */

import type { GameEvent } from '../types/game';

export const SOUND_MUTE_STORAGE_KEY = 'ddcb_ps1_sound_muted';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 0.42;

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY);
        if (saved === 'true') {
          this.muted = true;
        }
      } catch {
        // Ignore storage errors in restricted environments
      }
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(SOUND_MUTE_STORAGE_KEY, String(mute));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainLevel = 0.25,
    delay = 0,
    endFreq?: number
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }

      const peak = Math.max(0.0002, gainLevel * this.volume);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.014, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Ignore Web Audio scheduling errors
    }
  }

  private playNoiseBurst(
    duration: number,
    filterFreq: number,
    gainLevel = 0.22,
    delay = 0,
    filterType: BiquadFilterType = 'bandpass',
    q = 1.8
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + delay;
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(40, filterFreq), now);
      filter.Q.setValueAtTime(q, now);

      const gain = ctx.createGain();
      const peak = Math.max(0.0002, gainLevel * this.volume);
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start(now);
    } catch {
      // Ignore Web Audio errors
    }
  }

  /** Crisp PS1 Digivice menu cursor / button beep. */
  public playClick(): void {
    this.playTone(980, 0.045, 'square', 0.14, 0, 1320);
    this.playTone(1480, 0.035, 'sine', 0.12, 0.015);
  }

  /** Card draw digital slide & chime. */
  public playCardDraw(): void {
    this.playNoiseBurst(0.07, 2200, 0.18, 0, 'bandpass', 2.4);
    this.playTone(587.33, 0.08, 'triangle', 0.18, 0.01, 880);
  }

  /** Placing a Rookie Digimon onto the Battle Arena mat. */
  public playCardPlace(): void {
    this.playTone(150, 0.13, 'sine', 0.38, 0, 62);
    this.playNoiseBurst(0.08, 1100, 0.22);
    this.playTone(440, 0.12, 'triangle', 0.22, 0.02, 659.25);
    this.playTone(880, 0.16, 'sine', 0.16, 0.06);
  }

  /** Charging +P points into the DP Slot. */
  public playDpCharge(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 0.11, 'triangle', 0.22, idx * 0.042);
      this.playTone(freq * 1.5, 0.08, 'sine', 0.1, idx * 0.042 + 0.01);
    });
  }

  /** Classic PS1 Digivolution ascending cyber-matrix arpeggio + power chord. */
  public playDigivolve(): void {
    const arp = [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66, 1567.98];
    arp.forEach((freq, i) => {
      this.playTone(freq, 0.14, 'sawtooth', 0.18, i * 0.045);
      this.playTone(freq * 0.5, 0.14, 'triangle', 0.2, i * 0.045);
    });
    this.playNoiseBurst(0.28, 1800, 0.16, 0.05, 'highpass', 1.2);
    this.playTone(783.99, 0.42, 'triangle', 0.28, 0.32);
    this.playTone(1174.66, 0.45, 'sine', 0.22, 0.32);
  }

  /** Digi-Egg Armor Digivolution: metallic crest chime + radiant burst. */
  public playArmorDigivolve(): void {
    const shimmer = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0];
    shimmer.forEach((freq, idx) => {
      this.playTone(freq, 0.18, 'sine', 0.22, idx * 0.038);
      this.playTone(freq * 0.75, 0.14, 'triangle', 0.16, idx * 0.038 + 0.015);
    });
    this.playTone(1046.5, 0.48, 'triangle', 0.28, 0.28);
    this.playTone(1567.98, 0.5, 'sine', 0.24, 0.28);
  }

  /** Locking in Circle / Triangle / Cross attack button. */
  public playAttackSelect(): void {
    this.playTone(740, 0.06, 'square', 0.18, 0, 987.77);
    this.playTone(1174.66, 0.11, 'triangle', 0.22, 0.045);
  }

  /** Flipping a Support or Option card into the Support Slot. */
  public playSupportFlip(): void {
    this.playNoiseBurst(0.09, 2500, 0.22, 0, 'bandpass', 2.0);
    this.playTone(493.88, 0.1, 'triangle', 0.2, 0.015, 739.99);
    this.playTone(987.77, 0.14, 'sine', 0.18, 0.065);
  }

  /** Standard combat strike / laser impact. */
  public playLaserHit(): void {
    this.playTone(1350, 0.15, 'sawtooth', 0.22, 0, 190);
    this.playNoiseBurst(0.14, 1400, 0.28, 0.02, 'bandpass', 1.5);
    this.playTone(120, 0.16, 'sine', 0.34, 0.03, 52);
  }

  /** Heavy combat blow (400+ damage or Crash / Foe x3). */
  public playHeavyHit(): void {
    this.playTone(920, 0.22, 'sawtooth', 0.28, 0, 75);
    this.playTone(180, 0.28, 'square', 0.35, 0, 42);
    this.playNoiseBurst(0.26, 750, 0.38, 0, 'lowpass', 1.1);
    this.playNoiseBurst(0.18, 2100, 0.24, 0.04, 'bandpass', 1.6);
  }

  /** Counterattack reflect alarm + impact strike. */
  public playCounterAttack(): void {
    this.playTone(880, 0.08, 'square', 0.24, 0, 1760);
    this.playTone(1760, 0.09, 'square', 0.24, 0.075, 880);
    this.playHeavyHit();
  }

  /** HP recovery / Eat-Up HP chime. */
  public playHeal(): void {
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.16, 'sine', 0.22, idx * 0.055);
    });
  }

  /** Support Voided / Jamming / Attack to 0 buzz. */
  public playVoidJam(): void {
    this.playTone(340, 0.16, 'sawtooth', 0.24, 0, 140);
    this.playTone(255, 0.2, 'square', 0.22, 0.08, 110);
    this.playNoiseBurst(0.16, 900, 0.2, 0.02);
  }

  /** Digimon KO explosion & digital de-resolution burst. */
  public playKoExplosion(): void {
    this.playNoiseBurst(0.42, 520, 0.42, 0, 'lowpass', 0.9);
    this.playNoiseBurst(0.32, 1600, 0.28, 0.04, 'bandpass', 1.4);
    const descend = [520, 420, 330, 240, 160, 95];
    descend.forEach((f, i) => {
      this.playTone(f, 0.11, 'sawtooth', 0.24, i * 0.05, f * 0.65);
    });
  }

  /** Match Victory Fanfare! */
  public playVictoryFanfare(): void {
    const fanfare = [
      { f: 523.25, d: 0.13, t: 0.0 },
      { f: 659.25, d: 0.13, t: 0.12 },
      { f: 783.99, d: 0.13, t: 0.24 },
      { f: 1046.5, d: 0.22, t: 0.36 },
      { f: 783.99, d: 0.14, t: 0.58 },
      { f: 1046.5, d: 0.55, t: 0.72 },
    ];
    for (const n of fanfare) {
      this.playTone(n.f, n.d, 'triangle', 0.28, n.t);
      this.playTone(n.f * 0.5, n.d, 'sine', 0.2, n.t);
    }
  }

  /** Match Defeat Jingle. */
  public playDefeatJingle(): void {
    const notes = [
      { f: 440.0, d: 0.22, t: 0.0 },
      { f: 415.3, d: 0.22, t: 0.21 },
      { f: 392.0, d: 0.24, t: 0.42 },
      { f: 349.23, d: 0.55, t: 0.65 },
    ];
    for (const n of notes) {
      this.playTone(n.f, n.d, 'triangle', 0.24, n.t);
      this.playTone(n.f * 0.5, n.d, 'sawtooth', 0.12, n.t);
    }
  }

  /**
   * Automatically triggers appropriate sound effects for newly emitted engine events.
   */
  public playEvents(events: readonly GameEvent[]): void {
    if (this.muted || events.length === 0) return;

    // Prioritize highest-impact events if multiple occur in a single batch (e.g., battle resolution)
    const gameOverEv = events.find(
      (e): e is Extract<GameEvent, { type: 'gameOver' }> => e.type === 'gameOver'
    );
    const koEv = events.find(
      (e): e is Extract<GameEvent, { type: 'digimonKo' }> => e.type === 'digimonKo'
    );
    const strikeEvs = events.filter(
      (e): e is Extract<GameEvent, { type: 'attackStrike' }> => e.type === 'attackStrike'
    );
    const digivolveEv = events.find(
      (e): e is Extract<GameEvent, { type: 'digivolved' }> => e.type === 'digivolved'
    );

    if (digivolveEv) {
      if (digivolveEv.method === 'armor') {
        this.playArmorDigivolve();
      } else {
        this.playDigivolve();
      }
      return;
    }

    if (strikeEvs.length > 0) {
      const hasCounter = strikeEvs.some((s) => s.countered);
      const maxDmg = Math.max(...strikeEvs.map((s) => s.damage));
      if (hasCounter) {
        this.playCounterAttack();
      } else if (maxDmg >= 400) {
        this.playHeavyHit();
      } else {
        this.playLaserHit();
      }

      if (koEv) {
        this.playKoExplosion();
      }
      if (gameOverEv) {
        if (gameOverEv.winner === 'player') {
          this.playVictoryFanfare();
        } else {
          this.playDefeatJingle();
        }
      }
      return;
    }

    if (gameOverEv) {
      if (gameOverEv.winner === 'player') {
        this.playVictoryFanfare();
      } else {
        this.playDefeatJingle();
      }
      return;
    }

    for (const ev of events) {
      switch (ev.type) {
        case 'rookiePlaced':
          this.playCardPlace();
          return;
        case 'dpCardAdded':
          this.playDpCharge();
          return;
        case 'digivolveOptionUsed':
          this.playSupportFlip();
          return;
        case 'devolved':
        case 'supportVoided':
          this.playVoidJam();
          return;
        case 'attackChosen':
          this.playAttackSelect();
          return;
        case 'supportPlayed':
          this.playSupportFlip();
          return;
        case 'supportPassed':
          this.playClick();
          return;
        case 'mulligan':
          if (!ev.kept) {
            this.playCardDraw();
          } else {
            this.playClick();
          }
          return;
        case 'cardsDrawn':
          this.playCardDraw();
          return;
        case 'statModified':
          if (ev.stat === 'hp' && (ev.delta ?? 0) > 0) {
            this.playHeal();
            return;
          }
          break;
        default:
          break;
      }
    }
  }
}

export const soundEngine = new SoundEngine();
export default soundEngine;
