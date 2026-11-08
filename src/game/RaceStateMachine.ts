import { checkpoints } from '../track/ActiveTrack';
export type Phase =
  | 'MENU'
  | 'MODE_SELECT'
  | 'COUNTDOWN'
  | 'RACING'
  | 'FINISHING'
  | 'PAUSED'
  | 'RESULTS';
import { modeDefinitions } from './Modes';
import { challengeRules } from './ChallengeRules';
import { GrandPrixDirector } from './GrandPrix';
import type { Difficulty } from '../ai/RacingAI';
import type { VehicleId } from '../vehicle/VehicleRegistry';
export type Mode = 'time' | 'free' | 'challenge' | 'gp';
export class Race {
  gp = new GrandPrixDirector();
  runId = 0;
  phase: Phase = 'MENU';
  mode: Mode = 'time';
  previousPhase: Phase = 'RACING';
  countdown = 3;
  elapsed = 0;
  finishElapsed = 0;
  finishTime: number | null = null;
  get simulationTime() {
    return this.elapsed + this.finishElapsed;
  }
  get cooldownActive() {
    return (
      this.phase === 'FINISHING' ||
      (this.phase === 'RESULTS' &&
        this.finishTime !== null &&
        (this.finishElapsed < 4 || (this.mode === 'gp' && !this.gp.completed)))
    );
  }
  beginFinish(time = this.elapsed) {
    if (this.finishTime !== null) return false;
    this.finishTime = time;
    this.elapsed = time;
    this.finishElapsed = 0;
    this.phase = 'FINISHING';
    return true;
  }
  skipFinish() {
    if (this.phase === 'FINISHING') this.phase = 'RESULTS';
  }
  lapStart = 0;
  laps: number[] = [];
  nextGate = 1;
  safeGate = 0;
  invalid = false;
  message = '';
  hitMessage = '';
  private hitMessageUntil = 0;
  newRecord = false;
  improvement: number | null = null;
  penalties = { cone: 0, barrel: 0, crate: 0 };
  penaltyTime = 0;
  hitIds = new Set<string>();
  private touching = new Set<string>();
  private lastImpact = new Map<string, number>();
  releaseImpact(id: string) {
    this.touching.delete(id);
  }
  get adjustedTime() {
    return this.elapsed + this.penaltyTime;
  }
  impact(id: string, type: 'cone' | 'barrel' | 'crate', speed: number) {
    if (
      this.mode !== 'challenge' ||
      this.phase !== 'RACING' ||
      speed < challengeRules.minimumImpactSpeed ||
      this.touching.has(id) ||
      this.elapsed - (this.lastImpact.get(id) ?? -100) < challengeRules.recontactCooldown
    )
      return false;
    this.touching.add(id);
    this.lastImpact.set(id, this.elapsed);
    this.hitIds.add(id);
    this.penalties[type]++;
    this.penaltyTime += challengeRules.penalties[type];
    this.hitMessage = `${type.toUpperCase()} +${challengeRules.penalties[type]}s`;
    this.hitMessageUntil = this.elapsed + 2.5;
    return true;
  }
  start(mode: Mode, options?: { vehicle: VehicleId; difficulty: Difficulty }) {
    this.runId++;
    this.mode = mode;
    if (mode === 'gp') this.gp.start(options?.vehicle ?? 'sprinter', options?.difficulty ?? 'club');
    this.phase = mode === 'free' ? 'RACING' : 'COUNTDOWN';
    this.penalties = { cone: 0, barrel: 0, crate: 0 };
    this.penaltyTime = 0;
    this.hitIds.clear();
    this.touching.clear();
    this.lastImpact.clear();
    this.countdown = 3;
    this.elapsed = 0;
    this.finishTime = null;
    this.finishElapsed = 0;
    this.lapStart = 0;
    this.laps = [];
    this.nextGate = 1;
    this.safeGate = 0;
    this.invalid = false;
    this.message = '';
    this.hitMessage = '';
    this.hitMessageUntil = 0;
    this.newRecord = false;
    this.improvement = null;
  }
  tick(dt: number) {
    if (this.phase === 'COUNTDOWN') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) this.phase = 'RACING';
    } else if (this.phase === 'RACING' && this.mode !== 'free') {
      this.elapsed += dt;
      if (this.elapsed >= this.hitMessageUntil) this.hitMessage = '';
    } else if (this.cooldownActive) {
      this.finishElapsed += dt;
      if (
        this.phase === 'FINISHING' &&
        this.finishElapsed >= 4 &&
        (this.mode !== 'gp' || this.gp.completed)
      )
        this.phase = 'RESULTS';
    }
  }
  pause() {
    if (this.phase === 'RACING' || this.phase === 'COUNTDOWN' || this.phase === 'FINISHING') {
      this.previousPhase = this.phase;
      this.phase = 'PAUSED';
    }
  }
  resume() {
    if (this.phase === 'PAUSED') this.phase = this.previousPhase;
  }
  invalidate(reason: string) {
    if (this.mode !== 'free') {
      this.invalid = true;
      this.message = reason;
    }
  }
  gate(index: number) {
    if (this.phase !== 'RACING') return;
    if (this.mode === 'free') {
      if (index === this.nextGate) {
        this.safeGate = index;
        this.nextGate = (index + 1) % checkpoints.length;
      }
      return;
    }
    if (index !== this.nextGate) {
      if (index !== this.safeGate) this.invalidate('Missed checkpoint · lap invalid');
      return;
    }
    this.safeGate = index;
    this.nextGate = (index + 1) % checkpoints.length;
    if (index === 0) {
      if (!this.invalid) this.laps.push(this.elapsed - this.lapStart);
      this.lapStart = this.elapsed;
      this.message = this.invalid ? 'Lap discarded · try again' : 'Clean lap';
      this.invalid = false;
      if (this.laps.length === modeDefinitions[this.mode].laps) this.beginFinish();
    }
  }
}
export function formatTime(t: number | null) {
  if (t === null) return '—:——.———';
  const ms = Math.floor(t * 1000 + 0.00001);
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
