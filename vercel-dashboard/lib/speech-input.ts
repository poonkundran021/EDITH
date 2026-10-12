/** Minimal Web Speech types: browser implementations still use prefixed constructors. */
export type RecognitionResults = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: RecognitionResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => Recognition;
export type InputState = 'idle' | 'starting' | 'listening' | 'finishing';
export type InputNotice = 'ready' | 'empty' | 'cancelled' | 'limit' | 'not-allowed' | 'audio-capture' | 'network' | 'language-not-supported' | 'failed';

export function inputError(error: string): InputNotice {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'not-allowed';
  if (error === 'no-speech') return 'empty';
  if (error === 'aborted') return 'cancelled';
  if (error === 'audio-capture' || error === 'network' || error === 'language-not-supported') return error;
  return 'failed';
}

/** One explicit microphone session. Late callbacks cannot modify a newer draft. */
export function createDictation(recognition: Recognition, options: {
  language: 'en' | 'ta';
  draft: string;
  onText(text: string): void;
  onState(state: InputState): void;
  onNotice(notice: InputNotice): void;
  maxDurationMs?: number;
  finishTimeoutMs?: number;
}) {
  let active = true;
  let finishing = false;
  let confirmed = '';
  let limited = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const combine = (text: string) => [options.draft.trim(), text.trim()].filter(Boolean).join(' ');
  const emit = (text: string) => options.onText(combine(text).slice(0, 600));
  function end(notice: InputNotice, abort = true) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
    if (abort) { try { recognition.abort(); } catch {} }
    emit(confirmed);
    options.onState('idle');
    options.onNotice(limited ? 'limit' : notice);
  }
  function stop() {
    if (!active || finishing) return;
    finishing = true;
    options.onState('finishing');
    clearTimeout(timer);
    // Some engines never deliver onend after stop; always release the UI and mic.
    timer = setTimeout(() => end(confirmed ? 'ready' : 'empty'), options.finishTimeoutMs ?? 2500);
    try { recognition.stop(); } catch { end(confirmed ? 'ready' : 'empty'); }
  }
  recognition.lang = options.language === 'ta' ? 'ta-IN' : 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => { if (active && !finishing) options.onState('listening'); };
  recognition.onresult = event => {
    if (!active) return;
    // The event contains the session's full result list; replacing it avoids duplicates.
    const finals: string[] = [], interim: string[] = [];
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      (result.isFinal ? finals : interim).push(result[0].transcript);
    }
    confirmed = finals.join(' ');
    emit([...finals, ...interim].join(' '));
    if (combine(confirmed).length >= 600) { limited = true; stop(); }
  };
  recognition.onerror = event => { if (active) end(inputError(event.error)); };
  recognition.onend = () => end(confirmed.trim() ? 'ready' : 'empty', false);
  options.onState('starting');
  timer = setTimeout(stop, options.maxDurationMs ?? 30000);
  try { recognition.start(); } catch (error) {
    end(error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'not-allowed' : 'failed');
  }
  return { stop, cancel: () => end('cancelled') };
}
