'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDictation, type InputNotice, type InputState, type RecognitionConstructor } from '../lib/speech-input';

const notices: Record<InputNotice, [string, string]> = {
  ready: ['Captured! Check the place and date, then press Send.', 'பேச்சு பதிவானது! இடத்தையும் தேதியையும் சரிபார்த்து அனுப்பவும்.'],
  empty: ['No clear speech was captured. Tap the mic and try again.', 'தெளிவான பேச்சு பதிவாகவில்லை. மைக்கை அழுத்தி மீண்டும் பேசவும்.'],
  cancelled: ['Microphone stopped. You can edit your question.', 'மைக் நிறுத்தப்பட்டது. கேள்வியைத் திருத்தலாம்.'],
  limit: ['600-character limit reached. Review your question before sending.', '600 எழுத்து வரம்பை எட்டியது. கேள்வியைச் சரிபார்த்து அனுப்பவும்.'],
  'not-allowed': ['Microphone access was blocked. Allow it in your browser’s site settings, then try again.', 'மைக் அனுமதி மறுக்கப்பட்டது. உலாவியின் தள அமைப்புகளில் மைக்கை அனுமதித்து மீண்டும் முயற்சிக்கவும்.'],
  'audio-capture': ['No working microphone found. Check your microphone connection and device settings.', 'மைக் கிடைக்கவில்லை. மைக் இணைப்பையும் சாதன அமைப்புகளையும் சரிபார்க்கவும்.'],
  network: ['The browser’s speech service could not connect. Check your internet or type your question.', 'உலாவியின் பேச்சுச் சேவையை இணைக்க முடியவில்லை. இணையத்தைச் சரிபார்க்கவும் அல்லது கேள்வியைத் தட்டச்சு செய்யவும்.'],
  'language-not-supported': ['This browser’s speech service does not support the selected language. Try another browser or type your question.', 'தேர்ந்தெடுத்த மொழியை இந்த உலாவியின் பேச்சுச் சேவை ஆதரிக்கவில்லை. வேறு உலாவியைப் பயன்படுத்தவும் அல்லது தட்டச்சு செய்யவும்.'],
  failed: ['Voice input could not start. Try another browser or type your question.', 'குரல் உள்ளீட்டைத் தொடங்க முடியவில்லை. வேறு உலாவியைப் பயன்படுத்தவும் அல்லது தட்டச்சு செய்யவும்.'],
};

export function useDictation(language: 'en' | 'ta', draft: string, onText: (text: string) => void) {
  const [support, setSupport] = useState<'checking' | 'supported' | 'unsupported' | 'insecure'>('checking');
  const [state, setState] = useState<InputState>('idle');
  const [notice, setNotice] = useState<InputNotice>();
  const constructor = useRef<RecognitionConstructor | undefined>(undefined);
  const session = useRef<ReturnType<typeof createDictation> | undefined>(undefined);
  const mounted = useRef(false);
  const cancel = useCallback(() => { session.current?.cancel(); session.current = undefined; }, []);
  useEffect(() => {
    mounted.current = true;
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    constructor.current = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    setSupport(!window.isSecureContext ? 'insecure' : constructor.current ? 'supported' : 'unsupported');
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => { mounted.current = false; cancel(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', cancel); };
  }, [cancel]);
  useEffect(() => { cancel(); setNotice(undefined); }, [language, cancel]);

  function start() {
    if (!constructor.current || support !== 'supported') return;
    cancel(); setNotice(undefined);
    try {
      session.current = createDictation(new constructor.current(), {
        language, draft,
        onText: text => { if (mounted.current) onText(text); },
        onState: next => { if (mounted.current) setState(next); },
        onNotice: next => { if (mounted.current) setNotice(next); },
      });
    } catch { setState('idle'); setNotice('failed'); }
  }
  const ta = language === 'ta';
  let note = notice ? notices[notice][ta ? 1 : 0] : '';
  if (support === 'unsupported') note = ta ? 'இந்த உலாவியில் குரல் உள்ளீடு இல்லை. Chrome அல்லது Safari-இல் முயற்சிக்கவும்; தட்டச்சும் செய்யலாம்.' : 'Voice input is unavailable in this browser. Try Chrome or Safari, or type your question.';
  if (support === 'insecure') note = ta ? 'குரல் உள்ளீட்டிற்கு HTTPS இணையதளத்தைத் திறக்கவும்.' : 'Open the HTTPS website to use microphone input.';
  if (state === 'starting') note = ta ? 'மைக் அனுமதியை வழங்கவும்…' : 'Starting microphone… allow access if prompted.';
  if (state === 'listening') note = ta ? 'கேட்கிறேன்… தமிழில் இடத்தையும் தேதியையும் சொல்லுங்கள். முடிக்க மைக்கை அழுத்தவும்.' : 'Listening… say a place and date in English. Tap the mic to finish.';
  if (state === 'finishing') note = ta ? 'உங்கள் பேச்சை எழுத்தாக்குகிறேன்…' : 'Finishing your transcript…';
  return { start, stop: () => session.current?.stop(), cancel, note, state, active: state !== 'idle', supported: support === 'supported' };
}
