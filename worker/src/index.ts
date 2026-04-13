import { sendPush, type APNsConfig } from "./apns";

interface Env {
  OUTSPIRE_KV: KVNamespace;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  APNS_PRIVATE_KEY: string;
  APNS_BUNDLE_ID: string;
  APNS_AUTH_SECRET: string;
  GITHUB_CALENDAR_URL: string;
  HOLIDAY_CN_URL: string;
}

interface RegisterBody {
  deviceId: string;
  pushStartToken: string;
  sandbox?: boolean;
  track: "ibdp" | "alevel";
  entryYear: string;
  schedule: Record<string, ClassPeriod[]>;
}

interface ActivityTokenBody {
  deviceId: string;
  activityId: string;
  dayKey: string;
  pushUpdateToken: string;
  owner: "app" | "worker";
}

interface ActivityEndedBody {
  deviceId: string;
  activityId: string;
  dayKey: string;
}

interface ClassPeriod {
  periodNumber: number;
  start: string;
  end: string;
  name: string;
  room: string;
  isSelfStudy: boolean;
}

interface ActivityRecord {
  activityId: string;
  dayKey: string;
  pushUpdateToken: string;
  owner: "app" | "worker";
  lastSequence: number;
  updatedAt: number;
}

interface StoredRegistration {
  pushStartToken: string;
  sandbox: boolean;
  track: "ibdp" | "alevel";
  entryYear: string;
  schedule: Record<string, ClassPeriod[]>;
  paused: boolean;
  resumeDate?: string;
  currentActivity?: ActivityRecord;
}

interface HolidayCNDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

interface HolidayCNData {
  year: number;
  days: HolidayCNDay[];
}

interface SchoolCalendar {
  semesters: { start: string; end: string }[];
  specialDays: SpecialDay[];
}

interface SpecialDay {
  date: string;
  type: string;
  name: string;
  cancelsClasses: boolean;
  track: string;
  grades: string[];
  followsWeekday?: number;
}

type JobKind = "start" | "update" | "end";

interface PushJob {
  deviceId: string;
  token: string;
  sandbox: boolean;
  pushType: "liveactivity";
  topic: string;
  payload: Record<string, unknown>;
  kind: JobKind;
  dayKey: string;
}

type DispatchSlot = PushJob[];
type DispatchIndex = string[];

interface DayDecision {
  shouldSendPushes: boolean;
  eventName?: string;
  cancelsClasses: boolean;
  useWeekday: number;
}

type ActivityPhase = "upcoming" | "ongoing" | "ending" | "break" | "event" | "done";

interface SnapshotState {
  dayKey: string;
  phase: ActivityPhase;
  title: string;
  subtitle: string;
  rangeStart: number;
  rangeEnd: number;
  nextTitle?: string;
  sequence: number;
}

const APPLE_REFERENCE_DATE = 978307200;
const SLOT_TTL = 72000;
const REG_TTL = 30 * 24 * 60 * 60;

function nowCSTDate(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function todayCST(): string {
  return nowCSTDate().toISOString().slice(0, 10);
}

function currentTimeCST(): { hours: number; minutes: number } {
  const cst = nowCSTDate();
  return { hours: cst.getUTCHours(), minutes: cst.getUTCMinutes() };
}

function weekdayCST(): number {
  const day = nowCSTDate().getUTCDay();
  return day === 0 ? 7 : day;
}

function parseTime(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { h, m };
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesFor(timeStr: string): number {
  const { h, m } = parseTime(timeStr);
  return h * 60 + m;
}

function dispatchSlotKey(dayKey: string, time: string): string {
  return `dispatch:${dayKey}:${time}`;
}

function dispatchIndexKey(dayKey: string, deviceId: string): string {
  return `dispatch-index:${dayKey}:${deviceId}`;
}

function timeToAppleDate(dayKey: string, timeStr: string): number {
  const { h, m } = parseTime(timeStr);
  const utcMs = Date.parse(`${dayKey}T${formatTime(h, m)}:00+08:00`);
  return Math.floor(utcMs / 1000) - APPLE_REFERENCE_DATE;
}

function unixFor(dayKey: string, timeStr: string): number {
  return Math.floor(Date.parse(`${dayKey}T${timeStr}:00+08:00`) / 1000);
}

function subtractMinutes(timeStr: string, minutes: number): string {
  const total = minutesFor(timeStr) - minutes;
  const clamped = Math.max(total, 0);
  return formatTime(Math.floor(clamped / 60), clamped % 60);
}

function isAuthorized(request: Request, env: Env): boolean {
  return request.headers.get("x-auth-secret") === env.APNS_AUTH_SECRET;
}

function apnsConfig(env: Env): APNsConfig {
  return {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    privateKey: env.APNS_PRIVATE_KEY,
    bundleId: env.APNS_BUNDLE_ID,
  };
}

async function kvListAll(
  kv: KVNamespace,
  opts: { prefix: string }
): Promise<KVNamespaceListKey<unknown>[]> {
  const allKeys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix: opts.prefix, cursor });
    allKeys.push(...res.keys);
    cursor = res.list_complete ? undefined : (res.cursor as string);
  } while (cursor);
  return allKeys;
}

