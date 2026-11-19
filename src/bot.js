
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("baileys");

const pino = require("pino");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");

const {
    registerUser,
    updateUserName,
    getUser
} = require("./registration");

const {
    addTasks,
    getTasks,
    formatTaskList,
    completeTask,
    cancelTask,
    resetDailyTasks,
    catchUpDailyReset
} = require("./tasks");

const {
    addReminderTimes,
    removeReminderTimes,
    getReminder,
    disableReminders,
    enableReminders,
    getDueReminders,
    markReminderSent
} = require("./reminders");

// ==========================================
// STATUS KONEKSI WHATSAPP
// ==========================================

let activeSock = null;
let isWhatsAppConnected = false;
let reminderCheckRunning = false;

const pendingRegistrations = new Map();


// ==========================================
// RESET OTOMATIS SETIAP HARI PUKUL 04.00 WIB
// ==========================================


cron.schedule("0 4 * * *", async () => {
    console.log("Menjalankan reset harian...");

    try {
        const carriedOver = resetDailyTasks();

        if (isWhatsAppConnected && activeSock) {
            await sendCarryOverNotifications(
                carriedOver,
                activeSock
            );
        }

    } catch (error) {
        console.error("Reset harian gagal:", error);
    }
}, {
    timezone: "Asia/Jakarta"
});


// ==========================================
// MENGAMBIL TANGGAL DAN JAM WIB
// ==========================================

function getJakartaDateTime() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        values[part.type] = part.value;
    }

    return {
        date: `${values.year}-${values.month}-${values.day}`,
        time: `${values.hour}:${values.minute}`
    };
}


async function sendCarryOverNotifications(carriedOver, sock) {
    if (!carriedOver || carriedOver.length === 0) return;

    for (const user of carriedOver) {
        try {
            const taskLines = user.tasks.map(task => {
                return `${task.position}. ▫️ ${task.task}`;
            });

            const taskOwner = user.name
                ? `${user.name}'s tasks`
                : "Your tasks";

            const message =
                `🔄 CARRIED OVER\n\n` +
                `Good morning! ☀️\n\n` +
                `Ada beberapa task kemarin yang belum selesai.\n\n` +
                `📋 ${taskOwner}\n\n` +
                `${taskLines.join("\n")}\n\n` +
                `Semangat menyelesaikan! 💪`;

            await sock.sendMessage(
                user.destination_jid,
                { text: message }
            );

            console.log(
                `Carry over notification terkirim: ${user.user_id}`
            );

        } catch (error) {
            console.error(
                `Gagal mengirim carry over untuk ${user.user_id}:`,
                error
            );
        }
    }
}


// ==========================================
// SCHEDULER REMINDER SETIAP MENIT
// ==========================================

