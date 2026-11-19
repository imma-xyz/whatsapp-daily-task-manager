
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(
    __dirname,
    "..",
    "database",
    "tasks.db"
);

fs.mkdirSync(path.dirname(databasePath), {
    recursive: true
});

const db = new DatabaseSync(databasePath);

db.exec("PRAGMA foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL
            CHECK (mode IN ('GROUP', 'PERSONAL')),
        destination_jid TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        task TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'done')),
        task_date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)
            REFERENCES users(user_id)
            ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user
    ON tasks(user_id);

    CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON tasks(user_id, status, task_date);

    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        reminder_times TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)
            REFERENCES users(user_id)
            ON DELETE CASCADE
    );
`);


const userColumns = db.prepare(`
    PRAGMA table_info(users)
`).all();

if (!userColumns.some(column => column.name === "name")) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN name TEXT
    `);
}


console.log("Database berhasil diinisialisasi!");

module.exports = db;
