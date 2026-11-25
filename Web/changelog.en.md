# What's new

English translation of `CHANGELOG.md` (Italian), read by the app and by the website. Every release adds the same section, with the same points in the same order, to all five files (`CHANGELOG.md`, `.en`, `.fr`, `.de`, `.es`): a test checks it.

## 0.7.0 — 21 October 2026

- Automations (workspace menu, administrators): if an urgent task stays without an owner for a day, administrators get a notification; if a question stays unanswered for 5 days, whoever is mentioned in it gets a reminder; when a task is confirmed without a due date, the app asks for one right away. You choose the days; with no server, each reminder arrives only once.
- What changed: pick two moments (the daily backups, or now) and see what was added, completed, reopened, binned or deleted, due dates moved "from → to", tasks handed to others and projects created, renamed or binned. One click opens the task.
- Ask the project (with local AI): questions like "what did we decide about authentication?" or "which prerequisites does the backend need?". The answer comes only from tasks, comments, questions and decisions, the architecture document, Stack notes and text or PDF attachments, and cites its sources, which open with a click. Nothing leaves the PC.
- The task detail keeps the fields you are editing and takes in other people's updates.
- With the task panel open, the buttons at the top of the project show only their icon: the project name stays readable.
- Send feedback (workspace menu, palette, start screen, Settings): report a problem, suggest an idea or ask a question on GitHub with the version already filled in, or email the author.
- New version notice: once a day the app checks the latest published version and, if there is a newer one, says so at the top of the window with "What's new" and "Download". You can check by hand or turn it off in Settings › General.
- Support Todo Doto (workspace menu and start screen): donate with PayPal or copy the PayPal address.

## 0.6.0 — 20 October 2026

- Dependencies: a task "comes after" others. Until those are completed it shows a padlock; if it is due before what blocks it, a warning says so. In the Gantt, arrows link the bars and the critical chain is highlighted. When the task is unblocked, its owner gets a notification.
- Milestones: versions or releases with a target date, progress, filter and a line in the Gantt; in quick add "~v1.3". When a milestone is reached, release notes are written from the completed tasks and can be copied or appended to the project's CHANGELOG.md.
- Workload by week (Analytics): everyone's due dates and estimated hours in the coming weeks, across all projects, with clashes and "Hand to…" with suggested people. Estimate hours in the task or with "=3h".
- Absences and weekly hours (Members › Availability): shown in the assignee list, they reduce the workload and flag tasks due while their owner is away.
- Project health: a yellow or red ring in the sidebar, with the reasons, and the week-by-week trend in Analytics.
- Ready PCs: in Analytics the projects × people matrix with each PC's status; in the assignee list, whether the person's PC is ready for the project.
- Internal status report for a period: completed, late, upcoming due dates, milestones, decisions, questions and warnings. Copy it as Markdown, save it as a printable page for PDF or send it by email; local AI can write the introduction.
- Handover note: when handing a task to someone else, the detail suggests a summary for the recipient, to add as a comment.
- Due-date calendars (.ics) in the Data folder, for you and for each project, to open in Outlook or Thunderbird; turned on from the workspace menu.
- Checklists in tasks and weekly or monthly repeats: completing one creates the next, with the checklist to do again.
- Project templates: save a project as a template and create a new one with Stack, attachment folders, milestones and tasks, with dates starting today.
- Guided clean-up for administrators: labels never used, empty folders, idle projects, missing attachments, milestones to close and old bins.

## 0.5.0 — 20 October 2026

- Quick add: above the list type "CSV export !high @mario #bug by friday" and Enter creates the task with priority, assignee, label and due date. What is recognised is shown first; the X leaves it in the title. It also works in the "New task" dialog.
- Today: a page with what concerns you across all projects (late, due today and this week, urgent, questions waiting for your answer, answers to your questions). Complete and snooze without opening the project; snoozing applies only to you and does not change the due date.
- Decisions: in a question, the chosen answer becomes "the decision", with its rationale. The project has its own decision log, with search and Markdown copy.
- Warnings and lead times: in the project, the list of what is going wrong without anyone flagging it (delays, urgent tasks with no owner, unanswered questions, stalled tasks) and median times from created to confirmed and to completed, with the age of open tasks.
- Git per task: in the detail, the commits that mention TODO-n and the branch name to copy; the task shows as "in progress" with recent commits or with its branch checked out on the PC.
- Archive: tasks completed more than 90 days ago sit at the bottom of "Completed", behind "Show archived". Search always finds them.
- Command palette: in Ctrl+K, ">" shows commands (Today, new task, decisions, warnings, project sections, settings…) and "+" adds a task to the open project.

## 0.4.0 — 20 October 2026