cron.schedule("* * * * *", async () => {
    if (!isWhatsAppConnected || !activeSock) return;
    if (reminderCheckRunning) return;

    reminderCheckRunning = true;

    try {
        const { date, time } = getJakartaDateTime();

        const dueReminders = getDueReminders(date, time);

        for (const reminder of dueReminders) {
            try {
                const user = getUser(reminder.user_id);

                if (!user) continue;

                const tasks = getTasks(reminder.user_id);

                const pendingTasks = tasks.filter(
                    task => task.status === "pending"
                );

                const completed = tasks.filter(
                    task => task.status === "done"
                ).length;

                const total = tasks.length;

                // Tidak mengirim jika tidak ada task pending
                if (pendingTasks.length === 0) {
                    markReminderSent(
                        reminder.user_id,
                        date,
                        time
                    );

                    continue;
                }

                
                const reminderDate = new Intl.DateTimeFormat(
                    "id-ID",
                    {
                        timeZone: "Asia/Jakarta",
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                    }
                ).format(new Date(`${tasks[0].task_date}T12:00:00+07:00`));

                const taskLines = pendingTasks.map(task => {
                    return `${task.position}. ▫️ ${task.task}`;
                });

                const reminderTitle = user.name
                    ? `🔔 ${user.name.toUpperCase()}, DON'T FORGET YOUR TASKS!`
                    : "🔔 DON'T FORGET YOUR TASKS!";

                const message =
                    `${reminderTitle}\n\n` +
                    `${reminderDate}\n\n` +
                    `Ada ${pendingTasks.length} pekerjaan yang masih perlu diselesaikan:\n\n` +
                    `${taskLines.join("\n")}\n\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `Progress: ${completed}/${total} completed\n\n` +
                    `Untuk menyelesaikan task, balas:\n` +
                    `done 2 atau done 2 3\n\n` +
                    `Untuk membatalkan task:\n` +
                    `cancel 2 atau cancel 2 3\n\n` +
                    `Semangat menyelesaikan pekerjaanmu! 💪`;


                await activeSock.sendMessage(
                    user.destination_jid,
                    { text: message }
                );

                // Tandai setelah pesan berhasil dikirim
                markReminderSent(
                    reminder.user_id,
                    date,
                    time
                );

                console.log(
                    `Reminder terkirim: ${reminder.user_id} - ${time}`
                );

            } catch (error) {
                console.error(
                    `Gagal mengirim reminder untuk ${reminder.user_id}:`,
                    error
                );
            }
        }

    } catch (error) {
        console.error("Scheduler reminder gagal:", error);

    } finally {
        reminderCheckRunning = false;
    }

}, {
    timezone: "Asia/Jakarta"
});

// ==========================================
// WHATSAPP BOT
// ==========================================

async function startBot() {
    console.log("Memulai WhatsApp Bot...");

    const { state, saveCreds } = await useMultiFileAuthState(
        "./auth_info"
    );

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" })
    });

    activeSock = sock;

    sock.ev.on("creds.update", saveCreds);

    // ======================================
    // KONEKSI WHATSAPP
    // ======================================

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("Scan QR Code:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "connecting") {
            console.log("Menghubungkan ke WhatsApp...");
        }

        if (connection === "open") {
            isWhatsAppConnected = true;
            console.log("WhatsApp Bot berhasil terhubung! ✅");

            try {
                const carriedOver = catchUpDailyReset();

                await sendCarryOverNotifications(
                    carriedOver,
                    sock
                );

            } catch (error) {
                console.error("Auto-reset gagal:", error);
            }
        }
        if (connection === "close") {
            isWhatsAppConnected = false;

            if (activeSock === sock) {
                activeSock = null;
            }

            const statusCode =
                lastDisconnect?.error?.output?.statusCode;

            console.log("Koneksi terputus:", statusCode);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log("Session logout. Scan QR ulang diperlukan.");
                return;
            }

            console.log("Mencoba menghubungkan kembali...");

            setTimeout(() => startBot(), 3000);
        }
    });

    // ======================================
    // MEMPROSES PESAN WHATSAPP
    // ======================================

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;

                const chatJid = msg.key.remoteJid;

                if (!chatJid || chatJid === "status@broadcast") {
                    continue;
                }

                const isGroup = chatJid.endsWith("@g.us");

                const userId = isGroup
                    ? msg.key.participant
                    : chatJid;

                if (!userId) continue;

                const text = (
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    ""
                ).trim();

                if (!text) continue;

                const command = text.toLowerCase();

                console.log("Pesan masuk:", text);

                
                // ==================================
                // START
                // ==================================

                if (command === "start") {
                    const existingUser = getUser(userId);

                    pendingRegistrations.set(userId, {
                        stage: "name",
                        chatJid
                    });

                    const message = existingUser
                        ? `👋 WELCOME BACK, ${(existingUser.name || "").toUpperCase()}!

                    Nama yang tersimpan saat ini:
                    ${existingUser.name || "(belum ada nama)"}

                    Kirim nama yang ingin digunakan untuk notifikasi.

                    Contoh:
                    Ahmad`
                        : `👋 WELCOME TO DAILY TASK MANAGER!

                    Sebelum memulai, siapa nama kamu?

                    Kirim nama yang ingin ditampilkan pada notifikasi.

                    Contoh:
                    Budi`;

                    await sock.sendMessage(chatJid, {
                        text: message
                    });

                    continue;
                }

                // ==================================
                // PROSES INPUT NAMA
                // ==================================

                const pending = pendingRegistrations.get(userId);

                if (pending && pending.chatJid === chatJid) {

                    if (pending.stage === "name") {
                        const name = text.trim();

                        if (
                            name.length < 1 ||
                            name.length > 40 ||
                            name.includes("\n")
                        ) {
                            await sock.sendMessage(chatJid, {
                                text: "⚠️ Nama harus terdiri dari 1–40 karakter. Silakan kirim ulang nama kamu."
                            });

                            continue;
                        }

                        const existingUser = getUser(userId);

                        // Pengguna lama hanya memperbarui nama
                        if (existingUser) {
                            updateUserName(userId, name);
                            pendingRegistrations.delete(userId);

                            await sock.sendMessage(chatJid, {
                                text:
                                    `✅ Nama berhasil diperbarui!\n\n` +
                                    `Nama: ${name}\n` +
                                    `Mode: ${existingUser.mode}\n\n` +
                                    `Kamu bisa langsung menggunakan bot seperti biasa.`
                            });

                            continue;
                        }

                        // Pengguna baru lanjut memilih mode
                        pendingRegistrations.set(userId, {
                            stage: "mode",
                            name,
                            chatJid
                        });

                        await sock.sendMessage(chatJid, {
                            text:
                                `Halo, ${name}! 👋\n\n` +
                                `Pilih mode penggunaan:\n\n` +
                                `1️⃣ PERSONAL MODE\n` +
                                `Bot digunakan melalui chat pribadi.\n\n` +
                                `2️⃣ GROUP MODE\n` +
                                `Bot digunakan melalui grup WhatsApp yang hanya berisi kamu dan bot.\n\n` +
                                `Balas dengan angka 1 atau 2.`
                        });

                        continue;
                    }

                    // ==================================
                    // REGISTER PERSONAL / GROUP
                    // ==================================

                    if (pending.stage === "mode") {

                        if (command !== "1" && command !== "2") {
                            await sock.sendMessage(chatJid, {
                                text: "Pilih mode dengan membalas angka 1 atau 2."
                            });

                            continue;
                        }

                        const mode = command === "1"
                            ? "PERSONAL"
                            : "GROUP";

                        if (mode === "PERSONAL" && isGroup) {
                            await sock.sendMessage(chatJid, {
                                text: "Pilihan PERSONAL MODE harus dilakukan melalui chat pribadi bot."
                            });

                            continue;
                        }

                        if (mode === "GROUP" && !isGroup) {
                            await sock.sendMessage(chatJid, {
                                text: "Pilihan GROUP MODE harus dilakukan di dalam grup WhatsApp bersama bot."
                            });

                            continue;
                        }

                        if (mode === "GROUP") {
                            try {
                                const metadata = await sock.groupMetadata(chatJid);

                                if (metadata.participants.length !== 2) {
                                    await sock.sendMessage(chatJid, {
                                        text: "⚠️ Grup harus berisi tepat 2 anggota: kamu dan bot."
                                    });

                                    continue;
                                }

                            } catch (error) {
                                console.error("Gagal memeriksa grup:", error);

                                await sock.sendMessage(chatJid, {
                                    text: "Gagal memeriksa anggota grup. Coba lagi."
                                });

                                continue;
                            }
                        }

                        const result = registerUser(
                            userId,
                            pending.name,
                            mode,
                            chatJid
                        );

                        pendingRegistrations.delete(userId);

                        let reply;


                        if (result.success) {
                            reply =
                                `🎉 ${mode} MODE berhasil diaktifkan!\n\n` +
                                `Nama: ${pending.name}\n\n` +
                                `Sekarang kamu bisa mulai mengelola to-do list melalui ${mode === "PERSONAL" ? "chat ini" : "grup ini"}.\n\n` +
                                `Ketik *help* atau *menu* untuk melihat daftar perintah dan panduan penggunaan bot.\n\n` +
                                `Selamat mengatur tugas! ✨`;

                        } else if (result.reason === "group_already_registered") {
                            reply = "Grup ini sudah terdaftar untuk pengguna lain.";

                        } else {
                            reply =
                                `Kamu sudah terdaftar dalam ${result.existingMode} MODE.\n\n` +
                                `Satu pengguna hanya boleh menggunakan satu mode.`;
                        }

                        await sock.sendMessage(chatJid, {
                            text: reply
                        });

                        continue;
                    }
                }

                // ==================================
                // CEK REGISTRASI
                // ==================================

                const user = getUser(userId);

                if (!user) {
                    await sock.sendMessage(chatJid, {
                        text: "Kamu belum terdaftar.\n\nKetik start untuk memulai."
                    });

                    continue;
                }

                // ==================================
                // CEK DESTINASI
                // ==================================

                if (user.destination_jid !== chatJid) {
                    continue;
                }

                
                
                
                
                // ==================================
                // HELP COMMAND
                // ==================================

                if (command === "help" || command === "menu") {
                    const message =
                        `━━━━━━━━━━━━━━\n` +
                        `  📋 *DAILY TASK MANAGER*\n` +
                        `      _Panduan Penggunaan_\n` +
                        `━━━━━━━━━━━━━━\n\n` +

                        `📝 *TASK MANAGEMENT*\n` +
                        `━━━━━━━━━━━━━━\n\n` +

                        `*add Nama pekerjaan*\n` +
                        `— _Menambahkan satu task._\n\n` +

                        `*add*\n` +
                        `_Task pertama_\n` +
                        `_Task kedua_\n` +
                        `— _Menambahkan beberapa task sekaligus._\n\n` +

                        `*list*\n` +
                        `— _Melihat seluruh to-do list._\n\n` +

                        `*done 2* / *done 2 3*\n` +
                        `— _Menandai satu atau beberapa task selesai._\n\n` +

                        `*cancel 2* / *cancel 2 3*\n` +
                        `— _Menghapus satu atau beberapa task._\n\n` +

                        `⏰ *REMINDER*\n` +
                        `━━━━━━━━━━━━━━\n\n` +

                        `*remind*\n` +
                        `— _Melihat jadwal reminder._\n\n` +

                        `*remind 08:00 12:00*\n` +
                        `— _Menambahkan jadwal reminder._\n\n` +

                        `*remove remind 08:00*\n` +
                        `— _Menghapus jadwal tertentu._\n\n` +

                        `*remind on* / *remind off*\n` +
                        `— _Mengaktifkan atau menonaktifkan reminder._\n\n` +

                        `💡 *INFORMASI*\n` +
                        `━━━━━━━━━━━━━━\n\n` +

                        `— _Reminder berjalan setiap hari sesuai jadwal._\n` +
                        `— _Task pending otomatis dibawa ke hari berikutnya._\n` +
                        `— _Reset harian pukul_ *04.00 WIB*.\n\n` +

                        `━━━━━━━━━━━━━━\n` +
                        `_Ketik *help* atau *menu* kapan saja untuk melihat panduan ini._ ✨`;

                    await sock.sendMessage(chatJid, {
                        text: message
                    });

                    continue;
                }




                
                // ==================================
                // MELIHAT JADWAL REMINDER
                // ==================================

                if (command === "remind") {
                    const reminder = getReminder(userId);

                    if (!reminder || reminder.times.length === 0) {
                        await sock.sendMessage(chatJid, {
                            text:
                                `⏰ JADWAL REMINDER\n\n` +
                                `Belum ada jadwal reminder tersimpan.\n\n` +
                                `Untuk menambahkan jadwal:\n` +
                                `remind 08:00\n` +
                                `remind 12:00 18:00\n\n` +
                                `Untuk mengaktifkan reminder:\n` +
                                `remind on`
                        });

                    } else {
                        await sock.sendMessage(chatJid, {
                            text:
                                `⏰ JADWAL REMINDER\n\n` +
                                `${reminder.times.join("\n")}\n\n` +
                                `Status: ${reminder.enabled ? "AKTIF 🔔" : "NONAKTIF 🔕"}\n\n` +
                                `Untuk menambahkan jadwal:\n` +
                                `remind 08:00\n\n` +
                                `Untuk menghapus jadwal:\n` +
                                `remove remind 08:00\n\n` +
                                `Untuk mengaktifkan:\n` +
                                `remind on\n\n` +
                                `Untuk menonaktifkan:\n` +
                                `remind off`
                        });
                    }

                    continue;
                }



                
                // ==================================
                // MENONAKTIFKAN REMINDER
                // ==================================

                if (command === "remind off") {
                    const success = disableReminders(userId);

                    await sock.sendMessage(chatJid, {
                        text: success
                            ? "🔕 Seluruh reminder berhasil dinonaktifkan.\n\nJadwal tersimpan dan bisa diaktifkan kembali dengan menambahkan jadwal menggunakan perintah remind."
                            : "Belum ada jadwal reminder yang tersimpan."
                    });

                    continue;
                }


                // ==================================
                // MENGAKTIFKAN REMINDER
                // ==================================

                if (command === "remind on") {
                    const success = enableReminders(userId);

                    await sock.sendMessage(chatJid, {
                        text: success
                            ? "🔔 Reminder berhasil diaktifkan kembali!\n\nJadwal reminder harian:\n" +
                              `${getReminder(userId).times.join("\n")}`
                            : "⚠️ Belum ada jadwal reminder tersimpan.\n\nTambahkan jadwal terlebih dahulu dengan:\nremind 08:00"
                    });

                    continue;
                }

                
                // ==================================
                // MENAMBAHKAN JADWAL REMINDER
                // ==================================

                if (command.startsWith("remind ")) {
                    const timeText = text.slice(7).trim();

                    const times = timeText
                        .split(/[,\s]+/)
                        .filter(Boolean);

                    const success = addReminderTimes(
                        userId,
                        times
                    );

                    if (!success) {
                        await sock.sendMessage(chatJid, {
                            text:
                                "⚠️ Format jadwal tidak valid.\n\n" +
                                "Contoh:\n" +
                                "remind 08:00 12:00 18:00\n\n" +
                                "Gunakan format 24 jam HH:MM."
                        });

                    } else {
                        const reminder = getReminder(userId);

                        await sock.sendMessage(chatJid, {
                            text:
                                `✅ Jadwal reminder berhasil ditambahkan!\n\n` +
                                `${reminder.times.join("\n")}\n\n` +
                                `Jadwal berlaku setiap hari.`
                        });
                    }

                    continue;
                }


                // ==================================
                // MENGHAPUS JADWAL REMINDER
                // ==================================

                if (command.startsWith("remove remind ")) {
                    const timeText = text.slice(14).trim();

                    const times = timeText
                        .split(/[,\s]+/)
                        .filter(Boolean);

                    const success = removeReminderTimes(
                        userId,
                        times
                    );

                    if (!success) {
                        await sock.sendMessage(chatJid, {
                            text:
                                "⚠️ Jadwal tidak ditemukan atau format tidak valid.\n\n" +
                                "Contoh:\n" +
                                "remove remind 08:00\n" +
                                "remove remind 08:00 12:00"
                        });

                    } else {
                        const reminder = getReminder(userId);

                        await sock.sendMessage(chatJid, {
                            text: reminder.enabled
                                ? `✅ Jadwal berhasil dihapus!\n\n` +
                                  `Sisa jadwal reminder:\n` +
                                  `${reminder.times.join("\n")}`
                                : "✅ Jadwal berhasil dihapus.\n\nTidak ada reminder aktif lagi."
                        });
                    }

                    continue;
                }


                // ==================================
                // ADD TASK
                // ==================================

                if (
                    command === "add" ||
                    command.startsWith("add ") ||
                    command.startsWith("add\n")
                ) {
                    const taskText = text.slice(3).trim();

                    if (!taskText) {
                        await sock.sendMessage(chatJid, {
                            text: "Format penggunaan:\n\nadd Nama pekerjaan\n\nAtau kirim beberapa pekerjaan dalam baris terpisah."
                        });

                        continue;
                    }

                    const taskList = taskText
                        .split("\n")
                        .map(task => task.trim())
                        .filter(task => task.length > 0);

                    const tasks = addTasks(userId, taskList);

                    await sock.sendMessage(chatJid, {
                        text:
                            `✅ ${taskList.length} task berhasil ditambahkan!\n\n` +
                            `${formatTaskList(tasks, user.name)}`
                    });

                    continue;
                }

                // ==================================
                // LIST TASK
                // ==================================

                if (command === "list") {
                    const tasks = getTasks(userId);

                    await sock.sendMessage(chatJid, {
                        text: formatTaskList(tasks, user.name)
                    });

                    continue;
                }
                                
                // ==================================
                // COMPLETE TASK
                // ==================================

                const doneMatch = command.match(/^done\s+(\d+(?:\s+\d+)*)$/);

                if (doneMatch) {
                    const positions = [
                        ...new Set(doneMatch[1].split(/\s+/).map(Number))
                    ];

                    const allTasks = getTasks(userId);

                    const selectedTasks = positions
                        .map(position => allTasks.find(
                            task =>
                                task.position === position &&
                                task.status === "pending"
                        ))
                        .filter(Boolean);

                    if (selectedTasks.length === 0) {
                        await sock.sendMessage(chatJid, {
                            text: "Tidak ada task pending dengan nomor tersebut."
                        });

                        continue;
                    }

                    let completed = 0;

                    for (const task of selectedTasks) {
                        if (completeTask(userId, task.position)) {
                            completed++;
                        }
                    }

                    const remainingTasks = getTasks(userId);

                    await sock.sendMessage(chatJid, {
                        text:
                            `✅ ${completed} task berhasil diselesaikan!\n\n` +
                            `${formatTaskList(remainingTasks, user.name)}`
                    });

                    continue;
                }


                
                // ==================================
                // CANCEL TASK
                // ==================================

                const cancelMatch = command.match(/^cancel\s+(\d+(?:\s+\d+)*)$/);

                if (cancelMatch) {
                    const positions = [
                        ...new Set(cancelMatch[1].split(/\s+/).map(Number))
                    ];

                    const allTasks = getTasks(userId);

                    const selectedTasks = positions
                        .map(position => allTasks.find(
                            task =>
                                task.position === position &&
                                task.status === "pending"
                        ))
                        .filter(Boolean)
                        .sort((a, b) => b.position - a.position);

                    if (selectedTasks.length === 0) {
                        await sock.sendMessage(chatJid, {
                            text: "Tidak ada task pending dengan nomor tersebut."
                        });

                        continue;
                    }

                    let cancelled = 0;

                    for (const task of selectedTasks) {
                        if (cancelTask(userId, task.position)) {
                            cancelled++;
                        }
                    }

                    const remainingTasks = getTasks(userId);

                    await sock.sendMessage(chatJid, {
                        text:
                            `🗑️ ${cancelled} task berhasil dibatalkan!\n\n` +
                            `${formatTaskList(remainingTasks, user.name)}`
                    });

                    continue;
                }


            } catch (error) {
                console.error("Gagal memproses pesan:", error);

                await sock.sendMessage(msg.key.remoteJid, {
                    text: "Terjadi kesalahan saat memproses perintah. Silakan coba lagi."
                }).catch(console.error);
            }
        }
    });
}

// ==========================================
// MENJALANKAN BOT
// ==========================================

startBot().catch(console.error);
