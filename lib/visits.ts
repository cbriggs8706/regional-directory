export const visitTimeZone = "America/Boise";

export const visitLabels = {
  sacrament: "Sacrament meeting",
  council: "Ward / branch council",
  visit: "Unit visit",
  drive: "Driving",
} as const;

export type VisitKind = keyof typeof visitLabels;
export type VisitEvent = {
  id: string;
  owner_id: string;
  owner_email: string;
  unit_id: string | null;
  title: string | null;
  event_date: string;
  kind: VisitKind;
  start_minute: number;
  end_minute: number;
};

export function todayInVisitZone() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: visitTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function startOfWeek(date: string) {
  return offsetDate(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

export function offsetMonth(date: string, months: number) {
  const first = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + months);
  return first.toISOString().slice(0, 10);
}

export type VisitView = "rolling" | "month" | "week";

export function shiftVisitPeriod(date: string, view: VisitView, direction: -1 | 1) {
  if (view === "week") return offsetDate(date, direction * 7);
  if (view === "month") return offsetMonth(date, direction);
  const first = offsetMonth(date, direction * 3);
  const last = offsetDate(offsetMonth(first, 1), -1);
  return first.slice(0, 8) + (date.slice(8) < last.slice(8) ? date.slice(8) : last.slice(8));
}

export function visitPeriod(date: string, view: VisitView, allDays: boolean) {
  const from = view === "rolling" ? date : view === "month" ? offsetMonth(date, 0) : startOfWeek(date);
  const until = shiftVisitPeriod(from, view, 1);
  const days: string[] = [];
  for (let day = from; day < until; day = offsetDate(day, 1)) {
    if (allDays || day === startOfWeek(day)) days.push(day);
  }
  return { from, until, days };
}

export function timeToMinute(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minuteToTime(minutes: number) {
  return `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const clock = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

export function formatVisitTime(minute: number) {
  return clock.format(new Date(minute * 60_000));
}
