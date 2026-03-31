import { NextResponse } from 'next/server';
import { ZkTcpClient } from '@/lib/zk/zk-tcp-client';

export const runtime = 'nodejs';

function parseDateOrUndefined(v: string | null) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const ip = url.searchParams.get('ip') || process.env.ZK_IP || '192.168.1.8';
  const port = Number(
    url.searchParams.get('port') || process.env.ZK_PORT || '4370',
  );
  const timeoutMs = Number(
    url.searchParams.get('timeoutMs') || process.env.ZK_TIMEOUT_MS || '10000',
  );
  const commKey = Number(
    url.searchParams.get('commKey') || process.env.ZK_COMM_KEY || '0',
  );

  const from = parseDateOrUndefined(url.searchParams.get('from'));
  const to = parseDateOrUndefined(url.searchParams.get('to'));
  const limit = Math.max(
    0,
    Math.min(50000, Number(url.searchParams.get('limit') || '5000')),
  );

  const client = new ZkTcpClient({ ip, port, timeoutMs, commKey });

  const startedAt = Date.now();
  try {
    const records = await client.getAttendances();

    const filtered = records
      .filter((r) => {
        const t = r.recordTime.getTime();
        if (from && t < from.getTime()) return false;
        if (to && t >= to.getTime()) return false;
        return true;
      })
      .slice(0, limit)
      .map((r) => ({
        userSn: r.userSn ?? null,
        deviceUserId: r.deviceUserId ?? null,
        recordTime: r.recordTime.toISOString(),
      }));

    return NextResponse.json({
      ok: true,
      device: { ip, port },
      count: filtered.length,
      tookMs: Date.now() - startedAt,
      records: filtered,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, device: { ip, port } },
      { status: 500 },
    );
  } finally {
    await client.disconnect();
  }
}

