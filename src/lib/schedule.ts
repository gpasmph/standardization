/** MPH updates go out Wednesday morning and Friday 5 PM (local time). */
const SLOTS = [
  { day: 3, hour: 9, label: 'Wednesday AM' },
  { day: 5, hour: 17, label: 'Friday 5 PM' },
] as const;

export interface Slot { label: string; at: Date }

export function nextSlot(now = new Date()): Slot {
  const dates = SLOTS.map((s) => {
    const d = new Date(now);
    d.setHours(s.hour, 0, 0, 0);
    d.setDate(d.getDate() + ((s.day - d.getDay() + 7) % 7));
    if (d <= now) d.setDate(d.getDate() + 7);
    return { label: s.label, at: d };
  });
  return dates.reduce((a, b) => (b.at < a.at ? b : a));
}

export function inText(at: Date, now = new Date()): string {
  const hours = Math.round((at.getTime() - now.getTime()) / 36e5);
  if (hours < 24) return `in ${Math.max(1, hours)} h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
