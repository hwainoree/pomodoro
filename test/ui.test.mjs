import test from 'node:test';
import assert from 'node:assert/strict';
const ui = await import('../src/app.js');

// A small DOM/event adapter, not a mocked timer: the controller runs the real
// Pomodoro with a controllable wall clock. Browser layout is verified separately.
class Element extends EventTarget {
  constructor(id) { super(); this.id = id; this.textContent = ''; this.value = ''; this.checked = false; this.attrs = {}; this.style = {}; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  closest() { return null; }
  focus() { this.focused = true; }
  fire(type) { const event = new Event(type, { cancelable: true }); this.dispatchEvent(event); return event; }
}
function fixture({ storage = new Map(), saved, storageError = false, AudioContext } = {}) {
  let time = 1_000_000;
  const ids = ['timer','start-pause','reset','mode-focus','mode-short','mode-long','session-count','cycle-progress','status','duration-focus','duration-short','duration-long','duration-form','settings-message','sound-toggle','sound-test','storage-notice','timer-progress','mode-label','announcement','sound-message'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const doc = new EventTarget(); doc.getElementById = id => elements[id]; doc.title = ''; doc.hidden = false;
  const win = new EventTarget(); let tick;
  win.setInterval = fn => { tick = fn; return 1; }; win.clearInterval = () => {};
  win.AudioContext = AudioContext;
  win.localStorage = {
    getItem: key => { if (storageError) throw new Error('blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (storageError) throw new Error('quota'); storage.set(key, value); }
  };
  if (saved) storage.set('pomodoro.timer.v1', saved);
  const app = ui.mountApp({ document: doc, window: win, now: () => time });
  return { app, doc, win, elements, storage, tick: () => tick(), advance: ms => { time += ms; } };
}

test('browser storage restores an overdue focus once and saves the stopped next mode', () => {
  const first = fixture();
  first.elements['start-pause'].fire('click');
  const saved = JSON.parse(first.storage.get('pomodoro.timer.v1') ?? '{}');
  assert.equal(saved.running, true, 'start must persist the deadline');
  assert.equal(saved.deadline, 2_500_000);
  saved.deadline = 999_000;
  first.storage.set('pomodoro.timer.v1', JSON.stringify(saved));
  const restored = fixture({ storage: first.storage });
  assert.equal(restored.elements.timer.textContent, '05:00');
  assert.equal(restored.app.timer.snapshot().completedFocus, 1);
  assert.equal(restored.app.timer.snapshot().running, false);
  assert.match(restored.elements.announcement.textContent, /complete/i);
  const again = fixture({ storage: first.storage });
  assert.equal(again.app.timer.snapshot().completedFocus, 1);
  assert.equal(again.app.timer.snapshot().mode, 'short');
});

test('Pause after the deadline leaves the completed next mode stopped before any tick', () => {
  const f = fixture();
  f.elements['start-pause'].fire('click');
  f.advance(1_500_001);
  // Click the still-rendered Pause button without a tick, render, or snapshot.
  f.elements['start-pause'].fire('click');
  const state = f.app.timer.snapshot();
  assert.equal(state.mode, 'short');
  assert.equal(state.running, false);
  assert.equal(state.completedFocus, 1);
  assert.equal(f.elements['session-count'].textContent, '1 session');
  assert.equal(f.elements.announcement.textContent, 'Focus complete. Take a short break. Start when you are ready.');
  f.tick();
  assert.equal(f.app.timer.snapshot().completedFocus, 1);
  assert.equal(f.app.timer.snapshot().running, false);
});

test('unavailable browser storage keeps timer working with a visible warning', () => {
  let f;
  assert.doesNotThrow(() => { f = fixture({ storageError: true }); });
  assert.match(f.elements['storage-notice'].textContent, /unavailable/i);
  f.elements['start-pause'].fire('click'); f.advance(1000); f.tick();
  assert.equal(f.elements.timer.textContent, '24:59');
});

test('controller renders real initial state and runs button controls', () => {
  assert.equal(typeof ui.mountApp, 'function', 'UI controller must exist');
  const { app, elements: el, advance, tick } = fixture();
  assert.equal(el.timer.textContent, '25:00');
  assert.equal(el['start-pause'].textContent, 'Start focus');
  el['start-pause'].fire('click'); advance(61_000); tick();
  assert.equal(el.timer.textContent, '23:59');
  assert.equal(el['start-pause'].textContent, 'Pause');
  el['start-pause'].fire('click'); advance(120_000); tick();
  assert.equal(el.timer.textContent, '23:59');
  assert.equal(el.status.textContent, 'Paused');
  el.reset.fire('click');
  assert.equal(el.timer.textContent, '25:00');
  el['mode-long'].fire('click');
  assert.equal(el.timer.textContent, '15:00');
  assert.equal(el['mode-long'].getAttribute('aria-pressed'), 'true');
  assert.equal(app.timer.snapshot().running, false);
});


test('duration form validates lengths, resets timer, and persists settings', () => {
  const f = fixture(); const e = f.elements;
  e['duration-focus'].value = '40'; e['duration-short'].value = '8'; e['duration-long'].value = '20';
  e['duration-form'].fire('submit');
  assert.equal(e.timer.textContent, '40:00');
  assert.equal(JSON.parse(f.storage.get('pomodoro.timer.v1')).durations.focus, 40);
  e['duration-focus'].value = '0'; e['duration-form'].fire('submit');
  assert.equal(e.timer.textContent, '40:00');
  assert.match(e['settings-message'].textContent, /1.*180/);
});


test('keyboard shortcuts operate the timer but leave inputs alone', () => {
 const f=fixture();
 function key(code, input=false) {
  const e=new Event('keydown',{cancelable:true});
  Object.defineProperty(e,'code',{value:code}); Object.defineProperty(e,'key',{value:code==='Space'?' ':'r'});
  if(input) Object.defineProperty(e,'target',{value:{closest:()=>({})}});
  f.doc.dispatchEvent(e); return e;
 }
 key('Space'); assert.equal(f.app.timer.snapshot().running,true);
 f.advance(1000); key('Space'); assert.equal(f.elements.status.textContent,'Paused');
 key('KeyR'); assert.equal(f.elements.timer.textContent,'25:00');
 key('Space',true); assert.equal(f.app.timer.snapshot().running,false);
});


test('sound is opt-in and preview/completion schedule a chime', () => {
 let starts=0;
 class Audio {
  currentTime=0; destination={}; state='running';
  resume(){return Promise.resolve();}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){starts++;},stop(){}};}
 }
 const f=fixture({AudioContext:Audio});
 assert.equal(starts,0);
 f.elements['sound-test'].fire('click'); assert.ok(starts>0,'preview must play');
 const before=starts;
 f.elements['sound-toggle'].checked=true; f.elements['sound-toggle'].fire('change');
 f.elements['start-pause'].fire('click'); f.advance(1_500_000); f.tick();
 assert.ok(starts>before,'opted-in completion must play');
});


test('manual mode change does not announce a completed session',()=>{
 const f=fixture();f.elements['start-pause'].fire('click');
 f.elements['mode-short'].fire('click');
 assert.equal(f.app.timer.snapshot().completedFocus,0);
 assert.doesNotMatch(f.elements.announcement.textContent,/complete/i);
});
