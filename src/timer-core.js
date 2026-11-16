export const DEFAULT_DURATIONS = Object.freeze({ focus: 25, short: 5, long: 15 });
function validDurations(durations) {
  return durations && Object.keys(DEFAULT_DURATIONS).every(mode =>
    Number.isInteger(durations[mode]) && durations[mode] >= 1 && durations[mode] <= 180);
}
function validState(state) {
  return state && state.version === 1 && Object.hasOwn(DEFAULT_DURATIONS, state.mode)
    && typeof state.running === 'boolean' && validDurations(state.durations)
    && Number.isSafeInteger(state.completedFocus) && state.completedFocus >= 0
    && Number.isFinite(state.remainingMs) && state.remainingMs >= 0
    && state.remainingMs <= state.durations[state.mode] * 60_000
    && (state.running ? Number.isFinite(state.deadline) && state.deadline >= 0 : state.deadline === null);
}
export class Pomodoro {
  constructor({ now = Date.now, saved = null } = {}) {
    this.now = now;
    this.state = { version: 1, mode: 'focus', running: false, remainingMs: 1_500_000,
      deadline: null, completedFocus: 0, durations: { ...DEFAULT_DURATIONS } };
    try {
      const candidate = JSON.parse(saved);
      if (validState(candidate)) this.state = { ...candidate, durations: { ...candidate.durations } };
    } catch { /* Corrupt or unavailable saved state: use safe defaults. */ }
  }
  serialize() { return JSON.stringify(this.snapshot()); }
  start() {
    if (!this.state.running) {
      this.state.running = true;
      this.state.deadline = this.now() + this.state.remainingMs;
    }
  }
  pause() {
    this.state.remainingMs = this.snapshot().remainingMs;
    this.state.running = false;
    this.state.deadline = null;
  }
  setDurations(durations) {
    if (!validDurations(durations)) throw new RangeError('Durations must be whole minutes from 1 to 180');
    this.state.durations = { focus: durations.focus, short: durations.short, long: durations.long };
    this.reset();
  }
  selectMode(mode) {
    if (!Object.hasOwn(DEFAULT_DURATIONS, mode)) throw new RangeError('Invalid mode');
    this.state.mode = mode;
    this.reset();
  }
  reset() {
    this.state.running = false;
    this.state.deadline = null;
    this.state.remainingMs = this.state.durations[this.state.mode] * 60_000;
  }
  snapshot() {
    if (this.state.running) {
      this.state.remainingMs = Math.max(0, this.state.deadline - this.now());
      if (this.state.remainingMs === 0) {
        if (this.state.mode === 'focus') {
          this.state.completedFocus += 1;
          this.selectMode(this.state.completedFocus % 4 === 0 ? 'long' : 'short');
        } else this.selectMode('focus');
      }
    }
    return { ...this.state, durations: { ...this.state.durations } };
  }
}
