export class WebAudioPlayer {
  private audio: HTMLAudioElement;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _onLoaded: (() => void) | null = null;
  private _listeners: Array<[string, EventListener]> = [];

  constructor(src: string) {
    this.audio = new Audio(src);
    this._addEventListener('timeupdate', () => {
      this._onTimeUpdate?.(this.audio.currentTime);
    });
    this._addEventListener('ended', () => {
      this._onEnded?.();
    });
    this._addEventListener('loadedmetadata', () => {
      this._onLoaded?.();
    });
  }

  private _addEventListener(event: string, handler: EventListener): void {
    this.audio.addEventListener(event, handler);
    this._listeners.push([event, handler]);
  }

  play(): void {
    this.audio.play().catch((err) => {
      console.warn('Playback failed:', err?.message);
    });
  }

  pause(): void {
    this.audio.pause();
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seekTo(seconds: number): void {
    this.audio.currentTime = seconds;
  }

  setPlaybackRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  getCurrentTime(): number {
    return this.audio.currentTime;
  }

  getDuration(): number {
    return this.audio.duration || 0;
  }

  isPlaying(): boolean {
    return !this.audio.paused;
  }

  onTimeUpdate(callback: (time: number) => void): void {
    this._onTimeUpdate = callback;
  }

  onEnded(callback: () => void): void {
    this._onEnded = callback;
  }

  onLoaded(callback: () => void): void {
    this._onLoaded = callback;
  }

  destroy(): void {
    this.audio.pause();
    for (const [event, handler] of this._listeners) {
      this.audio.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.audio.src = '';
    this._onTimeUpdate = null;
    this._onEnded = null;
    this._onLoaded = null;
  }
}
