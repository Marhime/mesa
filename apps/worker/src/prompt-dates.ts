// Dates as prompts say them. In UTC: the household's own time zone is not stored, so near midnight
// "today" may be the household's tomorrow or yesterday.

/** "2026-11-07". */
export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** "Saturday", for "2026-11-07". */
export const weekdayOf = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/** "Today is 2026-11-07 (Saturday)." */
export const todayLine = (today: Date): string => `Today is ${isoDay(today)} (${weekdayOf(isoDay(today))}).`;