async function fetchHolidayCN(
  env: Env,
  year: string
): Promise<HolidayCNDay[]> {
  const cacheKey = `cache:holiday-cn:${year}`;
  const cached = await env.OUTSPIRE_KV.get(cacheKey, "json");
  if (cached) return cached as HolidayCNDay[];

  const resp = await fetch(`${env.HOLIDAY_CN_URL}/${year}.json`);
  if (!resp.ok) return [];
  const data: HolidayCNData = await resp.json();

  await env.OUTSPIRE_KV.put(cacheKey, JSON.stringify(data.days), {
    expirationTtl: 3600,
  });
  return data.days;
}

async function fetchSchoolCalendarByAcademicYear(
  env: Env,
  academicYear: string
): Promise<SchoolCalendar | null> {
  const cacheKey = `cache:school-cal:${academicYear}`;
  const cached = await env.OUTSPIRE_KV.get(cacheKey, "json");
  if (cached) return cached as SchoolCalendar;

  const resp = await fetch(`${env.GITHUB_CALENDAR_URL}/${academicYear}.json`);
  if (!resp.ok) return null;
  const data: SchoolCalendar = await resp.json();

  await env.OUTSPIRE_KV.put(cacheKey, JSON.stringify(data), {
    expirationTtl: 300,
  });
  return data;
}

async function fetchSchoolCalendar(
  env: Env,
  year: string
): Promise<SchoolCalendar | null> {
  const y = parseInt(year, 10);
  const [a, b] = await Promise.all([
    fetchSchoolCalendarByAcademicYear(env, `${y - 1}-${y}`),
    fetchSchoolCalendarByAcademicYear(env, `${y}-${y + 1}`),
  ]);
  if (!a && !b) return null;
  return {
    semesters: [...(a?.semesters ?? []), ...(b?.semesters ?? [])],
    specialDays: [...(a?.specialDays ?? []), ...(b?.specialDays ?? [])],
  };
}

function specialDayApplies(
  sd: SpecialDay,
  track: string,
  entryYear: string
): boolean {
  const trackMatch = sd.track === "all" || sd.track === track;
  const gradeMatch = sd.grades.includes("all") || sd.grades.includes(entryYear);
  return trackMatch && gradeMatch;
}

