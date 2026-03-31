"use client";

import * as React from "react";
import { addDays, format, isBefore, isSameDay, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

type ApiRecord = {
  userSn: number | null;
  deviceUserId: string | null;
  recordTime: string;
};

type ApiResponse =
  | { ok: true; count: number; tookMs: number; records: ApiRecord[] }
  | { ok: false; error: string };

type UserInfo = { userId: string; name: string };

function toIsoDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function eachDayInclusive(from: Date, to: Date) {
  const days: Date[] = [];
  let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (isBefore(d, end) || isSameDay(d, end)) {
    days.push(new Date(d));
    d = addDays(d, 1);
  }
  return days;
}

function weekdayShort(d: Date) {
  // M T W T F S S (like spreadsheet)
  return format(d, "EEEEE");
}

function isFridayHoliday(d: Date) {
  return d.getDay() === 5; // Friday
}

function shiftStartMinutes(d: Date) {
  // Regular 08:00, Saturday 10:00, Friday holiday
  if (isFridayHoliday(d)) return null;
  if (d.getDay() === 6) return 10 * 60; // Saturday
  return 8 * 60;
}

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function cellColorForCheckIn(day: Date, firstPunch: Date) {
  const startMin = shiftStartMinutes(day);
  if (startMin == null) return "holiday";

  const punchMin = minutesSinceMidnight(firstPunch);
  const late = Math.max(0, punchMin - startMin);

  // White if first 15 minutes of the day
  if (late <= 15) return "white";
  if (late <= 30) return "yellow";
  return "red";
}

async function fetchUserInfoMap(): Promise<Map<string, string>> {
  const res = await fetch("/user-info.json", { cache: "force-cache" });
  const json = (await res.json()) as { data?: UserInfo[] };
  const map = new Map<string, string>();
  for (const u of json?.data ?? []) map.set(String(u.userId), u.name);
  return map;
}

export function AttendanceSheet() {
  const now = new Date();
  const defaultFrom = startOfMonth(now);
  const defaultTo = addDays(addMonths(defaultFrom, 1), -1); // end of month

  const [range, setRange] = React.useState<{ from: Date; to: Date }>(() => ({
    from: defaultFrom,
    to: defaultTo,
  }));

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [userMap, setUserMap] = React.useState<Map<string, string>>(new Map());
  const [q, setQ] = React.useState("");
  const [hover, setHover] = React.useState<null | {
    x: number;
    y: number;
    userId: string;
    userName: string;
    dateKey: string;
    status: "DO" | "X" | "A";
    checkIn: string | null;
  }>(null);

  React.useEffect(() => {
    let mounted = true;
    fetchUserInfoMap()
      .then((m) => mounted && setUserMap(m))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const isoFrom = React.useMemo(() => toIsoDateOnly(range.from), [range.from]);
  const isoToExclusive = React.useMemo(
    () => toIsoDateOnly(addDays(range.to, 1)),
    [range.to]
  );

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: isoFrom, to: isoToExclusive });
      const res = await fetch(`/api/zk/attendance?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
      if (!json.ok) setError(json.error);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const days = React.useMemo(
    () => eachDayInclusive(range.from, range.to),
    [range.from, range.to]
  );

  const byUserDay = React.useMemo(() => {
    const map = new Map<string, Map<string, Date>>(); // userId -> dayKey -> firstPunch
    if (!data || !data.ok) return map;

    for (const r of data.records) {
      const userId =
        r.deviceUserId ?? (r.userSn != null ? String(r.userSn) : "unknown");
      const dt = parseISO(r.recordTime);
      if (!Number.isFinite(dt.getTime())) continue;
      const dayKey = toIsoDateOnly(dt);
      const userRow = map.get(userId) ?? new Map<string, Date>();
      const prev = userRow.get(dayKey);
      if (!prev || dt < prev) userRow.set(dayKey, dt);
      map.set(userId, userRow);
    }
    return map;
  }, [data]);

  const users = React.useMemo(() => {
    // Only show employees that appear in data
    const list = Array.from(byUserDay.keys()).map((id) => ({
      id,
      name: userMap.get(id) ?? null,
    }));
    const needle = q.trim().toLowerCase();
    const filtered = !needle
      ? list
      : list.filter((u) => {
          const name = (u.name ?? "").toLowerCase();
          return u.id.includes(needle) || name.includes(needle);
        });
    return filtered.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  }, [byUserDay, userMap, q]);

  return (
    <div className="space-y-3">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-3 px-3 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Attendance</div>
            <div className="text-xs text-muted-foreground">
              Friday holiday • Regular 08:00–17:00 • Saturday 10:00–17:00
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Range</Label>
              <RangePick value={range} onChange={setRange} />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? "Fetching…" : "Fetch"}
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Spreadsheet view</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <b>Error:</b> {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Range: <span className="font-mono">{isoFrom}</span> →{" "}
              <span className="font-mono">{toIsoDateOnly(range.to)}</span>
              {data && data.ok ? (
                <>
                  {" "}
                  • logs: <span className="font-mono">{data.count}</span> • users:{" "}
                  <span className="font-mono">{users.length}</span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="id or name…"
                className="h-8 w-[220px]"
              />
            </div>
          </div>

          <ScrollArea className="h-[70dvh] rounded-lg border bg-background">
            <div className="overflow-x-auto">
              <div className="min-w-full">
                <div
                  className="sticky top-0 z-30 grid border-b bg-muted/60 text-xs font-medium backdrop-blur"
                  style={{
                    gridTemplateColumns: `100px minmax(180px, 1fr) repeat(${days.length}, 44px)`,
                  }}
                >
                  <div className="sticky left-0 z-40 border-r bg-muted/60 px-2 py-2">
                    ID
                  </div>
                  <div className="sticky left-[100px] z-40 border-r bg-muted/60 px-2 py-2">
                    Name
                  </div>
                  {days.map((d, idx) => (
                    <div
                      key={`hdr-${toIsoDateOnly(d)}`}
                      className={cn(
                        "px-1 py-1.5 text-center leading-tight",
                        idx !== days.length - 1 ? "border-r" : ""
                      )}
                    >
                      <div>{weekdayShort(d)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {d.getDate()}
                      </div>
                    </div>
                  ))}
                </div>

              {users.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {data ? "No users found for this range." : "Pick a range and click Fetch."}
                </div>
              ) : (
                users.map((u) => {
                  const row = byUserDay.get(u.id) ?? new Map<string, Date>();
                  return (
                    <div
                      key={u.id}
                      className="grid border-b text-xs"
                      style={{
                        gridTemplateColumns: `100px minmax(180px, 1fr) repeat(${days.length}, 44px)`,
                      }}
                    >
                      <div className="sticky left-0 z-10 border-r bg-background px-2 py-2 font-mono font-semibold">
                        {u.id}
                      </div>
                      <div className="sticky left-[100px] z-10 border-r bg-background px-2 py-2">
                        <div className="truncate text-sm font-medium">
                          {u.name ?? u.id}
                        </div>
                      </div>

                      {days.map((d, idx) => {
                        const key = toIsoDateOnly(d);
                        const holiday = isFridayHoliday(d);
                        const punch = row.get(key) ?? null;
                        const present = !!punch;

                        let bg =
                          "bg-background";
                        if (holiday) bg = "bg-muted/40";
                        else if (present) {
                          const c = cellColorForCheckIn(d, punch!);
                          bg =
                            c === "white"
                              ? "bg-background"
                              : c === "yellow"
                              ? "bg-amber-200/70 dark:bg-amber-500/25"
                              : "bg-rose-200/70 dark:bg-rose-500/25";
                        } else {
                          bg = "bg-muted/20";
                        }

                        const text = holiday ? "DO" : present ? "X" : "A";
                        const showTime = !holiday && present && punch;
                        const userName = u.name ?? u.id;
                        const checkIn = showTime ? punch.toLocaleTimeString() : null;

                        return (
                          <div
                            key={`${u.id}-${key}`}
                            className={cn(
                              "group relative px-1 py-2 text-center tabular-nums",
                              idx !== days.length - 1 ? "border-r" : "",
                              bg
                            )}
                            onMouseEnter={(e) => {
                              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                              setHover({
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                                userId: u.id,
                                userName,
                                dateKey: key,
                                status: text,
                                checkIn,
                              });
                            }}
                            onMouseMove={(e) => {
                              setHover((prev) =>
                                prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                              );
                            }}
                            onMouseLeave={() => setHover(null)}
                          >
                            <span className={cn(text === "DO" ? "text-[10px] font-semibold" : "")}>
                              {text}
                            </span>

                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
              </div>
            </div>
          </ScrollArea>

          <div className="text-xs text-muted-foreground">
            Colors: white ≤ 15 min • yellow 16–30 • red &gt; 30. (Based on first punch of day.)
          </div>
        </CardContent>
      </Card>

      {hover ? (
        <div
          className="pointer-events-none fixed z-9999 w-[240px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{hover.userName}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {hover.userId}
              </div>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {hover.dateKey}
            </div>
          </div>
          <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
            <div>
              Status:{" "}
              <span className="font-medium text-foreground">
                {hover.status === "DO"
                  ? "Day off (Friday)"
                  : hover.status === "X"
                  ? "Present"
                  : "Absent"}
              </span>
            </div>
            <div>
              Check-in:{" "}
              <span className="font-medium text-foreground">
                {hover.checkIn ?? "—"}
              </span>
            </div>
          </div>
          <div className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r bg-popover" />
        </div>
      ) : null}
    </div>
  );
}

function RangePick(props: {
  value: { from: Date; to: Date };
  onChange: (v: { from: Date; to: Date }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>({
    from: props.value.from,
    to: props.value.to,
  });

  React.useEffect(() => {
    setDraft({ from: props.value.from, to: props.value.to });
  }, [props.value.from, props.value.to]);

  function apply() {
    if (!draft?.from) return;
    const from = draft.from;
    const to = draft.to ?? draft.from;
    const normalized =
      from <= to ? { from, to } : { from: to, to: from };
    props.onChange(normalized);
    setOpen(false);
  }

  const label =
    `${toIsoDateOnly(props.value.from)} → ${toIsoDateOnly(props.value.to)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-[240px] justify-start font-mono text-xs"
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={draft}
          onSelect={(next) => setDraft(next)}
        />
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <div className="text-xs text-muted-foreground">
            {draft?.from ? (
              <span className="font-mono">
                {toIsoDateOnly(draft.from)} →{" "}
                {toIsoDateOnly(draft.to ?? draft.from)}
              </span>
            ) : (
              "Pick start and end dates"
            )}
          </div>
          <Button size="sm" onClick={apply} disabled={!draft?.from}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

