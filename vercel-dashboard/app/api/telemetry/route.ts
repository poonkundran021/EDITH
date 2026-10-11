import { readReceiver } from '../../../lib/receiver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET() {
  const url = process.env.TELEMETRY_SOURCE_URL ??
    'https://edith-environment-hub.mrltech.chatgpt.site/api/telemetry';
  try {
    return Response.json(await readReceiver(url), { headers });
  } catch {
    return Response.json({ error: 'Live receiver temporarily unavailable' }, { status: 503, headers });
  }
}

// This deployment is a read-only dashboard. Device uploads continue to the
// authenticated Sites receiver; no device secrets belong on the dashboard.
