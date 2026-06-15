# InstaSpace Team Portal (Mini ERP)

A small, role-based team portal for the InstaSpace founding team. Admin issues a
username and password for each teammate. Everyone signs in to a dashboard, can
create and track tasks and sub-tasks, log hours, and see KPI reporting; admins
and directors get the full cross-team view.

Built to run anywhere with no database server and no native build step: just
Node.js, three small dependencies, and a JSON data file.

---

## What's inside

- **Three access levels**
  - `admin` — sees every metric and KPI, creates/edits/deletes any task, manages
    the team, generates and resets passwords.
  - `director` — sees all metrics, tasks, and KPIs; can create tasks and
    sub-tasks, edit any task's progress and content, and post remarks.
  - `member` — sees their own and connected tasks; can create tasks and
    sub-tasks, update progress and descriptions, log hours, and post remarks on
    tasks they can see. Each member sees their own KPI report.
- **Everyone can create work** — any signed-in user can create a Main Task and
  add Sub-tasks under it. A main task's progress rolls up from its sub-tasks.
- **Collapsible master tasks** — sub-tasks stay tucked inside their master task
  and are hidden until you click the master task's arrow, so the board stays
  compact and scannable.
- **Ready first-name logins** — every teammate is seeded with their first name as
  username and a password (stored hashed). The Admin can still reset any password
  from the Team panel; the new value is shown once.
- **Locked brand mark** — the header, login, and favicon use the exact InstaSpace
  capsule icon; the app/touch icon uses the orange-to-crimson tile.
- **Task tracking** — owner(s), department, priority (P0/P1/P2), status,
  description, milestone checklists, start date, and a due date with time.
- **Sub-tasks** — one level deep under any main task; deleting a main task
  removes its sub-tasks too.
- **Hours logging** — each person logs hours (with date and an optional note) on
  a task. Totals roll up per task and per person.
- **Calendar** — a month grid plus an upcoming-deadlines agenda. Dates and times
  are chosen with native date and date-and-time pickers on each task.
- **KPI report for every user (including admins)** — tasks, completion, average
  progress, hours logged, overdue, on-time vs late completions, open P0/P1/P2,
  and remarks posted. Admins and directors see the whole team; members see their
  own card.
- **Investor-readiness dashboard** — status donut, department breakdown, team
  leaderboard with hours, and an investor-meetings tracker.
- **Hard cap of 20 users.**

---

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000

On first boot the server seeds the team and tasks, then prints the **Admin
login** to the console, something like:

```
========================================================
  InstaSpace Portal - first run
  Admin username: osman
  Admin password: <generated-password-shown-once>
========================================================
```

Sign in as `osman` with that password. That password is only printed on the
very first boot (when the data file is created). Keep it. If you lose it before
creating other admins, delete `data/db.json` and start again to reseed.

Once signed in as Admin:
1. Go to **Team**.
2. For each teammate, click **Generate password**. The password appears once,
   copy it and send it to them.
3. Edit roles, departments, or access levels from the same panel as needed.

---

## Seeded team and tasks

Eleven users are created on first boot, each with a ready first-name login
(passwords stored hashed). Share each securely and have everyone change their
password after first sign in (Account menu).

| Name              | Username | Role / title          | Access level | Password    |
|-------------------|----------|-----------------------|--------------|-------------|
| Osman Rao         | osman    | Founder & CEO         | admin        | Beme820mgg  |
| Jybran Waheed     | jybran   | COO                   | director     | Llgb605qzm  |
| Sanwa Ali         | sanwa    | CSO                   | director     | Uvea913awg  |
| Ayesha Khan       | ayesha   | Project Director      | director     | Vpql417dpn  |
| M. Danish Ishfaq  | danish   | CTO                   | member       | Ssyt200scv  |
| Talha Asif        | talha    | CPO                   | member       | Apfm516xlo  |
| Junaid Amir       | junaid   | Marketing Head        | member       | Daiq653qcl  |
| Hamza Dar         | hamza    | Investor Relations    | member       | Giyt494tkd  |
| Mesum             | mesum    | Design Team           | member       | Msnk665ulj  |
| Ahsan             | ahsan    | Advisor               | member       | Xilo376wyo  |
| Umair             | umair    | Trainee               | member       | Iaem761lyn  |

Jybran (COO) is a **director**: full access to all tasks, the calendar, KPIs,
and remarks, but no user management. Directors and members can create tasks and
sub-tasks and update progress; only admins add or remove users.

