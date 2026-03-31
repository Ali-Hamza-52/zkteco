"use client";

import React from "react";

type ApiRecord = {
  userSn: number | null;
  deviceUserId: string | null;
  recordTime: string;
};

type ApiResponse =
  | {
      ok: true;
      device: { ip: string; port: number };
      count: number;
      tookMs: number;
      records: ApiRecord[];
    }
  | { ok: false; error: string; device: { ip: string; port: number } };

export function ClientDashboard(props: { fromDefault: string; toDefault: string }) {
  const [ip, setIp] = React.useState("192.168.1.8");
  const [port, setPort] = React.useState("4370");
  const [timeoutMs, setTimeoutMs] = React.useState("10000");
  const [commKey, setCommKey] = React.useState("0");
  const [from, setFrom] = React.useState(props.fromDefault);
  const [to, setTo] = React.useState(props.toDefault);
  const [limit, setLimit] = React.useState("5000");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ApiResponse | null>(null);

  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!data || data.ok === false) return [];
    const needle = q.trim().toLowerCase();
    return data.records.filter((r) => {
      if (!needle) return true;
      const id = (r.deviceUserId ?? "").toLowerCase();
      const sn = r.userSn != null ? String(r.userSn) : "";
      return id.includes(needle) || sn.includes(needle);
    });
  }, [data, q]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({
        ip,
        port,
        timeoutMs,
        commKey,
        from,
        to,
        limit,
      });
      const res = await fetch(`/api/zk/attendance?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
      if (!json.ok) setError(json.error);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const summary = React.useMemo(() => {
    const map = new Map<
      string,
      { count: number; first: string; last: string }
    >();
    for (const r of filtered) {
      const key =
        r.deviceUserId ?? (r.userSn != null ? String(r.userSn) : "unknown");
      const t = r.recordTime;
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { count: 1, first: t, last: t });
      } else {
        entry.count += 1;
        if (t < entry.first) entry.first = t;
        if (t > entry.last) entry.last = t;
      }
    }
    return Array.from(map.entries())
      .map(([user, v]) => ({ user, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  return (
    <div className="mt-5">
      <div className="grid gap-3 md:grid-cols-12">
        <Field label="IP" value={ip} onChange={setIp} className="md:col-span-4" />
        <Field
          label="Port"
          value={port}
          onChange={setPort}
          className="md:col-span-2"
        />
        <Field
          label="Timeout (ms)"
          value={timeoutMs}
          onChange={setTimeoutMs}
          className="md:col-span-3"
        />
        <Field
          label="Comm Key"
          value={commKey}
          onChange={setCommKey}
          className="md:col-span-3"
        />
        <Field
          label="From"
          value={from}
          onChange={setFrom}
          className="md:col-span-4"
        />
        <Field label="To" value={to} onChange={setTo} className="md:col-span-4" />
        <Field
          label="Limit"
          value={limit}
          onChange={setLimit}
          className="md:col-span-4"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Fetching…" : "Fetch attendance"}
        </button>

        <div className="flex flex-1 items-center gap-3 md:justify-end">
          <div className="relative w-full md:max-w-sm">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user id / userSn…"
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none ring-0 focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950/40"
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <b>Error:</b> {error}
        </div>
      ) : null}

      {data && data.ok ? (
        <div className="mt-4 grid gap-3 md:grid-cols-12">
          <Metric
            label="Device"
            value={`${data.device.ip}:${data.device.port}`}
            className="md:col-span-5"
          />
          <Metric
            label="Records (filtered)"
            value={String(filtered.length)}
            className="md:col-span-3"
          />
          <Metric
            label="Took"
            value={`${data.tookMs} ms`}
            className="md:col-span-4"
          />
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-3xl border border-zinc-200/60 dark:border-zinc-800/70">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800/70 dark:bg-zinc-950/40">
          <div className="font-bold">Users summary</div>
          <div className="text-zinc-600 dark:text-zinc-300">
            Rows: <b>{summary.length}</b>
          </div>
        </div>
        <div className="max-h-[52vh] overflow-auto bg-white dark:bg-zinc-900/30">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white/90 backdrop-blur dark:bg-zinc-900/70">
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">First</th>
                <th className="px-4 py-3">Last</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No data yet. Click <b>Fetch attendance</b>.
                  </td>
                </tr>
              ) : (
                summary.map((r) => (
                  <tr
                    key={r.user}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-950/30"
                  >
                    <td className="px-4 py-3 font-mono font-semibold">
                      {r.user}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-violet-600/10 px-2 py-1 font-mono text-xs font-bold text-violet-700 dark:text-violet-300">
                        {r.count}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                      {new Date(r.first).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                      {new Date(r.last).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${props.className ?? ""}`}>
      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {props.label}
      </span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950/40"
      />
    </label>
  );
}

function Metric(props: { label: string; value: string; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-zinc-200/60 bg-white p-4 dark:border-zinc-800/70 dark:bg-zinc-900/40 ${props.className ?? ""}`}
    >
      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {props.label}
      </div>
      <div className="mt-1 font-mono text-sm font-bold">{props.value}</div>
    </div>
  );
}