async function decideTodayForUser(
  env: Env,
  reg: StoredRegistration
): Promise<DayDecision> {
  const today = todayCST();
  const year = today.slice(0, 4);
  const wd = weekdayCST();

  if (reg.paused) {
    if (!reg.resumeDate || today < reg.resumeDate) {
      return { shouldSendPushes: false, cancelsClasses: false, useWeekday: wd };
    }
  }

  const cal = await fetchSchoolCalendar(env, year);
  if (cal) {
    const inSemester = cal.semesters.some(
      (s) => today >= s.start && today <= s.end
    );
    if (!inSemester) {
      return { shouldSendPushes: false, cancelsClasses: false, useWeekday: wd };
    }

    const special = cal.specialDays.find(
      (sd) =>
        sd.date === today && specialDayApplies(sd, reg.track, reg.entryYear)
    );
    if (special) {
      if (special.cancelsClasses) {
        return {
          shouldSendPushes: true,
          eventName: special.name,
          cancelsClasses: true,
          useWeekday: wd,
        };
      }
      if (special.type === "makeup" && special.followsWeekday) {
        return {
          shouldSendPushes: true,
          eventName: special.name,
          cancelsClasses: false,
          useWeekday: special.followsWeekday,
        };
      }
    }
  }

  const holidays = await fetchHolidayCN(env, year);
  const holiday = holidays.find((d) => d.date === today);
  if (holiday) {
    if (holiday.isOffDay) {
      return { shouldSendPushes: false, cancelsClasses: false, useWeekday: wd };
    }
    const calMakeup = cal?.specialDays.find(
      (sd) => sd.date === today && sd.type === "makeup"
    );
    return {
      shouldSendPushes: true,
      cancelsClasses: false,
      useWeekday: calMakeup?.followsWeekday ?? 1,
    };
  }

  if (wd >= 6) {
    return { shouldSendPushes: false, cancelsClasses: false, useWeekday: wd };
  }

  return { shouldSendPushes: true, cancelsClasses: false, useWeekday: wd };
}

function breakTitle(current: ClassPeriod, next: ClassPeriod): string {
  return current.periodNumber === 4 && next.periodNumber === 5
    ? "Lunch Break"
    : "Break";
}

function buildStateTransitions(
  dayKey: string,
  periods: ClassPeriod[],
  decision: DayDecision
): Array<{ time: string; state: SnapshotState; kind: JobKind }> {
  if (decision.cancelsClasses) {
    const state: SnapshotState = {
      dayKey,
      phase: "event",
      title: decision.eventName ?? "No Classes",
      subtitle: "Classes are cancelled today",
      rangeStart: timeToAppleDate(dayKey, "07:45"),
      rangeEnd: timeToAppleDate(dayKey, "08:45"),
      sequence: 1,
    };

    return [
      { time: "07:45", state, kind: "start" },
      { time: "08:45", state: { ...state, phase: "done", title: "Schedule Complete", subtitle: "", sequence: 2 }, kind: "end" },
    ];
  }

  if (periods.length === 0) return [];

  const transitions: Array<{ time: string; state: SnapshotState; kind: JobKind }> = [];
  const first = periods[0];
  const upcomingStart = subtractMinutes(first.start, 30);

  transitions.push({
    time: upcomingStart,
    kind: "start",
    state: {
      dayKey,
      phase: "upcoming",
      title: first.name,
      subtitle: first.isSelfStudy ? first.room || "Class-Free Period" : first.room,
      rangeStart: timeToAppleDate(dayKey, upcomingStart),
      rangeEnd: timeToAppleDate(dayKey, first.start),
      nextTitle: periods[1]?.name,
      sequence: 0,
    },
  });

  periods.forEach((period, index) => {
    transitions.push({
      time: period.start,
      kind: "update",
      state: {
        dayKey,
        phase: "ongoing",
        title: period.name,
        subtitle: period.isSelfStudy
          ? period.room || "Class-Free Period"
          : period.room,
        rangeStart: timeToAppleDate(dayKey, period.start),
        rangeEnd: timeToAppleDate(dayKey, period.end),
        nextTitle: periods[index + 1]?.name,
        sequence: index * 3 + 1,
      },
    });

    transitions.push({
      time: subtractMinutes(period.end, 5),
      kind: "update",
      state: {
        dayKey,
        phase: "ending",
        title: period.name,
        subtitle: period.isSelfStudy
          ? period.room || "Class-Free Period"
          : period.room,
        rangeStart: timeToAppleDate(dayKey, period.start),
        rangeEnd: timeToAppleDate(dayKey, period.end),
        nextTitle: periods[index + 1]?.name,
        sequence: index * 3 + 2,
      },
    });

    if (periods[index + 1]) {
      const next = periods[index + 1];
      transitions.push({
        time: period.end,
        kind: "update",
        state: {
          dayKey,
          phase: "break",
          title: breakTitle(period, next),
          subtitle: `Next: ${next.name}`,
          rangeStart: timeToAppleDate(dayKey, period.end),
          rangeEnd: timeToAppleDate(dayKey, next.start),
          nextTitle: next.name,
          sequence: index * 3 + 3,
        },
      });
    }
  });

  const last = periods[periods.length - 1];
  transitions.push({
    time: last.end,
    kind: "end",
    state: {
      dayKey,
      phase: "done",
      title: "Schedule Complete",
      subtitle: "",
      rangeStart: timeToAppleDate(dayKey, last.end),
      rangeEnd: timeToAppleDate(dayKey, last.end) + 900,
      sequence: periods.length * 3 + 1,
    },
  });

  return transitions;
}