- Office VPN from the settings: choose a VPN already set up in Windows and Todo Doto connects it by itself when the shared folder does not respond (also at startup). Credentials stay with Windows.
- Company sign-in: with the domain account (Active Directory or Microsoft Entra ID) the same person is the same user on any PC; roles can be derived from Active Directory groups.
- Email and Teams: "Send by email" on tasks, roadmap and summary; a Microsoft Teams channel per project with tasks created, completed, assignments, questions and mentions; email to whoever is mentioned or receives a task; the daily round-up every morning. Sent with the PC's Outlook or the company SMTP server; all optional and chosen by the administrator.
- Built for larger teams: history in files per month and per PC (no more single file rewritten by everyone), a change journal to know which files to reread, less frequent folder checks when the window is in the background or you are away from the PC, projects with hundreds of tasks split into chapters.

## 0.3.0 — 20 October 2026

- Todo Doto is free: licences and subscriptions are suspended. Anyone who wants to can support development with a PayPal donation (Settings › General and website).
- Who is working on what: "I'm working on it" in the task detail; in the list a green pill with who is working on it, without shifting the columns; in the new Overview the list for the whole team.
- Roadmap for the client: a page with what is done and what is coming, without descriptions, comments or internal details, to send or print as PDF.
- Set up this PC: in a single step the programs all your projects need, each installed only once.
- Stack out of date: if the project files change (e.g. a new version of Node.js), a notice offers to update the Stack with one click.
- Laptop out of the office: without the shared folder you keep working on the PC's copy; back in, changes are merged with your colleagues', field by field, and conflicts are shown.
- Encryption of data on disk for network workspaces (Settings › User data, administrators): files, backups and the out-of-office copy unreadable without the password.
- Lighter change detection on network folders: only changed folders are queried.

## 0.2.26 — 16 October 2026

- Local AI, free and entirely on the PC (Ollama with Qwen 3 4B, or an OpenAI-compatible server such as LM Studio): the app talks only to the engine installed on the PC, never to external services.
- Settings › Local AI: connection test and model download with a progress bar. In the Windows installer, an optional choice to install the AI too.
- Stack: "Detect from project files" with AI on also suggests prerequisites, steps, variables and notes the files do not state explicitly, to pick before adding them.
- Assisted features: "How to fix" for prerequisites, tasks from a text, similar-task warning, search by meaning, commits that might complete a task, weekly summary, AGENTS.md/CLAUDE.md from the Stack.
- A banner at the top invites you to turn on local AI; once closed, it does not come back.

## 0.2.25 — 16 October 2026

- In the sidebar the project sections are now in the order Stack, Todo, Gantt, Attachments.
- New website: Free, Team and Business plan pricing, FAQ, user guide, release notes, comparisons with Trello and Excel, updated legal pages.

## 0.2.24 — 15 October 2026

- Stack: invalid fields prevent saving.

## 0.2.23 — 15 October 2026

- "Detect from project files" only with a valid project folder.

## 0.2.22 — 15 October 2026

- The last workspace reopens without going through the workspace choice.

## 0.2.21 — 15 October 2026

- Project folder shown only if it really exists on this PC.

## 0.2.20 — 15 October 2026

- Gantt filters, unset due date, settings with "User data".

## 0.2.19 — 15 October 2026

- Project folder on this PC, settings in tabs.

## 0.2.18 — 15 October 2026

- Todo Doto: new name, Gantt of confirmed tasks, prerequisites from project files.

## 0.2.17 — 15 October 2026

- Git commit → task: "closes TODO-n" completes the task.

## 0.2.16 — 15 October 2026

- Shared PC setup, manageable notifications, backups.

## 0.2.15 — 15 October 2026

- Deletions confined to the Data folder, messages about project files.

## 0.2.14 — 14 October 2026

- Optional "Remember password", encrypted with Windows DPAPI.

## 0.2.13 — 14 October 2026

- Favourites in the sidebar only if there are starred projects.

## 0.2.12 — 14 October 2026

- External links, .NET check and prerequisites outside the PATH, task fields in the detail.

## 0.2.11 — 14 October 2026

- Projects from their folder, stack also from network folders and subfolders, faster network.

## 0.2.10 — 14 October 2026

- Public or restricted project visibility, with a dot in the sidebar.

## 0.2.9 — 14 October 2026

- Network folders with explained errors, folder created with the project, stack import.

## 0.2.8 — 14 October 2026

- Projects folder derived for workspaces created before 0.2.4.

## 0.2.7 — 14 October 2026

- Project name from its folder, with no later editing.

## 0.2.6 — 14 October 2026

- Permission management in the Members page, fix for background updates.

## 0.2.5 — 14 October 2026

- GitHub, automatic prerequisite check, project name and users.

## 0.2.4 — 14 October 2026

- Separate projects folder and Data folder, automatic setup.

## 0.2.3 — 14 October 2026

- Workspace from a folder of existing projects, with projects created automatically.

## 0.2.2 — 14 October 2026

- Project sections in the sidebar, Stack with .md import and automatic prerequisites.

## 0.2.1 — 14 October 2026

- Saves under a lock across PCs, portable exe without installer.

## 0.2.0 — 14 October 2026

- First version published with automatic build, website and installers in Italian and English.
