/** Cameroon is UTC+1 all year (no DST). Start of "today" in Africa/Douala. */
export function startOfDayDouala(at: Date): Date {
  const shifted = new Date(at.getTime() + 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 60 * 60 * 1000);
}
