EDITH local speech fallback

The eSpeak NG worker and voice data are GPL-3.0-or-later software.
Copyright belongs to the eSpeak/eSpeak NG contributors, Eitan Isaacson,
and Alberto Pettarin. The files are unmodified upstream assets.
License: /speech/COPYING.txt

Distribution: espeakng.js 1.49.1, downloaded from the CDN linked by upstream:
https://cdn.jsdelivr.net/espeakng.js/1.49.1/espeakng.min.js
https://cdn.jsdelivr.net/espeakng.js/1.49.1/espeakng.worker.js
https://cdn.jsdelivr.net/espeakng.js/1.49.1/espeakng.worker.data

Upstream distribution: https://github.com/pettarin/espeakng.js-cdn
Port source and build instructions:
https://github.com/pettarin/espeak-ng/tree/864d17c7b296067e55a07bfa7902081c4536ca17/emscripten
Complete source archive supplied here at no charge:
/speech/espeak-ng-source.tar.gz
The Emscripten Makefile, C++/IDL glue and build instructions are in emscripten/.

EDITH's readable worker adapter is GPL-3.0-or-later and is available at:
https://github.com/poonkundran021/EDITH/blob/main/vercel-dashboard/lib/local-speech.ts

Fallback speech runs entirely in the browser and sounds synthetic.
The engine/voice data download only when local fallback speech is requested;
the source archive is a separate optional download.
