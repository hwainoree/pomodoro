import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = name => readFile(new URL('../src/' + name, import.meta.url), 'utf8').catch(() => '');

test('static surface exposes labelled keyboard-accessible controls and responsive styling', async () => {
  const html = await load('index.html');
  assert.match(html, /<html lang="en">/, 'accessible HTML must exist');
  for (const id of ['timer','start-pause','reset','mode-focus','mode-short','mode-long','session-count','cycle-progress','status','duration-focus','duration-short','duration-long','duration-form','settings-message','sound-toggle','sound-test','storage-notice','timer-progress','mode-label']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const mode of ['focus','short','long']) assert.match(html, new RegExp(`for="duration-${mode}"`));
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /type="module" src="\.\/app.js"/);
  const css = await load('styles.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media/);
  assert.match(css, /tabular-nums/);
  assert.doesNotMatch(html + css, /https?:\/\//, 'surface must not load remote resources');
});
