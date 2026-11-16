import test from 'node:test';
import assert from 'node:assert/strict';
const core = await import('../src/timer-core.js');
function setup() {
  let time = 1_000_000;
  return { timer: new core.Pomodoro({ now: () => time }), advance: ms => { time += ms; }, now: () => time };
}

test('start and pause use the injected clock and preserve remainder', () => {
  const { timer, advance, now } = setup();
  assert.equal(typeof timer.start, 'function', 'start must exist');
  timer.start();
  assert.equal(timer.snapshot().deadline, now() + 1_500_000);
  advance(12_345);
  assert.equal(timer.snapshot().remainingMs, 1_487_655);
  timer.pause();
  advance(99_000);
  assert.equal(timer.snapshot().remainingMs, 1_487_655);
  assert.equal(timer.snapshot().running, false);
  timer.start();
  assert.equal(timer.snapshot().deadline, now() + 1_487_655);
});

test('reset stops the current mode without counting it', () => {
  const { timer, advance } = setup();
  assert.equal(typeof timer.reset, 'function', 'reset must exist');
  timer.start(); advance(100_000); timer.reset();
  assert.equal(timer.snapshot().remainingMs, 1_500_000);
  assert.equal(timer.snapshot().running, false);
  assert.equal(timer.snapshot().completedFocus, 0);
});

test('mode selection stops and resets only valid modes', () => {
  const { timer, advance } = setup();
  assert.equal(typeof timer.selectMode, 'function', 'mode selection must exist');
  timer.start(); advance(5000); timer.selectMode('short');
  assert.equal(timer.snapshot().remainingMs, 300_000);
  assert.equal(timer.snapshot().running, false);
  timer.selectMode('long');
  assert.equal(timer.snapshot().remainingMs, 900_000);
  const before = timer.snapshot();
  assert.throws(() => timer.selectMode('bogus'), /mode/i);
  assert.deepEqual(timer.snapshot(), before);
});

test('completed focus selects a stopped short break exactly once', () => {
  const { timer, advance } = setup();
  timer.start(); advance(1_500_000);
  assert.equal(timer.snapshot().mode, 'short');
  assert.equal(timer.snapshot().running, false);
  assert.equal(timer.snapshot().deadline, null);
  assert.equal(timer.snapshot().remainingMs, 300_000);
  assert.equal(timer.snapshot().completedFocus, 1);
  advance(999_000_000);
  assert.equal(timer.snapshot().completedFocus, 1);
});

test('completed breaks select focus without counting a focus', () => {
  const { timer, advance } = setup();
  for (const mode of ['short', 'long']) {
    timer.selectMode(mode); timer.start(); advance(timer.snapshot().remainingMs);
    assert.equal(timer.snapshot().mode, 'focus');
    assert.equal(timer.snapshot().running, false);
    assert.equal(timer.snapshot().completedFocus, 0);
  }
});

test('every fourth completed focus selects a long break', () => {
  const { timer, advance } = setup();
  for (let completed = 1; completed <= 8; completed++) {
    timer.selectMode('focus'); timer.start(); advance(1_500_000);
    assert.equal(timer.snapshot().mode, completed % 4 === 0 ? 'long' : 'short');
    assert.equal(timer.snapshot().completedFocus, completed);
    assert.equal(timer.snapshot().running, false);
  }
});

test('validated custom durations reset the current timer atomically', () => {
  const { timer } = setup();
  assert.equal(typeof timer.setDurations, 'function', 'duration settings must exist');
  timer.start(); timer.setDurations({ focus: 30, short: 7, long: 20 });
  assert.equal(timer.snapshot().remainingMs, 1_800_000);
  assert.equal(timer.snapshot().running, false);
  timer.selectMode('short');
  assert.equal(timer.snapshot().remainingMs, 420_000);
  const before = timer.snapshot();
  for (const invalid of [0, -1, 181, 1.5, NaN, Infinity, '', '25', null]) {
    assert.throws(() => timer.setDurations({ focus: invalid, short: 5, long: 15 }), /duration/i);
    assert.deepEqual(timer.snapshot(), before);
  }
  assert.throws(() => timer.setDurations({ focus: 25 }), /duration/i);
  timer.setDurations({ focus: 1, short: 180, long: 1 });
  assert.equal(timer.snapshot().remainingMs, 10_800_000);
});

test('serialized timer restores against a wall-clock deadline', () => {
  const { timer, advance, now } = setup();
  assert.equal(typeof timer.serialize, 'function', 'serialization must exist');
  timer.setDurations({ focus: 2, short: 1, long: 3 }); timer.start();
  const stored = timer.serialize();
  advance(35_500);
  const restored = new core.Pomodoro({ now, saved: stored });
  assert.equal(restored.snapshot().remainingMs, 84_500);
  assert.equal(restored.snapshot().running, true);
  assert.equal(restored.snapshot().deadline, 1_120_000);
  restored.pause();
  const paused = restored.serialize(); advance(900_000);
  assert.equal(new core.Pomodoro({ now, saved: paused }).snapshot().remainingMs, 84_500);
});

test('malformed storage falls back to defaults without throwing', () => {
  const fallback = setup().timer.snapshot();
  const bad = ['not json', 'null', '[]', '{}', 'true', '42'];
  for (const changes of [
    { version: 2 }, { mode: 'other' }, { running: 'yes' }, { completedFocus: -1 },
    { completedFocus: 1.5 }, { durations: { focus: 0, short: 5, long: 15 } },
    { remainingMs: -1 }, { remainingMs: 999_999_999 }, { remainingMs: null },
    { running: true, deadline: null }, { running: false, deadline: 123 }
  ]) bad.push(JSON.stringify({ ...fallback, ...changes }));
  for (const saved of bad) {
    const timer = new core.Pomodoro({ saved, now: () => 1_000_000 });
    assert.deepEqual(timer.snapshot(), fallback, saved);
  }
});

test('starts idle in focus with standard durations', () => {
  assert.equal(typeof core.Pomodoro, 'function', 'timer constructor must exist');
  const { timer } = setup();
  assert.deepEqual(timer.snapshot(), {
    version: 1, mode: 'focus', running: false, remainingMs: 1_500_000,
    deadline: null, completedFocus: 0, durations: { focus: 25, short: 5, long: 15 }
  });
});
