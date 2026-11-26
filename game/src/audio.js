// Island Courier — synthesised sound effects.
//
// Every sound is built with the Web Audio API: oscillators, filtered noise
// and envelopes. No audio files are loaded, so the game stays fully
// offline. The engine hum follows the throttle, the wind follows speed,
// and one-shots mark rings, landings and crashes.

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.engineOscillator = null;
    this.engineSubOscillator = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.windSource = null;
    this.windFilter = null;
    this.windGain = null;
    this.muted = false;
    this.started = false;
  }

  // Create the context on the first user gesture; browsers block audio
  // before that. Safe to call repeatedly.
  ensureAudioContext() {
    if (this.started) {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      return;
    }
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    this.audioContext = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.55;
    this.masterGain.connect(ctx.destination);
    this.buildEngineHum(ctx);
    this.buildWindNoise(ctx);
    this.started = true;
  }

  // Two detuned oscillators through a low-pass filter: the classic
  // puttering single-engine drone.
  buildEngineHum(ctx) {
    this.engineOscillator = ctx.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    this.engineOscillator.frequency.value = 68;
    this.engineSubOscillator = ctx.createOscillator();
    this.engineSubOscillator.type = 'sine';
    this.engineSubOscillator.frequency.value = 34;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOscillator.connect(this.engineFilter);
    this.engineSubOscillator.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOscillator.start();
    this.engineSubOscillator.start();
  }

  // Looping white noise through a band-pass filter for airflow.
  buildWindNoise(ctx) {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSource.start();
  }

  // Called every frame while flying: pitch rises with throttle, volume
  // with throttle, wind with airspeed.
  setFlightSound(throttle, speedKnots) {
    if (!this.started || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    const rpm = 58 + throttle * 82;
    this.engineOscillator.frequency.setTargetAtTime(rpm, now, 0.08);
    this.engineSubOscillator.frequency.setTargetAtTime(rpm * 0.5, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, now, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.1, now, 0.1);
    const windLevel = Math.min(0.16, Math.max(0, speedKnots - 25) * 0.0016);
    this.windGain.gain.setTargetAtTime(windLevel, now, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speedKnots * 6, now, 0.15);
  }

  // Silence the engine and wind, e.g. on the title screen or after a crash.
  silenceFlightSound() {
    if (!this.started || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.engineGain.gain.setTargetAtTime(0, now, 0.1);
    this.windGain.gain.setTargetAtTime(0, now, 0.1);
  }

  // A short two-note chime when the plane threads a ring.
  playRingChime() {
    if (!this.started) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      const start = now + index * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  // A soft thud plus a low settle tone for a touchdown.
  playLandingThud(soft) {
    if (!this.started) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(soft ? 0.25 : 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // A burst of filtered noise and a falling boom for a crash.
  playCrashSound() {
    if (!this.started) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const length = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(120, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.45, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + 0.7);
  }

  // A tiny UI blip for button presses and screen changes.
  playClickBlip() {
    if (!this.started) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // Toggle mute; returns the new muted state.
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.55,
        this.audioContext.currentTime,
        0.05,
      );
    }
    return this.muted;
  }
}
