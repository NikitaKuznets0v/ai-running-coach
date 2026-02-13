const daysMap: Record<string, string> = {
  'понедельник': 'понедельник',
  'вторник': 'вторник',
  'среда': 'среда',
  'четверг': 'четверг',
  'пятница': 'пятница',
  'суббота': 'суббота',
  'воскресенье': 'воскресенье',
  'пн': 'понедельник',
  'вт': 'вторник',
  'ср': 'среда',
  'чт': 'четверг',
  'пт': 'пятница',
  'сб': 'суббота',
  'вс': 'воскресенье'
};

export function extractPreferredDays(message: string): string | null {
  const m = message.toLowerCase();
  const found = new Set<string>();
  for (const key of Object.keys(daysMap)) {
    if (m.includes(key)) found.add(daysMap[key]);
  }
  if (!found.size) return null;
  return Array.from(found).join(', ');
}
