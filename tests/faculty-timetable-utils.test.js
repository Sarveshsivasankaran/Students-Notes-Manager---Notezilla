const assert = require('assert');
const {
    formatFreeHours,
    getFacultyAvailability,
    normalizeFreeHours,
    parseTimetableAnalysis
} = require('../faculty-timetable-utils');

const parsed = parseTimetableAnalysis(`\`\`\`json
{
  "free_hours": [
    { "day": "Wed", "slots": [{ "start": "2:00 PM", "end": "4:00 PM" }] },
    { "day": "Monday", "slots": [{ "start": "10:00", "end": "11:00" }] }
  ]
}
\`\`\``);

assert.deepStrictEqual(parsed, [
    { day: 'Monday', slots: [{ start: '10:00', end: '11:00' }] },
    { day: 'Wednesday', slots: [{ start: '14:00', end: '16:00' }] }
]);
assert.strictEqual(formatFreeHours(parsed), 'Mon 10:00 AM–11:00 AM, Wed 2:00 PM–4:00 PM');

assert.deepStrictEqual(normalizeFreeHours([
    { day: 'Monday', slots: [
        { start: '11:00', end: '10:00' },
        { start: '09:00', end: '10:00' },
        { start: '09:00', end: '10:00' }
    ] }
]), [{ day: 'Monday', slots: [{ start: '09:00', end: '10:00' }] }]);

const mondaySchedule = [{ day: 'Monday', slots: [{ start: '10:00', end: '11:00' }] }];
const atIndiaTime = iso => new Date(iso);
assert.strictEqual(getFacultyAvailability({
    freeHours: mondaySchedule,
    now: atIndiaTime('2026-07-20T04:45:00.000Z') // Monday 10:15 IST
}).status, 'available');
assert.strictEqual(getFacultyAvailability({
    freeHours: mondaySchedule,
    now: atIndiaTime('2026-07-20T03:00:00.000Z') // Monday 08:30 IST, but not a free period
}).status, 'unavailable');
assert.strictEqual(getFacultyAvailability({
    freeHours: [{ day: 'Monday', slots: [{ start: '16:30', end: '18:00' }] }],
    now: atIndiaTime('2026-07-20T11:30:00.000Z') // Monday 17:00 IST
}).reason, 'outside_working_hours');
assert.strictEqual(getFacultyAvailability({
    freeHours: mondaySchedule,
    manualAvailability: 'on_leave',
    now: atIndiaTime('2026-07-20T04:45:00.000Z')
}).status, 'unavailable');

console.log('Faculty timetable parsing tests passed.');
