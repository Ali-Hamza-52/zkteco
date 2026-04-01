## ZKTeco Attendance Spreadsheet (Next.js)

Single-page attendance viewer that fetches ZKTeco device logs and renders a **spreadsheet-style** grid for a selected date range.

### What it shows
- **Rows**: employees **only if they appear in fetched logs**
  - ID from device logs (`deviceUserId` / fallback `userSn`)
  - Name mapped from `public/user-info.json`
- **Columns**: each day in the selected range
- **Cell values**:
  - **X** = present (at least one punch that day)
  - **A** = absent
  - **DO** = Friday day-off (holiday)
- **Cell color meaning (based on first punch / check-in):**
  - **On Time (White)**: 0–20 minutes late (Grace Period)
  - **Slightly Late (Yellow)**: 21–30 minutes late (Tolerance)
  - **Late (Red)**: More than 30 minutes late
- **Hover tooltip displays:** Name, ID, date, status, **check-in** (first punch), **check-out** (last punch)

### Rules
- **Holiday**: Friday
- **Shift start**:
  - Regular days: **08:00**
  - Saturday: **10:00**
- **Color thresholds** are calculated from the shift start time for that day.

### Running locally
Install deps and start dev server:

```bash
yarn
yarn dev
```

Open `http://localhost:3000`.

### Environment (.env)
The API route `app/api/zk/attendance/route.ts` connects to the device using:

- `ZK_IP` (default `192.168.1.8`)
- `ZK_PORT` (default `4370`)
- `ZK_TIMEOUT_MS` (default `10000`)
- `ZK_COMM_KEY` (default `0`)

Copy and edit:

```bash
copy .env.example .env
```

### Data files
- `public/user-info.json`: maps `{ userId, name }` so IDs in logs can show friendly names.

### Main UI file
- `app/attendance-sheet.tsx`: range picker + spreadsheet grid + hover tooltip
