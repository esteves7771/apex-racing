import { projectRoute, tunnelAt as canyonTunnelAt } from '../track/CanyonCarnival';
import { trackId, activeTrack, coast, nearestTrack } from '../track/ActiveTrack';
import { RivalAudioController } from './RivalAudioController';
import { race, telemetry, useGame } from '../game/store';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { themeFor } from './AudioState';
import { MusicManager } from './MusicManager';
import { SoundEffectManager, type Sound } from './SoundEffectManager';
import { VehicleAudioController } from './VehicleAudioController';
export class AudioManager {
  context?: AudioContext;
  music?: MusicManager;
  sfx?: SoundEffectManager;
  vehicle?: VehicleAudioController;
  buses?: Record<'master' | 'music' | 'vehicle' | 'sfx' | 'ambient', GainNode>;
  interval?: ReturnType<typeof setInterval>;
  ambient?: AudioBufferSourceNode;
  ambientFilter?: BiquadFilterNode;
  tunnelDelay?: DelayNode;
  tunnelWet?: GainNode;
  jungleVoice?: OscillatorNode;
  jungleGain?: GainNode;
  lastChirp = -10;
  environment = { tunnel: false, jungle: false, coastal: false };
  private tunnelTarget = -1;
  unlocked = false;
  focused = true;
  creations = 0;
  lastPhase = '';
  lastCount = 0;
  lastRun = -1;
  lastJump = 0;
  lastLanding = 0;
  lastBoost = 0;
  lastBoostEnd = 0;
  lastMusicTime = 0;
  rivals?: RivalAudioController;
  lastCupPosition = 0;
  lastCarImpact = -100;
  unlock() {
    try {
      if (!this.context) {
        const ctx = (this.context = new AudioContext());
        this.creations++;
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        const bus = () => {
          const n = ctx.createGain();
          n.gain.value = 0;
          n.connect(master);
          return n;
        };
        this.buses = { master, music: bus(), vehicle: bus(), sfx: bus(), ambient: bus() };
        this.music = new MusicManager(ctx, this.buses.music);
        this.sfx = new SoundEffectManager(ctx, this.buses.sfx);
        this.vehicle = new VehicleAudioController(ctx, this.buses.vehicle);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
          data = buffer.getChannelData(0);
        let seed = 41;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[i] = ((seed / 4294967296) * 2 - 1) * 0.025;
        }
        this.ambient = ctx.createBufferSource();
        this.ambient.buffer = buffer;
        this.ambient.loop = true;
        this.ambientFilter = ctx.createBiquadFilter();
        this.ambientFilter.type = 'lowpass';
        this.ambientFilter.frequency.value = 650;
        this.ambient.connect(this.ambientFilter);
        this.ambientFilter.connect(this.buses.ambient);
        this.ambient.start();
        this.tunnelDelay = ctx.createDelay(0.3);
        this.tunnelDelay.delayTime.value = 0.115;
        this.tunnelWet = ctx.createGain();
        this.tunnelWet.gain.value = 0;
        this.buses.vehicle.connect(this.tunnelDelay);
        this.tunnelDelay.connect(this.tunnelWet);
        this.tunnelWet.connect(this.buses.ambient);
      }
      this.unlocked = true;
      this.update();
    } catch {
      /* Audio is optional on browsers without an available output device. */
    }
  }
  play(sound: Sound, strength = 1) {
    if (this.context?.state === 'running' && !useGame.getState().save.settings.muted)
      this.sfx?.play(sound, strength);
  }
  update() {
    const ctx = this.context,
      b = this.buses;
    if (!ctx || !b) return;
    const isCanyon = trackId === 'canyon';
    const s = useGame.getState().save.settings,
      blocked = race.phase === 'PAUSED' || document.hidden || !this.focused;
    if (blocked || s.muted || s.master === 0) {
      b.master.gain.cancelScheduledValues(ctx.currentTime);
      b.master.gain.setValueAtTime(0, ctx.currentTime);
      this.vehicle?.update(false, 0, false, false, 0, getVehicle(s.vehicle));
      if (ctx.state === 'running') void ctx.suspend().catch(() => {});
      return;
    }
    if (ctx.state === 'suspended' && this.unlocked) void ctx.resume().catch(() => {});
    b.master.gain.setTargetAtTime(s.master, ctx.currentTime, 0.03);
    for (const [name, value] of [
      ['music', s.music],
      ['vehicle', s.vehicleVolume * (isCanyon ? 0.82 : 1)],
      ['sfx', s.sfx],
      ['ambient', s.ambient],
    ] as const)
      b[name].gain.setTargetAtTime(value, ctx.currentTime, 0.05);
    const dt = Math.min(0.25, Math.max(0, ctx.currentTime - this.lastMusicTime));
    this.lastMusicTime = ctx.currentTime;
    const theme = themeFor(race.phase === 'FINISHING' ? 'RESULTS' : race.phase, race.mode, trackId),
      isCoast = trackId === 'coast';
    this.music?.update(
      theme,
      Math.abs(telemetry.speed),
      dt,
      race.phase === 'RACING' &&
        (activeTrack.format === 'sprint'
          ? telemetry.courseProgress > 0.85
          : race.laps.length === 2),
    );
    const t = isCanyon
        ? telemetry.courseProgress
        : isCoast
          ? nearestTrack(telemetry.x, telemetry.z).t
          : 0,
      canyonNear = isCanyon
        ? projectRoute(telemetry.x, telemetry.z, undefined, telemetry.courseRoute)
        : undefined,
      inTunnel =
        (isCoast && !!coast.tunnelAt(t)) ||
        (!!canyonNear && !!canyonTunnelAt(canyonNear.t, canyonNear.route));
    const festival = isCanyon && (t < 0.12 || t > 0.88);
    this.environment = {
      tunnel: inTunnel,
      jungle: isCoast && t > 0.64 && t < 0.83,
      coastal: isCoast,
    };
    const wet = inTunnel && race.phase === 'RACING' ? 0.22 : 0;
    if (wet !== this.tunnelTarget && this.tunnelWet) {
      this.tunnelTarget = wet;
      this.tunnelWet.gain.cancelScheduledValues(ctx.currentTime);
      this.tunnelWet.gain.setTargetAtTime(wet, ctx.currentTime, 0.2);
    }
    if (this.ambientFilter) {
      this.ambientFilter.frequency.setTargetAtTime(
        isCanyon
          ? t > 0.42 && t < 0.58
            ? 2100
            : 500 + Math.min(900, Math.abs(telemetry.speed) * 14)
          : isCoast
            ? inTunnel
              ? 320
              : t > 0.64 && t < 0.83
                ? 1800
                : 950 + Math.sin(ctx.currentTime * 0.7) * 300
            : 650,
        ctx.currentTime,
        0.2,
      );
    }
    if (
      ((isCoast && t > 0.64 && t < 0.83) || festival) &&
      race.phase === 'RACING' &&
      !this.jungleVoice &&
      ctx.currentTime - this.lastChirp > (festival ? 8 : 4.5)
    ) {
      // One distant festival horn or bird phrase, bounded on the shared audio clock.
      const voice = ctx.createOscillator(),
        gain = ctx.createGain(),
        now = ctx.currentTime;
      voice.type = festival ? 'triangle' : 'sine';
      voice.frequency.setValueAtTime(festival ? 330 : 1150, now);
      voice.frequency.exponentialRampToValueAtTime(festival ? 440 : 1900, now + 0.07);
      voice.frequency.exponentialRampToValueAtTime(festival ? 330 : 980, now + 0.19);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(festival ? 0.014 : 0.025, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      voice.connect(gain);
      gain.connect(b.ambient);
      this.jungleVoice = voice;
      this.jungleGain = gain;
      this.lastChirp = now;
      voice.onended = () => {
        voice.disconnect();
        gain.disconnect();
        if (this.jungleVoice === voice) {
          this.jungleVoice = undefined;
          this.jungleGain = undefined;
        }
      };
      voice.start(now);
      voice.stop(now + 0.24);
    }

    this.vehicle?.update(
      ['RACING', 'FINISHING'].includes(race.phase),
      telemetry.speed,
      telemetry.drift,
      telemetry.airborne,
      telemetry.steering,
      getVehicle(s.vehicle),
    );
    if (this.lastRun !== race.runId) {
      this.lastRun = race.runId;
      this.lastCount = 0;
      this.lastJump = telemetry.jumpCount;
      this.lastLanding = telemetry.landingSerial;
      this.lastBoost = telemetry.boostSerial;
      this.lastBoostEnd = telemetry.boostExpiredSerial;
    }
    if (isCanyon && race.phase === 'RACING') {
      // Reuse the ambient buffer/filter for canyon wind, waterfall wash and airborne rush.
      const waterfall = t > 0.42 && t < 0.58;
      b.ambient.gain.setTargetAtTime(
        s.ambient *
          (waterfall ? 1.5 : telemetry.airborne || telemetry.boostRemaining > 0 ? 1.25 : 0.85),
        ctx.currentTime,
        0.18,
      );
      if (this.lastBoost !== telemetry.boostSerial) this.play('boost');
      if (this.lastBoostEnd !== telemetry.boostExpiredSerial) this.play('boostEnd', 0.55);
    }
    this.lastBoost = telemetry.boostSerial;
    this.lastBoostEnd = telemetry.boostExpiredSerial;
    const cupActive =
      race.mode === 'gp' &&
      (['COUNTDOWN', 'RACING', 'FINISHING'].includes(race.phase) ||
        (race.phase === 'RESULTS' && !race.gp.completed));
    if (cupActive && !this.rivals) this.rivals = new RivalAudioController(ctx, b.vehicle);
    if (!cupActive && this.rivals) {
      this.rivals.dispose();
      this.rivals = undefined;
    }
    this.rivals?.update();
    if (cupActive && race.phase === 'RACING') {
      if (this.lastCupPosition && this.lastCupPosition !== race.gp.position) {
        this.play(race.gp.position < this.lastCupPosition ? 'positionUp' : 'positionDown');
        if (race.gp.position < this.lastCupPosition) this.play('pass', 0.35);
      }
      this.lastCupPosition = race.gp.position;
      if (race.gp.pendingImpact > 2 && ctx.currentTime - this.lastCarImpact > 0.7) {
        this.play('carImpact', Math.min(1, race.gp.pendingImpact / 20));
        this.lastCarImpact = ctx.currentTime;
      }
      race.gp.pendingImpact = 0;
    } else this.lastCupPosition = 0;
    const count = Math.ceil(race.countdown);
    if (race.phase === 'COUNTDOWN' && count !== this.lastCount) {
      this.play('countdown');
      this.lastCount = count;
    }
    if (race.phase !== this.lastPhase) {
      if (race.phase === 'RACING' && this.lastPhase === 'COUNTDOWN') this.play('start');
      if (race.phase === 'FINISHING') this.play('finish');
      if (race.phase === 'RESULTS')
        this.play(
          race.mode === 'gp' && race.gp.position <= 3
            ? 'podium'
            : race.newRecord
              ? 'best'
              : 'finish',
        );
      this.lastPhase = race.phase;
    }
    if (this.lastJump !== telemetry.jumpCount) {
      this.lastJump = telemetry.jumpCount;
      if (race.phase === 'RACING') this.play('jump');
    }
    if (this.lastLanding !== telemetry.landingSerial) {
      this.lastLanding = telemetry.landingSerial;
      if (race.phase === 'RACING') this.play('landing', telemetry.landingStrength);
    }
  }
  install() {
    const gesture = (event: Event) => {
      if (event instanceof KeyboardEvent && event.repeat) return;
      this.unlock();
      const el = (event.target as HTMLElement)?.closest?.('button');
      if (el) this.play(el.closest('.garage-content') ? 'garage' : 'menu');
    };
    const visibility = () => this.update(),
      blur = () => {
        this.focused = false;
        this.update();
      },
      focus = () => {
        this.focused = true;
        this.update();
      };
    document.addEventListener('pointerdown', gesture);
    document.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('pagehide', blur);
    window.addEventListener('pageshow', focus);
    this.interval = setInterval(() => this.update(), 50);
    return () => {
      document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', blur);
      window.removeEventListener('pageshow', focus);
      this.dispose();
    };
  }
  diagnostics() {
    return {
      initialized: !!this.context,
      state: this.context?.state ?? 'locked',
      creations: this.creations,
      theme: this.music?.theme,
      pending: this.music?.pending,
      voices: this.sfx?.voices.size ?? 0,
      loops: this.music?.active.length ?? 0,
      vehicleGain: this.vehicle?.engineGain.gain.value ?? 0,
      buses: this.buses
        ? Object.fromEntries(
            Object.entries(this.buses).map(([k, v]) => [
              k,
              this.context?.state === 'running' ? v.gain.value : 0,
            ]),
          )
        : {},
    };
  }
  dispose() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    this.rivals?.dispose();
    this.rivals = undefined;
    this.music?.dispose();
    this.sfx?.dispose();
    this.vehicle?.dispose();
    this.ambient?.stop();
    this.ambient?.disconnect();
    this.ambientFilter?.disconnect();
    this.tunnelDelay?.disconnect();
    this.tunnelWet?.disconnect();
    this.jungleVoice?.stop();
    this.jungleVoice?.disconnect();
    this.jungleGain?.disconnect();
    this.jungleVoice = undefined;
    this.jungleGain = undefined;
    this.lastChirp = -10;
    this.tunnelTarget = -1;
    this.environment = { tunnel: false, jungle: false, coastal: false };
    if (this.buses) for (const b of Object.values(this.buses)) b.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.buses = undefined;
    this.music = undefined;
    this.vehicle = undefined;
    this.sfx = undefined;
    this.unlocked = false;
    this.lastMusicTime = 0;
    this.lastRun = -1;
    this.lastPhase = '';
  }
}
export const audioManager = new AudioManager();
