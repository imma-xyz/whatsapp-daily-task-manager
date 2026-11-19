# WHATSAPP-DAILY-TASK-MANAGER

**WhatsApp-Based Personal and Group Task Management Bot**

WHATSAPP-DAILY-TASK-MANAGER is a WhatsApp-based task management bot designed to help users organize daily activities, track task progress, and manage reminders directly through WhatsApp.

The bot supports both personal and group task management, allowing users to maintain separate task lists, configure reminder schedules, and automatically carry unfinished tasks into the following day.

The application is built with Node.js and SQLite, providing a lightweight automation solution that integrates daily task management into an application users already use.

## Features

- **Personal Task Management** — Manage individual to-do lists through private WhatsApp chats.
- **Group Task Management** — Manage tasks through a dedicated WhatsApp group with exactly two participants: the user and the bot.
- **Task Creation** — Add individual tasks or multiple tasks in a single message.
- **Task Tracking** — View task lists and monitor pending and completed tasks.
- **Task Completion** — Mark one or multiple tasks as completed.
- **Task Cancellation** — Remove tasks that are no longer needed.
- **Customizable Reminders** — Add, remove, enable, or disable daily reminder schedules.
- **Automatic Daily Reset** — Reset daily task management at 04:00 WIB.
- **Task Carryover** — Automatically carry unfinished tasks into the following day.
- **Progress Notifications** — Receive task reminders with completion progress.
- **User Registration** — Register users with individual profiles and usage modes.
- **Persistent Data Storage** — Store user profiles, tasks, and reminder settings using SQLite.

## Technology Stack

- Node.js
- JavaScript
- Baileys
- SQLite (`node:sqlite`)
- node-cron
- pino
- qrcode-terminal

## How It Works

1. Users initiate registration by sending the `start` command to the bot.
2. New users enter their display name and select either Personal Mode or Group Mode.
3. The bot creates an individual task management profile for each registered user.
4. Users add, view, complete, or cancel tasks through WhatsApp commands.
5. Reminder notifications are sent automatically according to each user's configured schedule.
6. Unfinished tasks are carried over automatically during the daily reset at 04:00 WIB.

## Available Commands

| Command | Description |
|---|---|
| `start` | Register or update user profile |
| `help` / `menu` | Display usage instructions |
| `add Task name` | Add a single task |
| `add` + multiple lines | Add multiple tasks |
| `list` | Display the task list |
| `done 2` | Mark a task as completed |
| `done 2 3` | Complete multiple tasks |
| `cancel 2` | Cancel a task |
| `remind` | View reminder schedules |
| `remind 08:00 12:00` | Add reminder schedules |
| `remove remind 08:00` | Remove a reminder schedule |
| `remind on` | Enable reminders |
| `remind off` | Disable reminders |

Newly registered users receive default reminder schedules at 09:00, 12:00, 16:00, and 20:00 WIB. These schedules can be customized at any time.

## Project Structure

```text
whatsapp-daily-task-manager/
├── src/
│   ├── bot.js
│   ├── database.js
│   ├── registration.js
│   ├── reminders.js
│   └── tasks.js
├── database/
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

## Getting Started

### Requirements

- Node.js 22.5 or later
- npm
- A WhatsApp account

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/imma-xyz/whatsapp-daily-task-manager.git
   ```

2. Open the project folder:

   ```bash
   cd whatsapp-daily-task-manager
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the bot:

   ```bash
   npm start
   ```

5. Scan the QR code displayed in the terminal using WhatsApp's **Linked Devices** feature.

The application automatically initializes its SQLite database and creates a WhatsApp authentication session on the first run.

## Deployment

The bot is deployed on a Node.js hosting environment and runs as a background process.

The deployment uses a dedicated WhatsApp authentication session and a fresh SQLite database to maintain user profiles, task records, and reminder configurations.

## Development Background

This project was developed as a practical automation solution for everyday task management.

It explores the use of WhatsApp as an accessible interface for a lightweight productivity application, combining task organization, scheduled notifications, and automated daily processes.

By integrating these features into an existing messaging platform, the project aims to reduce the need for additional applications while making daily task management more convenient.

---

**Developed by [imma](https://github.com/imma-xyz)**
