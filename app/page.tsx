/* eslint-disable @next/next/no-html-link-for-pages */

import { ClientDashboard } from "./ClientDashboard";

export default function Home() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const fromDefault = `${yyyy}-${mm}-01`;
  const toDefault = `${yyyy}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl border border-zinc-200/60 bg-white/80 p-6 shadow-xl shadow-zinc-950/5 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-600/10 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                ZKTeco • Local dashboard (no DB)
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
                Attendance Dashboard
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Fetches attendance directly from your device over TCP (4370) using a custom protocol client.
              </p>
            </div>
            <a
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              href="/api/zk/attendance"
              target="_blank"
              rel="noreferrer"
            >
              Open raw API
            </a>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-12">
            <div className="md:col-span-7">
              <DevicePanel fromDefault={fromDefault} toDefault={toDefault} />
            </div>
            <div className="md:col-span-5">
              <TipsCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TipsCard() {
  return (
    <div className="h-full rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/40">
      <div className="text-sm font-bold">How it works</div>
      <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
        <li>
          - Runs ZKTeco protocol in <b>Next.js server</b> (Node runtime).
        </li>
        <li>
          - Browser never connects to port 4370 directly.
        </li>
        <li>
          - Use <b>Comm Key</b> only if enabled on device.
        </li>
        <li>
          - Use date range to fetch only the month you need (UI filters the result).
        </li>
      </ul>
      <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300">
        Example: <span className="font-mono">from=2026-03-01</span> and{" "}
        <span className="font-mono">to=2026-04-01</span>
      </div>
    </div>
  );
}

function DevicePanel(props: { fromDefault: string; toDefault: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/40">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-bold">Device connection</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Fill device settings and fetch attendance.
        </div>
      </div>
      <ClientDashboard fromDefault={props.fromDefault} toDefault={props.toDefault} />
    </div>
  );
}