Pre-loaded tasks map to the assignments you gave: pitch deck, 3-5 investor
meetings, full app rebuild with weekly sprints across the three modules,
product "done" definitions, demo script/roadmap, master project timeline,
weekly COO report, social media activation, website fix, investor target
list/tracker, and data room prep.

You can edit, add, delete, or reassign any of these as Admin. The COO referenced
in Ayesha's weekly report is not seeded as a user; add them from the Team panel
if you want them in the portal.

---

## Deploy on a subdomain (Railway)

Railway runs Node apps directly and gives you a deploy in a few minutes. A
custom subdomain like `erp.myinstaspace.com` is supported.

1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**, pick the repo.
3. Railway auto-detects Node and runs `npm install` then `npm start`.
4. **Add a persistent volume** and set its mount path, e.g. `/data`. Then set an
   environment variable so the database lives on the volume and survives
   redeploys:
   ```
   DATA_FILE=/data/db.json
   ```
   Without this, the JSON store resets on every redeploy.
5. Set a session secret (any long random string):
   ```
   SESSION_SECRET=<long-random-string>
   ```
6. Set `NODE_ENV=production` so session cookies are marked secure.
7. After the first successful deploy, share the seeded first-name logins from the
   table above (everyone changes their password on first sign in).
8. Add your custom domain: Railway **Settings → Networking → Custom Domain →**
   `erp.myinstaspace.com`, then add the CNAME record Railway shows you in your
   DNS (in Hostinger's DNS zone for myinstaspace.com).

### Updating an existing deployment

The portal does not update itself. To apply a new build, replace the files
(or push to the connected GitHub repo, which triggers a redeploy) and restart.

Two things to know about the database:

- Your tasks and users live in `db.json` on the persistent volume and are kept
  across redeploys, so a code update does **not** touch your data.
- The seed (the eight first-name logins, roles like Jybran as director, and the
  starter tasks) only runs on a **fresh** database. If you are already running an
  older build with data, those seeded logins/roles will not appear just by
  updating the code. To get this build's seeded logins exactly, start from an
  empty database (remove `db.json` on the volume, then redeploy). That resets the
  portal to the fresh seed. If you have real data to preserve instead, tell me
  and I will provide a small migration rather than a reset.

### A note on Hostinger

Your `myinstaspace.com` hosting is set up for PHP/static sites, which won't run
a Node server. Use it only for the DNS record pointing the subdomain at Railway
(or another Node host like Render). The app itself runs on Railway.

---

## Environment variables

| Variable         | Default          | Purpose                                            |
|------------------|------------------|----------------------------------------------------|
| `PORT`           | `3000`           | Port to listen on (most hosts set this for you).   |
| `DATA_FILE`      | `./data/db.json` | Where the JSON store lives. Point at a volume in prod. |
| `SESSION_SECRET` | dev fallback     | Signs session cookies. **Set this in production.** |
| `NODE_ENV`       | —                | Set to `production` for secure cookies.            |
| `TRUST_PROXY`    | —                | Set to `1` if behind a proxy/load balancer.        |

---

## How progress is calculated

- If a task has sub-tasks, its progress is the average of its sub-tasks'
  progress (so a main task reaches 100% when its sub-tasks are done).
- Otherwise, if a task has milestones, progress = completed milestones / total.
- If it has neither, progress falls back to its status (Not Started 0%,
  Blocked 25%, In Progress 50%, Done 100%).
- The investor-meetings tracker counts completed milestones on the meetings
  task against the target.
- A task is marked complete on the date its status is set to Done; the KPI
  report uses that against the due date to count on-time vs late completions.

---

## Security notes

- Passwords are hashed with bcrypt and never stored or shown in plain text after
  the one-time reveal.
- The last remaining admin cannot be deactivated or demoted, so you can't lock
  yourself out.
- The portal is marked `noindex`; it is meant for invited team members only.
- Anyone with the Admin account can manage all users, so keep that password safe
  and consider creating a second admin as backup.

---

## Tech

Node.js + Express, `cookie-session` for auth, `bcryptjs` for password hashing,
and a small atomic JSON file store (write-temp-then-rename). No database server,
no native modules. Frontend is a single-page vanilla-JS app, no build step.

To swap in the real brand icon, replace the placeholder SVG in
`public/app.js` / `public/index.html` with the authoritative `instaspace_icon.svg`.
