class RetroJRPGAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.12,
    delay = 0,
    slideToFreq?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideToFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playCursor() {
    this.playTone(980, 0.05, 'square', 0.05);
  }

  playConfirm() {
    this.playTone(784, 0.07, 'triangle', 0.1, 0);
    this.playTone(1174, 0.12, 'triangle', 0.1, 0.05);
  }

  playCancel() {
    this.playTone(320, 0.09, 'sawtooth', 0.07, 0, 220);
  }

  playAtbReady() {
    this.playTone(880, 0.09, 'sine', 0.09, 0);
    this.playTone(1318.5, 0.16, 'sine', 0.09, 0.07);
  }

  playHit() {
    this.playTone(190, 0.13, 'sawtooth', 0.14, 0, 65);
    this.playTone(420, 0.08, 'square', 0.08, 0.02, 140);
  }

  playCrit() {
    this.playTone(260, 0.18, 'sawtooth', 0.18, 0, 55);
    this.playTone(880, 0.12, 'square', 0.12, 0.02, 330);
    this.playTone(1480, 0.2, 'triangle', 0.11, 0.08);
  }

  playSpell() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.playTone(f, 0.16, 'sine', 0.09, idx * 0.05);
    });
  }

  playHeal() {
    [587.33, 739.99, 880, 1174.66].forEach((f, idx) => {
      this.playTone(f, 0.18, 'triangle', 0.09, idx * 0.06);
    });
  }

  playLimitBreak() {
    this.playTone(220, 0.35, 'sawtooth', 0.14, 0, 880);
    [440, 554.37, 659.25, 880, 1108.73].forEach((f, idx) => {
      this.playTone(f, 0.25, 'square', 0.09, 0.08 + idx * 0.06);
    });
  }

  playVictoryFanfare() {
    // Classic JRPG triumphant victory fanfare motif
    const notes: [number, number, number][] = [
      [523.25, 0.11, 0.0],
      [523.25, 0.11, 0.13],
      [523.25, 0.11, 0.26],
      [523.25, 0.34, 0.39],
      [415.30, 0.32, 0.76],
      [466.16, 0.32, 1.10],
      [523.25, 0.18, 1.44],
      [466.16, 0.12, 1.66],
      [523.25, 0.65, 1.82],
    ];
    notes.forEach(([freq, dur, delay]) => {
      this.playTone(freq, dur, 'triangle', 0.14, delay);
      this.playTone(freq * 0.5, dur, 'sine', 0.07, delay);
    });
  }

  playDefeat() {
    [392, 349.23, 311.13, 261.63].forEach((f, idx) => {
      this.playTone(f, 0.35, 'triangle', 0.1, idx * 0.22);
    });
  }
}

export const audio = new RetroJRPGAudio();
