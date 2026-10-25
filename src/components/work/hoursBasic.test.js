import { addHoursToTime } from './hoursBasic';

test('calculates the suggested exit from the entry and basic hours', () => {
  expect(addHoursToTime('16:00', 6)).toBe('22:00');
});

test('wraps the suggested exit to the next day', () => {
  expect(addHoursToTime('22:00', 5)).toBe('03:00');
});
