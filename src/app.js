import { Pomodoro } from './timer-core.js';

const MODES = ['focus', 'short', 'long'];
const LABELS = { focus: 'focus', short: 'short break', long: 'long break' };
const HEADINGS = { focus: 'Time to focus', short: 'Take a short break', long: 'Room to recharge' };

export function mountApp({ document: doc = document, window: win = window, now = Date.now } = {}) {
  const el = id => doc.getElementById(id);
  const STORAGE_KEY = 'pomodoro.timer.v1';
  let saved = null;
  let storageAvailable = true;
  function storageWarning() {
    storageAvailable = false;
    el('storage-notice').textContent = 'Browser storage unavailable. The timer works, but changes will not survive a reload.';
  }
  try { saved = win.localStorage.getItem(STORAGE_KEY); } catch { storageWarning(); }
  const timer = new Pomodoro({ now, saved });
  let previous = { ...timer.state };
  let audio;
  function prepareAudio() {
    try {
      const Context = win.AudioContext || win.webkitAudioContext;
      if (!Context) throw new Error('Audio unsupported');
      audio ||= new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {
        el('sound-message').textContent = 'Sound blocked by browser. Preview the chime to retry.';
      });
      return true;
    } catch {
      el('sound-message').textContent = 'Sound unavailable in this browser.';
      return false;
    }
  }
  function chime() {
    if (!audio) return;
    try {
      const gain = audio.createGain(); const tone = audio.createOscillator();
      gain.gain.setValueAtTime(0.12, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
      tone.frequency.setValueAtTime(660, audio.currentTime);
      tone.connect(gain); gain.connect(audio.destination);
      tone.start(audio.currentTime); tone.stop(audio.currentTime + 0.8);
    } catch { el('sound-message').textContent = 'Could not play sound.'; }
  }
  el('sound-test').addEventListener('click', () => { if (prepareAudio()) chime(); });
  el('sound-toggle').addEventListener('change', () => {
    if (el('sound-toggle').checked && prepareAudio()) el('sound-message').textContent = 'Completion sound enabled for this tab.';
    else el('sound-message').textContent = 'Sound is off. No surprises.';
  });
  let lastPersisted = '';
  function persist(state) {
    // A running deadline is stable; do not write storage four times a second.
    const signature = JSON.stringify({ ...state, remainingMs: state.running ? null : state.remainingMs });
    if (signature !== lastPersisted && storageAvailable) {
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch { storageWarning(); }
      lastPersisted = signature;
    }
  }
  function render() {
    const state = timer.snapshot();
    if (previous.running && previous.deadline <= now() && !state.running && previous.mode !== state.mode) {
      if (el('sound-toggle').checked && audio) chime();
      el('announcement').textContent = `${LABELS[previous.mode][0].toUpperCase() + LABELS[previous.mode].slice(1)} complete. ${HEADINGS[state.mode]}. Start when you are ready.`;
    }
    previous = state;
    persist(state);
    const totalSeconds = Math.ceil(state.remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    el('timer').textContent = text;
    el('timer').setAttribute('aria-label', `${minutes} minutes ${seconds} seconds remaining`);
    el('mode-label').textContent = HEADINGS[state.mode];
    const paused = !state.running && state.remainingMs < state.durations[state.mode] * 60_000;
    el('status').textContent = state.running ? 'Running' : paused ? 'Paused' : 'Ready';
    el('start-pause').textContent = state.running ? 'Pause' : paused ? 'Resume' : `Start ${LABELS[state.mode]}`;
    el('start-pause').setAttribute('aria-label', state.running ? 'Pause timer' : paused ? 'Resume timer' : `Start ${LABELS[state.mode]}`);
    el('timer-progress').value = 1 - state.remainingMs / (state.durations[state.mode] * 60_000);
    el('session-count').textContent = `${state.completedFocus} ${state.completedFocus === 1 ? 'session' : 'sessions'}`;
    el('cycle-progress').textContent = `${state.completedFocus % 4} / 4 until a long break`;
    for (const mode of MODES) el(`mode-${mode}`).setAttribute('aria-pressed', mode === state.mode);
    doc.title = `${text} · ${LABELS[state.mode]} — Pomodoro`;
    return state;
  }
  function toggle() { timer.state.running ? timer.pause() : timer.start(); render(); }
  el('start-pause').addEventListener('click', toggle);
  el('reset').addEventListener('click', () => { timer.reset(); render(); });
  for (const mode of MODES) el(`mode-${mode}`).addEventListener('click', () => { timer.selectMode(mode); render(); });
  for (const mode of MODES) el(`duration-${mode}`).value = timer.state.durations[mode];
  el('duration-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const durations = Object.fromEntries(MODES.map(mode => [mode, Number(el(`duration-${mode}`).value)]));
      timer.setDurations(durations);
      el('settings-message').textContent = 'Lengths saved. Timer reset.';
      render();
    } catch {
      el('settings-message').textContent = 'Use whole minutes from 1 to 180 for each session.';
    }
  });
  doc.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.closest?.('input,textarea,select,button,a,[contenteditable="true"]')) return;
    if (event.code === 'Space') { event.preventDefault(); toggle(); }
    else if (event.code === 'KeyR') { event.preventDefault(); timer.reset(); render(); }
  });
  render();
  const interval = win.setInterval(render, 250);
  return { timer, render, destroy: () => win.clearInterval(interval) };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountApp();
