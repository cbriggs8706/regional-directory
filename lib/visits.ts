export const visitTimeZone = "America/Boise";

export const visitLabels = {
  sacrament: "Sacrament meeting",
  council: "Ward / branch council",
  visit: "Unit visit",
  sacrament_talk: "Sacrament Talk",
  fifth_sunday_lesson: "5th Sunday Lesson",
  youth: "Youth",
  activity: "Activity",
  coordinating_council: "Coordinating Council",
  training: "Training",
  drive: "Driving",
} as const;

export type VisitKind = keyof typeof visitLabels;
export type VisitEvent = {
  id: string;
  owner_id: string;
  owner_email: string;
  unit_id: string | null;
  title: string | null;
  notes?: string | null;
  event_date: string;
  kind: VisitKind;
  start_minute: number;
  end_minute: number;
};

export type UnitVisitData = { events: VisitEvent[]; today: string; minute: number; loadError: string | null };

export type UnitDateEvent = {
  id: string;
  unitId: string;
  title: string;
  details: string;
};

export function visitClock() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: visitTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts();
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { today: `${fields.year}-${fields.month}-${fields.day}`, minute: Number(fields.hour) * 60 + Number(fields.minute) };
}

export function todayInVisitZone() {
  return visitClock().today;
}

export function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function offsetMonth(date: string, months: number) {
  const first = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + months);
  return first.toISOString().slice(0, 10);
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
