export const DEFAULT_BASIC_HOURS = 5;

export const addHoursToTime = (time, hours) => {
  if (!time) return '';

  const [hour, minute] = time.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return '';

  const totalMinutes = (hour * 60) + minute + (hours * 60);
  const minutesInDay = 24 * 60;
  const normalizedMinutes = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const resultHour = Math.floor(normalizedMinutes / 60);
  const resultMinute = normalizedMinutes % 60;

  return `${String(resultHour).padStart(2, '0')}:${String(resultMinute).padStart(2, '0')}`;
};