function finalDismissalUnix(
  dayKey: string,
  periods: ClassPeriod[],
  decision: DayDecision
): number {
  if (decision.cancelsClasses) {
    return unixFor(dayKey, "08:45");
  }
  if (periods.length === 0) {
    return unixFor(dayKey, "23:59");
  }
  const last = periods[periods.length - 1];
  return unixFor(dayKey, last.end) + 900;
}

function buildStartJob(
  deviceId: string,
  reg: StoredRegistration,
  state: SnapshotState,
  bundleId: string,
  staleDateUnix: number
): PushJob {
  const topic = `${bundleId}.push-type.liveactivity`;

  return {
    deviceId,
    token: reg.pushStartToken,
    sandbox: reg.sandbox,
    pushType: "liveactivity",
    topic,
    kind: "start",
    dayKey: state.dayKey,
    payload: {
      aps: {
        timestamp: 0,
        event: "start",
        "content-state": state,
        "stale-date": staleDateUnix,
        alert: {
          title: state.title,
          body: state.subtitle || "Today's schedule is now live",
        },
        "attributes-type": "ClassActivityAttributes",
        attributes: {
          startDate: state.rangeStart,
        },
      },
    },
  };
}

function buildUpdateJob(
  deviceId: string,
  reg: StoredRegistration,
  token: string,
  state: SnapshotState,
  bundleId: string,
  staleDateUnix: number
): PushJob {
  return {
    deviceId,
    token,
    sandbox: reg.sandbox,
    pushType: "liveactivity",
    topic: `${bundleId}.push-type.liveactivity`,
    kind: "update",
    dayKey: state.dayKey,
    payload: {
      aps: {
        timestamp: 0,
        event: "update",
        "content-state": state,
        "stale-date": staleDateUnix,
      },
    },
  };
}

function buildEndJob(
  deviceId: string,
  reg: StoredRegistration,
  token: string,
  state: SnapshotState,
  bundleId: string
): PushJob {
  const dismissalDate = state.rangeEnd + APPLE_REFERENCE_DATE;

  return {
    deviceId,
    token,
    sandbox: reg.sandbox,
    pushType: "liveactivity",
    topic: `${bundleId}.push-type.liveactivity`,
    kind: "end",
    dayKey: state.dayKey,
    payload: {
      aps: {
        timestamp: 0,
        event: "end",
        "content-state": state,
        "dismissal-date": dismissalDate,
      },
    },
  };
}

