const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ALIASES = new Map(DAY_ORDER.flatMap(day => [
    [day.toLowerCase(), day],
    [day.slice(0, 3).toLowerCase(), day]
]));

function parseTime(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3]?.toUpperCase();
    if (minute > 59) return null;

    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        if (hour === 12) hour = 0;
        if (meridiem === 'PM') hour += 12;
    } else if (hour > 23) {
        return null;
    }

    return { minutes: (hour * 60) + minute, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function normalizeFreeHours(value) {
    const rawDays = Array.isArray(value) ? value : [];
    const grouped = new Map();

    rawDays.forEach(entry => {
        const day = DAY_ALIASES.get(String(entry?.day || '').trim().toLowerCase());
        if (!day) return;

        const slots = Array.isArray(entry.slots) ? entry.slots : [];
        const normalizedSlots = slots.map(slot => {
            const start = parseTime(slot?.start);
            const end = parseTime(slot?.end);
            if (!start || !end || end.minutes <= start.minutes) return null;
            return { start: start.value, end: end.value };
        }).filter(Boolean);

        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day).push(...normalizedSlots);
    });

    return DAY_ORDER.filter(day => grouped.has(day)).map(day => {
        const seen = new Set();
        const slots = grouped.get(day)
            .sort((left, right) => left.start.localeCompare(right.start))
            .filter(slot => {
                const key = `${slot.start}-${slot.end}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8);
        return { day, slots };
    }).filter(entry => entry.slots.length > 0);
}

function parseTimetableAnalysis(rawText) {
    const cleaned = String(rawText || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const parsed = JSON.parse(cleaned);
    return normalizeFreeHours(parsed.free_hours || parsed.freeHours || []);
}

function formatTime12(value) {
    const parsed = parseTime(value);
    if (!parsed) return String(value || '');
    const hour24 = Math.floor(parsed.minutes / 60);
    const minute = parsed.minutes % 60;
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function formatFreeHours(value) {
    return normalizeFreeHours(value).flatMap(entry => entry.slots.map(slot =>
        `${entry.day.slice(0, 3)} ${formatTime12(slot.start)}–${formatTime12(slot.end)}`
    )).join(', ');
}

function getZonedDayAndMinutes(now, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        day: values.weekday,
        minutes: (Number(values.hour) * 60) + Number(values.minute)
    };
}

function getFacultyAvailability({
    freeHours,
    manualAvailability = 'available',
    now = new Date(),
    timeZone = 'Asia/Kolkata',
    dayStart = '08:00',
    dayEnd = '17:00'
} = {}) {
    if (manualAvailability !== 'available') {
        return { status: 'unavailable', reason: manualAvailability };
    }

    const start = parseTime(dayStart);
    const end = parseTime(dayEnd);
    const current = getZonedDayAndMinutes(now, timeZone);
    if (!start || !end || current.minutes < start.minutes || current.minutes >= end.minutes) {
        return { status: 'unavailable', reason: 'outside_working_hours' };
    }

    const today = normalizeFreeHours(freeHours).find(entry => entry.day === current.day);
    const isFree = Boolean(today?.slots.some(slot => {
        const slotStart = parseTime(slot.start);
        const slotEnd = parseTime(slot.end);
        return slotStart && slotEnd
            && current.minutes >= Math.max(start.minutes, slotStart.minutes)
            && current.minutes < Math.min(end.minutes, slotEnd.minutes);
    }));

    return {
        status: isFree ? 'available' : 'unavailable',
        reason: isFree ? 'free_period' : 'scheduled_or_no_free_period'
    };
}

module.exports = {
    formatFreeHours,
    formatTime12,
    getFacultyAvailability,
    normalizeFreeHours,
    parseTimetableAnalysis
};
