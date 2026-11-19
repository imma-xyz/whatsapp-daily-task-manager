
const db = require("./database");

// ==========================================
// MIGRASI DATABASE
// ==========================================

const columns = db.prepare(`
    PRAGMA table_info(reminders)
`).all();

if (!columns.some(column => column.name === "last_sent_key")) {
    db.exec(`
        ALTER TABLE reminders
        ADD COLUMN last_sent_key TEXT
    `);
}

// ==========================================
// VALIDASI FORMAT JAM
// ==========================================

function isValidTime(time) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

// ==========================================
// MENAMBAHKAN JADWAL REMINDER
// ==========================================


function addReminderTimes(userId, newTimes) {
    if (!Array.isArray(newTimes) || newTimes.length === 0) {
        return false;
    }

    if (!newTimes.every(isValidTime)) {
        return false;
    }

    const existing = getReminder(userId);

    const times = [
        ...new Set([
            ...(existing ? existing.times : []),
            ...newTimes
        ])
    ].sort();

    db.prepare(`
        INSERT INTO reminders (
            user_id,
            reminder_times,
            enabled
        )
        VALUES (?, ?, 1)
        ON CONFLICT(user_id)
        DO UPDATE SET
            reminder_times = excluded.reminder_times
    `).run(userId, JSON.stringify(times));

    return true;
}


// ==========================================
// MENGGANTI SELURUH JADWAL REMINDER
// ==========================================

function setReminderTimes(userId, times) {
    if (!Array.isArray(times) || times.length === 0) {
        return false;
    }

    if (!times.every(isValidTime)) {
        return false;
    }

    const uniqueTimes = [...new Set(times)].sort();

    db.prepare(`
        INSERT INTO reminders (
            user_id,
            reminder_times,
            enabled
        )
        VALUES (?, ?, 1)
        ON CONFLICT(user_id)
        DO UPDATE SET
            reminder_times = excluded.reminder_times,
            enabled = 1
    `).run(userId, JSON.stringify(uniqueTimes));

    return true;
}



// ==========================================
// MENGHAPUS JADWAL REMINDER TERTENTU
// ==========================================

function removeReminderTimes(userId, removeTimes) {
    if (!Array.isArray(removeTimes) || removeTimes.length === 0) {
        return false;
    }

    if (!removeTimes.every(isValidTime)) {
        return false;
    }

    const existing = getReminder(userId);

    if (!existing) {
        return false;
    }

    const times = existing.times.filter(
        time => !removeTimes.includes(time)
    );

    if (times.length === existing.times.length) {
        return false;
    }

    db.prepare(`
        UPDATE reminders
        SET reminder_times = ?,
            enabled = ?
        WHERE user_id = ?
    `).run(
        JSON.stringify(times),
        times.length > 0 ? 1 : 0,
        userId
    );

    return true;
}

// ==========================================
// MENGAMBIL PENGATURAN REMINDER
// ==========================================

function getReminder(userId) {
    const reminder = db.prepare(`
        SELECT user_id, reminder_times, enabled
        FROM reminders
        WHERE user_id = ?
    `).get(userId);

    if (!reminder) {
        return null;
    }

    return {
        user_id: reminder.user_id,
        times: JSON.parse(reminder.reminder_times),
        enabled: reminder.enabled === 1
    };
}

// ==========================================
// MENONAKTIFKAN SELURUH REMINDER
// ==========================================

function disableReminders(userId) {
    const result = db.prepare(`
        UPDATE reminders
        SET enabled = 0
        WHERE user_id = ?
    `).run(userId);

    return result.changes > 0;
}


 
// ==========================================
// MENGAKTIFKAN SELURUH REMINDER
// ==========================================

function enableReminders(userId) {
    const reminder = getReminder(userId);

    if (!reminder || reminder.times.length === 0) {
        return false;
    }

    db.prepare(`
        UPDATE reminders
        SET enabled = 1
        WHERE user_id = ?
    `).run(userId);

    return true;
}


// ==========================================
// MENGAMBIL REMINDER YANG SUDAH WAKTUNYA
// ==========================================

function getDueReminders(date, time) {
    const reminders = db.prepare(`
        SELECT user_id, reminder_times, last_sent_key
        FROM reminders
        WHERE enabled = 1
    `).all();

    const currentKey = `${date} ${time}`;

    return reminders.filter(reminder => {
        const times = JSON.parse(reminder.reminder_times);

        return (
            times.includes(time) &&
            reminder.last_sent_key !== currentKey
        );
    });
}

// ==========================================
// MENANDAI REMINDER SUDAH TERKIRIM
// ==========================================

function markReminderSent(userId, date, time) {
    const currentKey = `${date} ${time}`;

    db.prepare(`
        UPDATE reminders
        SET last_sent_key = ?
        WHERE user_id = ?
    `).run(currentKey, userId);
}

// ==========================================
// EXPORT
// ==========================================

module.exports = {
    addReminderTimes,
    setReminderTimes,
    removeReminderTimes,
    getReminder,
    disableReminders,
    enableReminders,
    getDueReminders,
    markReminderSent
};