function stampTimestamp(payload: Record<string, unknown>): Record<string, unknown> {
  const aps = payload.aps as Record<string, unknown> | undefined;
  if (!aps) return payload;
  return {
    ...payload,
    aps: {
      ...aps,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };
}

async function writeJobsForToday(
  env: Env,
  jobs: Array<{ time: string; job: PushJob }>
): Promise<void> {
  const grouped = new Map<string, PushJob[]>();
  for (const { time, job } of jobs) {
    const existing = grouped.get(time) ?? [];
    existing.push(job);
    grouped.set(time, existing);
  }

  const slotKeysByDevice = new Map<string, Set<string>>();

  for (const [time, slotJobs] of grouped) {
    const dayKey = slotJobs[0]?.dayKey ?? todayCST();
    const key = dispatchSlotKey(dayKey, time);
    const existing =
      ((await env.OUTSPIRE_KV.get(key, "json")) as DispatchSlot) ?? [];
    const merged = existing.filter(
      (job) =>
        !slotJobs.some(
          (candidate) =>
            candidate.deviceId === job.deviceId && candidate.kind === job.kind
        )
    );
    merged.push(...slotJobs);
    await env.OUTSPIRE_KV.put(key, JSON.stringify(merged), {
      expirationTtl: SLOT_TTL,
    });

    for (const job of slotJobs) {
      const keys = slotKeysByDevice.get(job.deviceId) ?? new Set<string>();
      keys.add(key);
      slotKeysByDevice.set(job.deviceId, keys);
    }
  }

  for (const [deviceId, keys] of slotKeysByDevice) {
    const dayKey = jobs.find((entry) => entry.job.deviceId === deviceId)?.job.dayKey ?? todayCST();
    const indexKey = dispatchIndexKey(dayKey, deviceId);
    const existing =
      ((await env.OUTSPIRE_KV.get(indexKey, "json")) as DispatchIndex | null) ?? [];
    const merged = Array.from(new Set([...existing, ...keys]));
    await env.OUTSPIRE_KV.put(indexKey, JSON.stringify(merged), {
      expirationTtl: SLOT_TTL,
    });
  }
}

async function removePendingJobsForDevice(
  env: Env,
  deviceId: string,
  predicate?: (job: PushJob) => boolean
): Promise<void> {
  const dayKey = todayCST();
  const indexKey = dispatchIndexKey(dayKey, deviceId);
  const indexedKeys =
    ((await env.OUTSPIRE_KV.get(indexKey, "json")) as DispatchIndex | null) ?? [];
  const keys =
    indexedKeys.length > 0
      ? indexedKeys.map((name) => ({ name } as KVNamespaceListKey<unknown>))
      : await kvListAll(env.OUTSPIRE_KV, {
          prefix: `dispatch:${dayKey}:`,
        });
  const remainingKeys = new Set<string>();

  for (const key of keys) {
    const slot =
      ((await env.OUTSPIRE_KV.get(key.name, "json")) as DispatchSlot) ?? [];
    const filtered = slot.filter((job) => {
      if (job.deviceId !== deviceId) return true;
      return predicate ? !predicate(job) : false;
    });

    if (filtered.length === 0) {
      await env.OUTSPIRE_KV.delete(key.name);
    } else if (filtered.length !== slot.length) {
      await env.OUTSPIRE_KV.put(key.name, JSON.stringify(filtered), {
        expirationTtl: SLOT_TTL,
      });
      if (filtered.some((job) => job.deviceId === deviceId)) {
        remainingKeys.add(key.name);
      }
    } else if (slot.some((job) => job.deviceId === deviceId)) {
      remainingKeys.add(key.name);
    }
  }

  if (remainingKeys.size === 0) {
    await env.OUTSPIRE_KV.delete(indexKey);
  } else {
    await env.OUTSPIRE_KV.put(indexKey, JSON.stringify(Array.from(remainingKeys)), {
      expirationTtl: SLOT_TTL,
    });
  }
}

async function scheduleStartJobsForRegistration(
  env: Env,
  deviceId: string,
  reg: StoredRegistration
): Promise<{ pushed: boolean; reason?: string }> {
  const today = todayCST();
  if (reg.currentActivity?.dayKey === today) {
    return { pushed: false, reason: "activity_already_exists" };
  }

  const decision = await decideTodayForUser(env, reg);
  if (!decision.shouldSendPushes) {
    return { pushed: false, reason: "no_classes_today" };
  }

  const periods = reg.schedule[String(decision.useWeekday)] ?? [];
  const transitions = buildStateTransitions(today, periods, decision);
  const startTransition = transitions.find((item) => item.kind === "start");
  if (!startTransition) {
    return { pushed: false, reason: "no_remaining_classes" };
  }
  const staleDateUnix = finalDismissalUnix(today, periods, decision);

  const { hours, minutes } = currentTimeCST();
  const nowMinutes = hours * 60 + minutes;
  const startMinutes = minutesFor(startTransition.time);
  const startJob = buildStartJob(
    deviceId,
    reg,
    startTransition.state,
    env.APNS_BUNDLE_ID,
    staleDateUnix
  );

  if (startMinutes > nowMinutes) {
    await writeJobsForToday(env, [{ time: startTransition.time, job: startJob }]);
    return { pushed: false, reason: "scheduled" };
  }

  const pushResult = await sendPush(
    { ...apnsConfig(env), useSandbox: reg.sandbox },
    {
      token: startJob.token,
      pushType: startJob.pushType,
      topic: startJob.topic,
      payload: stampTimestamp(startJob.payload),
    }
  );

  return { pushed: pushResult.ok, reason: pushResult.ok ? undefined : "start_push_failed" };
}

async function scheduleUpdateJobsForActivity(
  env: Env,
  deviceId: string,
  reg: StoredRegistration
): Promise<void> {
  const activity = reg.currentActivity;
  if (!activity || activity.dayKey !== todayCST()) return;

  const decision = await decideTodayForUser(env, reg);
  if (!decision.shouldSendPushes) return;

  const periods = reg.schedule[String(decision.useWeekday)] ?? [];
  const transitions = buildStateTransitions(todayCST(), periods, decision);
  const staleDateUnix = finalDismissalUnix(todayCST(), periods, decision);
  const { hours, minutes } = currentTimeCST();
  const nowMinutes = hours * 60 + minutes;

  const jobs: Array<{ time: string; job: PushJob }> = [];
  for (const transition of transitions) {
    if (transition.kind === "start") continue;
    if (transition.state.sequence <= activity.lastSequence) continue;
    if (minutesFor(transition.time) < nowMinutes) continue;

    const job =
      transition.kind === "end"
        ? buildEndJob(
            deviceId,
            reg,
            activity.pushUpdateToken,
            transition.state,
            env.APNS_BUNDLE_ID
          )
        : buildUpdateJob(
            deviceId,
            reg,
            activity.pushUpdateToken,
            transition.state,
            env.APNS_BUNDLE_ID,
            staleDateUnix
          );
    jobs.push({ time: transition.time, job });
  }

  await removePendingJobsForDevice(env, deviceId, (job) => job.kind !== "start");
  if (jobs.length > 0) {
    await writeJobsForToday(env, jobs);
  }
}

async function handleDailyPlan(env: Env): Promise<void> {
  const today = todayCST();
  const yesterday = nowCSTDate();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);

  const oldSlots = await kvListAll(env.OUTSPIRE_KV, {
    prefix: `dispatch:${yKey}:`,
  });
  for (const key of oldSlots) {
    await env.OUTSPIRE_KV.delete(key.name);
  }

  const oldIndexes = await kvListAll(env.OUTSPIRE_KV, {
    prefix: `dispatch-index:${yKey}:`,
  });
  for (const key of oldIndexes) {
    await env.OUTSPIRE_KV.delete(key.name);
  }

  const regKeys = await kvListAll(env.OUTSPIRE_KV, { prefix: "reg:" });
  const jobs: Array<{ time: string; job: PushJob }> = [];

  for (const key of regKeys) {
    const reg = (await env.OUTSPIRE_KV.get(key.name, "json")) as StoredRegistration | null;
    if (!reg) continue;

    if (reg.currentActivity && reg.currentActivity.dayKey !== today) {
      reg.currentActivity = undefined;
      await env.OUTSPIRE_KV.put(key.name, JSON.stringify(reg), {
        expirationTtl: REG_TTL,
      });
    }

    const deviceId = key.name.replace("reg:", "");
    const decision = await decideTodayForUser(env, reg);
    if (!decision.shouldSendPushes) continue;
    if (reg.currentActivity?.dayKey === today) continue;

    const periods = reg.schedule[String(decision.useWeekday)] ?? [];
    const transitions = buildStateTransitions(today, periods, decision);
    const startTransition = transitions.find((item) => item.kind === "start");
    if (!startTransition) continue;
    const staleDateUnix = finalDismissalUnix(today, periods, decision);

    jobs.push({
      time: startTransition.time,
      job: buildStartJob(
        deviceId,
        reg,
        startTransition.state,
        env.APNS_BUNDLE_ID,
        staleDateUnix
      ),
    });
  }

  await writeJobsForToday(env, jobs);
}

