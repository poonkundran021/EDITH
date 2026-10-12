import { z } from "zod";
const number = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
export const telemetrySchema = z.object({
  device: z.literal("edith-01"),
  boot: z.string().regex(/^[a-zA-Z0-9-]{1,40}$/),
  seq: z.number().int().min(0).max(4294967295),
  capturedAt: z.number().int().min(1700000000000).max(9999999999999),
  location: z.string().trim().min(1).max(80),
  temperature: number(-40, 85), humidity: number(0, 100), pressure: number(300, 1100),
  gas: number(0, 4095), smoke: z.enum(["warming", "clear", "detected", "unknown"]),
  quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  health: z.object({bmp: z.boolean(), dht: z.boolean(), mpu: z.boolean(), mq: z.enum(["warming", "monitoring", "suspect"]), calibrated: z.boolean()}),
  uptime: z.number().int().min(0).max(4294967295), rssi: z.number().int().min(-127).max(0),
}).strict().superRefine((d, ctx) => {
  if (d.quaternion && (!d.quaternion.every(Number.isFinite) || Math.abs(Math.hypot(...d.quaternion) - 1) > 0.02)) ctx.addIssue({code:"custom",message:"Quaternion must be normalized"});
  if (d.health.bmp !== (d.temperature !== null && d.pressure !== null)) ctx.addIssue({code:"custom",message:"BMP health and values disagree"});
  if (d.health.dht !== (d.humidity !== null)) ctx.addIssue({code:"custom",message:"DHT health and value disagree"});
  if ((d.health.mpu && d.health.calibrated) !== (d.quaternion !== null)) ctx.addIssue({code:"custom",message:"IMU health and orientation disagree"});
  if ((d.health.mq === "warming" && d.smoke !== "warming") || (d.health.mq === "suspect" && d.smoke !== "unknown")) ctx.addIssue({code:"custom",message:"MQ state mismatch"});
  if (d.health.mq === "monitoring" && (d.gas === null || !["clear","detected"].includes(d.smoke))) ctx.addIssue({code:"custom",message:"MQ monitoring requires a reading"});
});
export type Telemetry = z.infer<typeof telemetrySchema>;
// An MQ-2 rail reading is not proof of a failed sensor. Preserve its raw data
// and unknown smoke classification, independently of the core-sensor status display.
export function needsHardwareAttention(health: Telemetry["health"]): boolean {
  return !health.bmp || !health.dht || !health.mpu || !health.calibrated;
}
export type Snapshot = { data: Telemetry | null; receivedAt: number | null; ageMs: number | null; online: boolean };
export const STALE_MS = 8000;
export function makeSnapshot(data: Telemetry | null, receivedAt: number | null, now = Date.now()): Snapshot {
  const ageMs = receivedAt === null ? null : Math.max(0, now - receivedAt, data ? now - data.capturedAt : 0);
  return {data, receivedAt, ageMs, online: ageMs !== null && ageMs < STALE_MS};
}

// On the browser, receivedAt represents the sample's freshness origin in the
// local clock. Duplicate/empty responses must not clear values or renew their age.
export function mergeClientSnapshot(previous: Snapshot, incoming: Snapshot, now: number): Snapshot {
  if (!incoming.data || incoming.ageMs === null) return previous;
  if (previous.data?.boot === incoming.data.boot && incoming.data.seq <= previous.data.seq) return previous;
  return {...incoming, receivedAt: now - incoming.ageMs};
}

export function isClientSnapshotFresh(snapshot: Snapshot, now: number): boolean {
  return snapshot.data !== null && snapshot.receivedAt !== null && now - snapshot.receivedAt < STALE_MS;
}
