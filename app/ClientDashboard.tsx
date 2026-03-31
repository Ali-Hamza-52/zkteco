"use client";

import React from "react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ApiRecord = {
  userSn: number | null;
  deviceUserId: string | null;
  recordTime: string;
};

type ApiResponse =
  | {
      ok: true;
      count: number;
      tookMs: number;
      records: ApiRecord[];
    }
  | { ok: false; error: string };

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function toIsoDateOnly(d: Date) {
  // YYYY-MM-DD in local time (matches user's mental model for month filters)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDateOnly(v: string) {
  const [y, m, d] = v.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function toDayKey(d: Date) {
  return toIsoDateOnly(d);
}

export function ClientDashboard(props: { fromDefault: string; toDefault: string }) {
  const initialMonth =
    parseIsoDateOnly(props.fromDefault)?.getMonth() != null
      ? startOfMonth(parseIsoDateOnly(props.fromDefault)!)
      : startOfMonth(new Date());

  const [month, setMonth] = React.useState<Date>(initialMonth);
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);

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

  const from = React.useMemo(() => toIsoDateOnly(startOfMonth(month)), [month]);
  const to = React.useMemo(() => toIsoDateOnly(addMonths(month, 1)), [month]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({ from, to });
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

  const daySummary = React.useMemo(() => {
    const m = new Map<string, { total: number; users: Set<string> }>();
    for (const r of filtered) {
      const t = new Date(r.recordTime);
      if (!Number.isFinite(t.getTime())) continue;
      const key = toDayKey(t);
      const user =
        r.deviceUserId ?? (r.userSn != null ? String(r.userSn) : "unknown");
      const prev = m.get(key);
      if (!prev) m.set(key, { total: 1, users: new Set([user]) });
      else {
        prev.total += 1;
        prev.users.add(user);
      }
    }
    return m;
  }, [filtered]);

  const kpis = React.useMemo(() => {
    const totalRecords = filtered.length;
    const activeDays = daySummary.size;
    let uniqueUsers = 0;
    const allUsers = new Set<string>();
    for (const v of daySummary.values()) {
      for (const u of v.users) allUsers.add(u);
    }
    uniqueUsers = allUsers.size;
    return { totalRecords, activeDays, uniqueUsers };
  }, [filtered.length, daySummary]);

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

  const selectedDayKey = selectedDay ? toDayKey(selectedDay) : null;
  const selectedDayRecords = React.useMemo(() => {
    if (!selectedDayKey) return [];
    return filtered
      .filter((r) => {
        const t = new Date(r.recordTime);
        if (!Number.isFinite(t.getTime())) return false;
        return toDayKey(t) === selectedDayKey;
      })
      .sort((a, b) => a.recordTime.localeCompare(b.recordTime));
  }, [filtered, selectedDayKey]);

  return (
    <div className="mt-5 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Month filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <Label className="text-xs">Month</Label>
            <div className="mt-1 flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setMonth((m) => addMonths(m, -1))}
              >
                Prev
              </Button>
              <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                {format(month, "MMMM yyyy")}
              </div>
              <Button
                variant="secondary"
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                Next
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Fetch range: <span className="font-mono">{from}</span> →{" "}
              <span className="font-mono">{to}</span>
            </div>
          </div>

          <div className="md:col-span-4">
            <Label className="text-xs">Search</Label>
            <Input
              className="mt-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user id / userSn…"
            />
          </div>

          <div className="md:col-span-3">
            <Button
              className="w-full"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? "Fetching…" : "Fetch attendance"}
            </Button>
            <div className="mt-2 text-xs text-muted-foreground">
              Device is configured on the server via <span className="font-mono">.env</span>.
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">
            <b>Error:</b> {error}
          </CardContent>
        </Card>
      ) : null}

      {data && data.ok ? (
        <div className="grid gap-3 md:grid-cols-12">
          <Card className="md:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Records (filtered)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {kpis.totalRecords}
            </CardContent>
          </Card>
          <Card className="md:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Unique users (month)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {kpis.uniqueUsers}
            </CardContent>
          </Card>
          <Card className="md:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">
                Took (server)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {data.tookMs} <span className="text-sm font-normal">ms</span>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Monthly calendar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={(m) => setMonth(startOfMonth(m))}
              selected={selectedDay ?? undefined}
              onSelect={(d) => setSelectedDay(d ?? null)}
              className="rounded-md border"
              components={{
                DayButton: ({ day, modifiers, ...p }) => {
                  const key = toDayKey(day.date);
                  const s = daySummary.get(key);
                  const total = s?.total ?? 0;
                  return (
                    <button
                      {...p}
                      type="button"
                      className={cn(
                        "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1 text-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
                        modifiers.selected ? "bg-primary text-primary-foreground hover:bg-primary" : "",
                        modifiers.outside ? "opacity-40" : ""
                      )}
                    >
                      <div className="text-sm font-medium">{day.date.getDate()}</div>
                      {total > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-5 px-1.5 text-[10px] tabular-nums",
                            modifiers.selected ? "bg-primary-foreground/15 text-primary-foreground" : ""
                          )}
                        >
                          {total}
                        </Badge>
                      ) : (
                        <span className="h-5" />
                      )}
                    </button>
                  );
                },
              }}
            />

            <div className="text-xs text-muted-foreground">
              Tip: click a day to drill into events.
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Day details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {selectedDay ? format(selectedDay, "PPP") : "No day selected"}
              </div>
              {selectedDay ? (
                <Badge variant="outline">
                  {selectedDayRecords.length} records
                </Badge>
              ) : null}
            </div>

            <ScrollArea className="h-[360px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDay ? (
                    selectedDayRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          No records for this day.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedDayRecords.map((r, idx) => {
                        const user =
                          r.deviceUserId ??
                          (r.userSn != null ? String(r.userSn) : "unknown");
                        const dt = new Date(r.recordTime);
                        return (
                          <TableRow key={`${r.recordTime}-${user}-${idx}`}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {user}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {Number.isFinite(dt.getTime())
                                ? dt.toLocaleTimeString()
                                : r.recordTime}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                        Select a date from the calendar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Users summary (month)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>First</TableHead>
                  <TableHead>Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                      No data yet. Click <b>Fetch attendance</b>.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.map((r) => (
                    <TableRow key={r.user}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {r.user}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {r.count}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(r.first).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(r.last).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
