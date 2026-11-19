
const db = require("./database");

// ==========================================
// MIGRASI DATABASE
// Penanda task yang dibatalkan
// ==========================================

const taskColumns = db.prepare(`
    PRAGMA table_info(tasks)
`).all();

if (!taskColumns.some(column => column.name === "cancelled")) {
    db.exec(`
        ALTER TABLE tasks
        ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0
    `);
}

// Menentukan tanggal kerja berdasarkan batas reset pukul 04.00 WIB
function getTaskDate() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);

    const values = {};

    for (const part of parts) {
        values[part.type] = part.value;
    }

    let date = new Date(Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day)
    ));

    // Sebelum pukul 04.00, masih dianggap hari kerja sebelumnya
    if (Number(values.hour) < 4) {
        date.setUTCDate(date.getUTCDate() - 1);
    }

    return date.toISOString().slice(0, 10);
}

// Menambahkan satu atau beberapa task

function addTasks(userId, taskList) {
    const taskDate = getTaskDate();

    const tasks = taskList
        .map(task => task.trim())
        .filter(task => task.length > 0);

    if (tasks.length === 0) {
        return [];
    }

    const existing = db.prepare(`
        SELECT COALESCE(MAX(position), 0) AS lastPosition
        FROM tasks
        WHERE user_id = ? AND task_date = ?
    `).get(userId, taskDate);

    let position = existing.lastPosition;

    const insert = db.prepare(`
        INSERT INTO tasks (
            user_id,
            task,
            position,
            status,
            task_date
        )
        VALUES (?, ?, ?, 'pending', ?)
    `);

    db.exec("BEGIN");

    try {
        for (const task of tasks) {
            position++;

            insert.run(
                userId,
                task,
                position,
                taskDate
            );
        }

        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }

    return getTasks(userId);
}


// Mengambil seluruh task pada hari kerja aktif

function getTasks(userId) {
    const taskDate = getTaskDate();

    return db.prepare(`
        SELECT id, task, position, status, task_date
        FROM tasks
        WHERE user_id = ?
        AND task_date = ?
        AND cancelled = 0
        ORDER BY position ASC
    `).all(userId, taskDate);
}



function formatTaskList(tasks, name = "") {
    if (tasks.length === 0) {
        return (
            `📋 ${name ? name.toUpperCase() + "'S " : ""}TO-DO LIST\n\n` +
            `Belum ada task untuk hari ini. ✨`
        );
    }

    const taskDate = tasks[0].task_date;

    const formattedDate = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date(`${taskDate}T12:00:00+07:00`));

    const taskLines = tasks.map(task => {
        const status = task.status === "done" ? "✅" : "▫️";
        return `${task.position}. ${status} ${task.task}`;
    });

    const completed = tasks.filter(
        task => task.status === "done"
    ).length;

    const total = tasks.length;

    const progressMessage = completed === total
        ? "🎉 All tasks completed!"
        : "Keep going! 💪";

    const title = name
        ? `📋 ${name.toUpperCase()}'S TO-DO LIST`
        : "📋 TO-DO LIST";

    return (
        `${title}\n` +
        `${formattedDate}\n\n` +
        `${taskLines.join("\n")}\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `Progress: ${completed}/${total} completed\n` +
        `${progressMessage}`
    );
}



// Menandai task selesai

function completeTask(userId, position) {
    const taskDate = getTaskDate();

    const result = db.prepare(`
        UPDATE tasks
        SET status = 'done'
        WHERE user_id = ?
        AND task_date = ?
        AND position = ?
        AND status = 'pending'
        AND cancelled = 0
    `).run(userId, taskDate, position);

    return result.changes > 0;
}


// Membatalkan task




function cancelTask(userId, position) {
    const taskDate = getTaskDate();

    db.exec("BEGIN");

    try {
        const result = db.prepare(`
            DELETE FROM tasks
            WHERE user_id = ?
            AND task_date = ?
            AND position = ?
            AND status = 'pending'
            AND cancelled = 0
        `).run(userId, taskDate, position);

        if (result.changes > 0) {
            db.prepare(`
                UPDATE tasks
                SET position = position - 1
                WHERE user_id = ?
                AND task_date = ?
                AND position > ?
            `).run(userId, taskDate, position);
        }

        db.exec("COMMIT");
        return result.changes > 0;

    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}






function resetDailyTasks() {
    const currentDate = getTaskDate();
    const carriedOver = [];

    db.exec("BEGIN");

    try {
        // Hapus task yang sudah selesai atau dibatalkan dari hari sebelumnya
        db.prepare(`
            DELETE FROM tasks
            WHERE task_date < ?
            AND (status = 'done' OR cancelled = 1)
        `).run(currentDate);

        // Ambil pengguna yang masih memiliki task pending
        const users = db.prepare(`
            SELECT DISTINCT
                u.user_id,
                u.name,
                u.destination_jid
            FROM users u
            JOIN tasks t ON t.user_id = u.user_id
            WHERE t.task_date < ?
            AND t.status = 'pending'
            AND t.cancelled = 0
        `).all(currentDate);

        const getPendingTasks = db.prepare(`
            SELECT id, task
            FROM tasks
            WHERE user_id = ?
            AND task_date < ?
            AND status = 'pending'
            AND cancelled = 0
            ORDER BY id ASC
        `);

        const updateTask = db.prepare(`
            UPDATE tasks
            SET position = ?, task_date = ?
            WHERE id = ?
        `);

        for (const user of users) {
            const tasks = getPendingTasks.all(
                user.user_id,
                currentDate
            );

            if (tasks.length === 0) continue;

            tasks.forEach((task, index) => {
                updateTask.run(
                    index + 1,
                    currentDate,
                    task.id
                );
            });

            carriedOver.push({
                user_id: user.user_id,
                name: user.name,
                destination_jid: user.destination_jid,
                tasks: tasks.map((task, index) => ({
                    task: task.task,
                    position: index + 1
                }))
            });
        }

        db.exec("COMMIT");

        console.log(
            "Reset task harian selesai:",
            currentDate
        );

        return carriedOver;

    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}


function catchUpDailyReset() {
    const currentDate = getTaskDate();

    const outdatedTasks = db.prepare(`
        SELECT COUNT(*) AS total
        FROM tasks
        WHERE task_date < ?
    `).get(currentDate);

    if (outdatedTasks.total > 0) {
        console.log("Ditemukan task dari hari sebelumnya.");

        const carriedOver = resetDailyTasks();

        console.log("Auto-reset berhasil dijalankan.");

        return carriedOver;
    }

    console.log("Task sudah sesuai dengan tanggal kerja.");

    return [];
}




module.exports = {
    getTaskDate,
    addTasks,
    getTasks,
    formatTaskList,
    completeTask,
    cancelTask,
    resetDailyTasks,
    catchUpDailyReset
};