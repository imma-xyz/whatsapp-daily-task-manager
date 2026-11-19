
const db = require("./database");
const { addReminderTimes } = require("./reminders");

const DEFAULT_REMINDER_TIMES = [
    "09:00",
    "12:00",
    "16:00",
    "20:00"
];

function registerUser(userId, name, mode, destinationJid) {
    const existing = getUser(userId);

    if (existing) {
        return {
            success: false,
            reason: "already_registered",
            existingMode: existing.mode
        };
    }

    // Pastikan satu grup hanya memiliki satu pemilik
    if (mode === "GROUP") {
        const groupOwner = db.prepare(`
            SELECT user_id FROM users
            WHERE destination_jid = ?
            AND mode = 'GROUP'
        `).get(destinationJid);

        if (groupOwner) {
            return {
                success: false,
                reason: "group_already_registered"
            };
        }
    }

    db.prepare(`
        INSERT INTO users (
            user_id,
            name,
            mode,
            destination_jid
        )
        VALUES (?, ?, ?, ?)
    `).run(userId, name, mode, destinationJid);

    // Otomatis mengaktifkan default reminder untuk pengguna baru
    addReminderTimes(userId, DEFAULT_REMINDER_TIMES);

    return {
        success: true,
        alreadyRegistered: false
    };
}

function updateUserName(userId, name) {
    return db.prepare(`
        UPDATE users
        SET name = ?
        WHERE user_id = ?
    `).run(name, userId).changes > 0;
}

function getUser(userId) {
    return db.prepare(`
        SELECT * FROM users
        WHERE user_id = ?
    `).get(userId);
}

module.exports = {
    registerUser,
    updateUserName,
    getUser
};
