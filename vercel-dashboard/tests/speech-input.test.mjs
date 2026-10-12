import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictation, inputError } from '../lib/speech-input.ts';

function setup(options = {}) {
  const texts = [], states = [], notices = [];
  const recognition = {
    starts: 0, stops: 0, aborts: 0,
    start() { this.starts++; }, stop() { this.stops++; }, abort() { this.aborts++; },
  };
  const session = createDictation(recognition, {
    language: 'en', draft: '', onText: text => texts.push(text),
    onState: state => states.push(state), onNotice: notice => notices.push(notice), ...options,
  });
  const result = (...parts) => recognition.onresult?.({ results: parts.map(([text, isFinal]) => ({ isFinal, 0: { transcript: text } })) });
  return { recognition, session, texts, states, notices, result };
}

test('Tamil dictation appends to the draft, replaces interim text, and never duplicates final results', () => {
  const s = setup({ language: 'ta', draft: 'நாளை' });
  assert.equal(s.recognition.lang, 'ta-IN');
  assert.equal(s.recognition.continuous, false);
  assert.equal(s.recognition.interimResults, true);
  s.recognition.onstart();
  s.result(['சென்னை', false]);
  s.result(['சென்னையில் வானிலை எப்படி', true]);
  s.result(['சென்னையில் வானிலை எப்படி', true]);
  s.recognition.onend();
  assert.equal(s.texts.at(-1), 'நாளை சென்னையில் வானிலை எப்படி');
  assert.deepEqual(s.states, ['starting', 'listening', 'idle']);
  assert.equal(s.notices.at(-1), 'ready');
});

test('stop receives the final transcript before releasing the session', () => {
  const s = setup();
  assert.equal(s.recognition.lang, 'en-IN');
  s.result(['weather in', false]);
  s.session.stop();
  s.session.stop();
  assert.equal(s.recognition.stops, 1);
  s.result(['weather in Tambaram tomorrow', true]);
  s.recognition.onend();
  assert.equal(s.texts.at(-1), 'weather in Tambaram tomorrow');
  assert.equal(s.states.at(-1), 'idle');
});

test('cancel preserves confirmed words and rejects saved late callbacks', () => {
  const s = setup({ draft: 'Trip to' });
  s.result(['Madurai', true], ['tomorr', false]);
  const late = s.recognition.onresult;
  s.session.cancel();
  assert.equal(s.texts.at(-1), 'Trip to Madurai');
  const count = s.texts.length;
  late({ results: [{ isFinal: true, 0: { transcript: 'stale overwrite' } }] });
  assert.equal(s.texts.length, count);
  assert.equal(s.recognition.aborts, 1);
  assert.equal(s.recognition.onresult, null);
});

test('permission denial and no speech retain the typed draft', () => {
  for (const [error, notice] of [['not-allowed', 'not-allowed'], ['no-speech', 'empty'], ['network', 'network']]) {
    const s = setup({ draft: 'My plan' });
    s.result(['unfinished', false]);
    s.recognition.onerror({ error });
    assert.equal(s.texts.at(-1), 'My plan');
    assert.equal(s.notices.at(-1), notice);
    assert.equal(s.states.at(-1), 'idle');
    assert.equal(s.recognition.aborts, 1);
  }
  assert.equal(inputError('service-not-allowed'), 'not-allowed');
  assert.equal(inputError('language-not-supported'), 'language-not-supported');
});

test('length limit stops recognition and reports truncation', () => {
  const s = setup();
  s.result(['a'.repeat(700), true]);
  assert.equal(s.texts.at(-1).length, 600);
  assert.equal(s.recognition.stops, 1);
  s.recognition.onend();
  assert.equal(s.notices.at(-1), 'limit');
});

test('duration cap and missing end event abort the mic and restore the UI', async () => {
  const s = setup({ maxDurationMs: 5, finishTimeoutMs: 5 });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(s.recognition.stops, 1);
  assert.equal(s.recognition.aborts, 1);
  assert.equal(s.states.at(-1), 'idle');
});

test('synchronous browser start failure releases the session', () => {
  const states = [], notices = [];
  let aborted = false;
  createDictation({ start() { throw new DOMException('Denied', 'NotAllowedError'); }, abort() { aborted = true; } }, {
    language: 'en', draft: '', onText() {}, onState: s => states.push(s), onNotice: n => notices.push(n),
  });
  assert.deepEqual(states, ['starting', 'idle']);
  assert.deepEqual(notices, ['not-allowed']);
  assert.equal(aborted, true);
});
