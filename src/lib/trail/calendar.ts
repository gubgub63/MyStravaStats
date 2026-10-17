/** Monday-first month, using local noon to avoid daylight-saving date shifts. */
export function monthDays(year: number, month: number): (string | null)[] {
  const offset = (new Date(year, month, 1, 12).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day < 1 || day > count
      ? null
      : `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}