async function handleMinuteDispatch(env: Env): Promise<void> {
  const now = currentTimeCST();
  const dayKey = todayCST();
  const slotKey = dispatchSlotKey(dayKey, formatTime(now.hours, now.minutes));
  const jobs =
    ((await env.OUTSPIRE_KV.get(slotKey, "json")) as DispatchSlot) ?? [];
  if (jobs.length === 0) return;

  const config = apnsConfig(env);
  const remaining: PushJob[] = [];
  const dispatchedDevices = new Set<string>();

  for (const job of jobs) {
    dispatchedDevices.add(job.deviceId);
    const reg = (await env.OUTSPIRE_KV.get(
      `reg:${job.deviceId}`,
      "json"
    )) as StoredRegistration | null;
    if (!reg) continue;

    if (job.kind === "start" && reg.currentActivity?.dayKey === todayCST()) {
      continue;
    }

    if (job.kind !== "start") {
      if (!reg.currentActivity || reg.currentActivity.dayKey !== todayCST()) {
        continue;
      }
      if (job.token !== reg.currentActivity.pushUpdateToken) {
        continue;
      }
    }

    const result = await sendPush(
      { ...config, useSandbox: job.sandbox },
      {
        token: job.token,
        pushType: job.pushType,
        topic: job.topic,
        payload: stampTimestamp(job.payload),
      }
    );

    if (!result.ok) {
      console.error(
        `APNs push failed for device ${job.deviceId}: ${result.status} ${result.body}`
      );
      if (result.status !== 410) {
        remaining.push(job);
      } else {
        await env.OUTSPIRE_KV.delete(`reg:${job.deviceId}`);
      }
      continue;
    }

    const aps = job.payload.aps as Record<string, unknown> | undefined;
    const contentState = aps?.["content-state"] as
      | { sequence?: number }
      | undefined;

    if (reg.currentActivity && job.kind !== "start" && typeof contentState?.sequence === "number") {
      reg.currentActivity.lastSequence = contentState.sequence;
      reg.currentActivity.updatedAt = Math.floor(Date.now() / 1000);
      await env.OUTSPIRE_KV.put(`reg:${job.deviceId}`, JSON.stringify(reg), {
        expirationTtl: REG_TTL,
      });
    }

    if (job.kind === "end" && reg.currentActivity?.dayKey === todayCST()) {
      reg.currentActivity = undefined;
      await env.OUTSPIRE_KV.put(`reg:${job.deviceId}`, JSON.stringify(reg), {
        expirationTtl: REG_TTL,
      });
    }
  }

  if (remaining.length === 0) {
    await env.OUTSPIRE_KV.delete(slotKey);
  } else {
    await env.OUTSPIRE_KV.put(slotKey, JSON.stringify(remaining), {
      expirationTtl: SLOT_TTL,
    });
  }

  for (const deviceId of dispatchedDevices) {
    const indexKey = dispatchIndexKey(dayKey, deviceId);
    const existing =
      ((await env.OUTSPIRE_KV.get(indexKey, "json")) as DispatchIndex | null) ?? [];
    if (existing.length === 0) continue;

    const updated = existing.filter((key) => key !== slotKey);
    if (updated.length === 0) {
      await env.OUTSPIRE_KV.delete(indexKey);
    } else {
      await env.OUTSPIRE_KV.put(indexKey, JSON.stringify(updated), {
        expirationTtl: SLOT_TTL,
      });
    }
  }
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body: RegisterBody = await request.json();
  if (!body.deviceId || !body.pushStartToken || !body.schedule) {
    return new Response("Missing required fields", { status: 400 });
  }

  const existing = (await env.OUTSPIRE_KV.get(
    `reg:${body.deviceId}`,
    "json"
  )) as StoredRegistration | null;

  const registration: StoredRegistration = {
    pushStartToken: body.pushStartToken,
    sandbox: body.sandbox ?? false,
    track: body.track,
    entryYear: body.entryYear,
    schedule: body.schedule,
    paused: existing?.paused ?? false,
    resumeDate: existing?.resumeDate,
    currentActivity: existing?.currentActivity,
  };

  await env.OUTSPIRE_KV.put(`reg:${body.deviceId}`, JSON.stringify(registration), {
    expirationTtl: REG_TTL,
  });

  const result = await scheduleStartJobsForRegistration(
    env,
    body.deviceId,
    registration
  );

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "content-type": "application/json" },
  });
}

