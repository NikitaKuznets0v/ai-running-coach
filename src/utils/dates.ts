const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayRu(d: Date): string {
  return daysRu[d.getDay()];
}

export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return d;
}

export function nextMondayFrom(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const delta = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export function weekRangeFromMonday(monday: Date) {
  const start = new Date(monday);
  const end = new Date(monday);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function remainingWeekDates(from: Date): Date[] {
  const res: Date[] = [];
  const d = new Date(from);
  for (let i = 0; i < 7 - d.getDay(); i++) {
    res.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
  }
  return res;
}
