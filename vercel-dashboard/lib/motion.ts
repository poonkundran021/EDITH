// Reach 95% of a received orientation in ~75 ms, independent of display refresh rate.
// Only blend toward real samples: do not extrapolate motion across network gaps.
export function orientationBlend(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  return -Math.expm1(-Math.min(elapsedSeconds, 0.1) / 0.025);
}

// Target four requests/second, including request time; never overlap requests.
// A slow cloud response should not incur another fixed half-second pause.
export function telemetryPollDelay(elapsedMs: number, failures: number, hidden: boolean, demo: boolean): number {
  if (hidden) return 5000;
  if (failures) return Math.min(5000,1000 * 2 ** Math.min(failures - 1, 3));
  return demo ? 250 : Math.max(25,250 - Math.max(0,elapsedMs));
}
