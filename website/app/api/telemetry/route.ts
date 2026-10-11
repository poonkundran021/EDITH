import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { telemetrySchema, makeSnapshot } from "../../../lib/telemetry";
const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}});
export async function GET() {
  if (!env.DB) return json({error:"Telemetry storage unavailable"},503);
  try {
    const row = await env.DB.prepare("SELECT payload, received_at FROM telemetry WHERE id = ?").bind("edith-01").first<{payload:string;received_at:number}>();
    return json(makeSnapshot(row ? JSON.parse(row.payload) : null, row?.received_at ?? null));
  } catch { return json({error:"Telemetry temporarily unavailable"},503); }
}
export async function POST(request: Request) {
  if (!env.DEVICE_TOKEN || !env.DB) return json({error:"Receiver not configured"},503);
  const auth = request.headers.get("authorization") ?? "";
  const enc = new TextEncoder();
  const [a,b] = await Promise.all([auth, `Bearer ${env.DEVICE_TOKEN}`].map(v=>crypto.subtle.digest("SHA-256",enc.encode(v))));
  if (!timingSafeEqual(new Uint8Array(a),new Uint8Array(b))) return json({error:"Unauthorized"},401);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({error:"JSON required"},415);
  const reader = request.body?.getReader();
  if (!reader) return json({error:"Missing body"},400);
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.length; if (size > 4096) {await reader.cancel();return json({error:"Payload too large"},413);}
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let input: unknown;
  try {input = JSON.parse(new TextDecoder().decode(bytes));} catch {return json({error:"Invalid JSON"},400);}
  const parsed = telemetrySchema.safeParse(input);
  if (!parsed.success) return json({error:"Invalid telemetry", details:parsed.error.flatten()},422);
  if (Date.now()-parsed.data.capturedAt > 8000 || parsed.data.capturedAt-Date.now() > 5000) return json({error:"Sample expired or device clock incorrect"},422);
  try {
    // A single row bounds storage. Reject replayed/out-of-order samples within each boot.
    const result = await env.DB.prepare(`INSERT INTO telemetry(id,payload,received_at) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, received_at=excluded.received_at
      WHERE json_extract(telemetry.payload,'$.boot') != json_extract(excluded.payload,'$.boot')
      OR json_extract(telemetry.payload,'$.seq') < json_extract(excluded.payload,'$.seq')`)
      .bind(parsed.data.device, JSON.stringify(parsed.data), Date.now()).run();
    return json({accepted:result.meta.changes > 0});
  } catch {return json({error:"Unable to store telemetry"},503);}
}
