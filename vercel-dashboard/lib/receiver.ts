import { z } from 'zod';
import { makeSnapshot, telemetrySchema } from './telemetry.ts';

const storedSnapshot = z.object({
  data: telemetrySchema.nullable(),
  receivedAt: z.number().int().nonnegative().nullable(),
}).refine(s => (s.data === null) === (s.receivedAt === null));

export async function readReceiver(url: string, fetcher: typeof fetch = fetch, now = Date.now) {
  const response = await fetcher(url, {
    cache: 'no-store',
    headers: { 'Accept': 'application/json', 'User-Agent': 'ESP32HTTPClient' },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Receiver unavailable');
  const snapshot = storedSnapshot.parse(await response.json());
  // Recalculate freshness; never turn an old upstream sample into live data.
  return makeSnapshot(snapshot.data, snapshot.receivedAt, now());
}
