/**
 * Metronome Click Audio Generator
 * Produces crisp, sample-accurate audio clicks synced with BPM
 */

export class MetronomeClickEngine {
  private audioCtx: AudioContext | null = null;
  private intervalId: any = null;
  private isRunning: boolean = false;
  private bpm: number = 120;
  private volume: number = 0.7;
  private currentBeat: number = 0;
  private onBeatCallback?: (beat: number) => void;

  constructor(bpm: number = 120, onBeat?: (beat: number) => void) {
    this.bpm = bpm;
    this.onBeatCallback = onBeat;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(30, Math.min(260, newBpm));
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  private playClick(isDownbeat: boolean) {
    if (this.volume <= 0.001) return;

    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = isDownbeat ? 1400 : 900;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(this.volume * 0.8, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {
      // ignore
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentBeat = 0;

    const intervalMs = (60 / this.bpm) * 1000;

    // First click immediately
    this.playClick(true);
    if (this.onBeatCallback) this.onBeatCallback(1);
    this.currentBeat = 1;

    this.intervalId = setInterval(() => {
      const isDownbeat = this.currentBeat % 4 === 0;
      this.playClick(isDownbeat);
      const displayBeat = (this.currentBeat % 4) + 1;
      if (this.onBeatCallback) this.onBeatCallback(displayBeat);
      this.currentBeat++;
    }, intervalMs);
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.currentBeat = 0;
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public get active(): boolean {
    return this.isRunning;
  }
}