async function handleActivityToken(
  request: Request,
  env: Env
): Promise<Response> {
  const body: ActivityTokenBody = await request.json();
  if (!body.deviceId || !body.activityId || !body.dayKey || !body.pushUpdateToken) {
    return new Response("Missing required fields", { status: 400 });
  }

  const key = `reg:${body.deviceId}`;
  const reg = (await env.OUTSPIRE_KV.get(key, "json")) as StoredRegistration | null;
  if (!reg) return new Response("Not found", { status: 404 });

  reg.currentActivity = {
    activityId: body.activityId,
    dayKey: body.dayKey,
    pushUpdateToken: body.pushUpdateToken,
    owner: body.owner,
    lastSequence: reg.currentActivity?.activityId === body.activityId
      ? reg.currentActivity.lastSequence
      : -1,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  await env.OUTSPIRE_KV.put(key, JSON.stringify(reg), {
    expirationTtl: REG_TTL,
  });

  await removePendingJobsForDevice(env, body.deviceId, (job) => job.kind === "start");
  await scheduleUpdateJobsForActivity(env, body.deviceId, reg);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

async function handleActivityEnded(
  request: Request,
  env: Env
): Promise<Response> {
  const body: ActivityEndedBody = await request.json();
  if (!body.deviceId || !body.activityId || !body.dayKey) {
    return new Response("Missing required fields", { status: 400 });
  }

  const key = `reg:${body.deviceId}`;
  const reg = (await env.OUTSPIRE_KV.get(key, "json")) as StoredRegistration | null;
  if (!reg) return new Response("Not found", { status: 404 });

  if (reg.currentActivity?.activityId === body.activityId) {
    reg.currentActivity = undefined;
    await env.OUTSPIRE_KV.put(key, JSON.stringify(reg), {
      expirationTtl: REG_TTL,
    });
  }

  await removePendingJobsForDevice(env, body.deviceId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

async function handleUnregister(request: Request, env: Env): Promise<Response> {
  const body: { deviceId: string } = await request.json();
  if (!body.deviceId) return new Response("Missing deviceId", { status: 400 });

  await env.OUTSPIRE_KV.delete(`reg:${body.deviceId}`);
  await removePendingJobsForDevice(env, body.deviceId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

async function handlePause(request: Request, env: Env): Promise<Response> {
  const body: { deviceId: string; resumeDate?: string } = await request.json();
  const key = `reg:${body.deviceId}`;
  const reg = (await env.OUTSPIRE_KV.get(key, "json")) as StoredRegistration | null;
  if (!reg) return new Response("Not found", { status: 404 });

  reg.paused = true;
  reg.resumeDate = body.resumeDate;
  await env.OUTSPIRE_KV.put(key, JSON.stringify(reg), {
    expirationTtl: REG_TTL,
  });

  await removePendingJobsForDevice(env, body.deviceId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

async function handleResume(request: Request, env: Env): Promise<Response> {
  const body: { deviceId: string } = await request.json();
  const key = `reg:${body.deviceId}`;
  const reg = (await env.OUTSPIRE_KV.get(key, "json")) as StoredRegistration | null;
  if (!reg) return new Response("Not found", { status: 404 });

  reg.paused = false;
  reg.resumeDate = undefined;
  await env.OUTSPIRE_KV.put(key, JSON.stringify(reg), {
    expirationTtl: REG_TTL,
  });

  const result = await scheduleStartJobsForRegistration(env, body.deviceId, reg);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, date: todayCST() }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST") {
      if (!isAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      switch (url.pathname) {
        case "/register":
          return handleRegister(request, env);
        case "/activity-token":
          return handleActivityToken(request, env);
        case "/activity-ended":
          return handleActivityEnded(request, env);
        case "/unregister":
          return handleUnregister(request, env);
        case "/pause":
          return handlePause(request, env);
        case "/resume":
          return handleResume(request, env);
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    if (controller.cron === "30 22 * * *") {
      ctx.waitUntil(handleDailyPlan(env));
    } else {
      ctx.waitUntil(handleMinuteDispatch(env));
    }
  },
} satisfies ExportedHandler<Env>;
