'use strict';
/*
 * InstaSpace ERP - server
 * Express + cookie-session + bcryptjs. No native modules, no build step.
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex');

const db = store.load();

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */
const ACCESS_LEVELS = ['admin', 'director', 'member']; // admin > director > member
const STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];
const PRIORITIES = ['P0', 'P1', 'P2'];
const DEPARTMENTS = [
  'Executive',
  'Investor Pipeline',
  'Investor Relations',
  'Engineering',
  'Product',
  'Project Management',
  'Marketing',
  'Operations',
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function id(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

// Readable, unambiguous password (no 0/O/1/l/I).
function generatePassword(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Build a sensible username base from a full name, skipping initials ("M.").
function firstNameSlug(name) {
  const parts = String(name || '').trim().split(/\s+/);
  for (const p of parts) {
    const clean = p.replace(/[^a-zA-Z]/g, '');
    if (clean.length >= 2) return clean.toLowerCase();
  }
  return (parts[0] || 'user').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user';
}

function uniqueUsername(base) {
  let u = base.toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (!u) u = 'user';
  let candidate = u;
  let n = 1;
  while (db.users.some((x) => x.username === candidate)) {
    n += 1;
    candidate = u + n;
  }
  return candidate;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    department: u.department,
    accessLevel: u.accessLevel,
    active: u.active,
    hasPassword: !!u.passwordHash,
  };
}

function childrenOf(taskId) {
  return db.tasks.filter((t) => t.parentId === taskId);
}

// Numeric progress derived consistently (used for charts and bars).
// Priority: sub-tasks (if any) -> milestones -> status.
function taskProgress(t) {
  const kids = childrenOf(t.id);
  if (kids.length) {
    const sum = kids.reduce((s, k) => s + statusProgress(k), 0);
    return Math.round(sum / kids.length);
  }
  if (t.milestones && t.milestones.length) {
    const done = t.milestones.filter((m) => m.done).length;
    return Math.round((done / t.milestones.length) * 100);
  }
  return statusProgress(t);
}

// Progress of a single task ignoring its children (used to roll a parent up
// from its sub-tasks without infinite recursion).
function statusProgress(t) {
  if (t.milestones && t.milestones.length) {
    const done = t.milestones.filter((m) => m.done).length;
    return Math.round((done / t.milestones.length) * 100);
  }
  const map = { 'Not Started': 0, Blocked: 25, 'In Progress': 50, Done: 100 };
  return map[t.status] != null ? map[t.status] : 0;
}

// Total hours logged on a task (its own time logs only).
function taskHours(t) {
  if (!Array.isArray(t.timeLogs)) return 0;
  return Math.round(t.timeLogs.reduce((s, l) => s + (Number(l.hours) || 0), 0) * 100) / 100;
}

function userById(uid) {
  return db.users.find((u) => u.id === uid) || null;
}

function ownsTask(user, task) {
  return task.owners.includes(user.id);
}

function createdByUser(user, task) {
  return task.createdBy === user.id;
}

// Who may edit a task's content/progress.
//  - admin and director: any task
//  - member: tasks they own or created
function canEditTask(user, task) {
  if (user.accessLevel === 'admin' || user.accessLevel === 'director') return true;
  return ownsTask(user, task) || createdByUser(user, task);
}

// Member visibility: their own/created tasks, plus the parent and sub-tasks
// directly connected to them so the hierarchy stays readable.
function visibleToUser(user, task) {
  if (user.accessLevel === 'admin' || user.accessLevel === 'director') return true;
  if (ownsTask(user, task) || createdByUser(user, task)) return true;
  // parent of a task I own/created
  const kids = childrenOf(task.id);
  if (kids.some((k) => ownsTask(user, k) || createdByUser(user, k))) return true;
  // sub-task whose parent I own/created
  if (task.parentId) {
    const parent = db.tasks.find((p) => p.id === task.parentId);
    if (parent && (ownsTask(user, parent) || createdByUser(user, parent))) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Seed (first boot only)
 * ------------------------------------------------------------------ */
// Pre-seeded credentials for the founding team. Usernames are first names.
// Stored hashed; share each row securely and have everyone change their
// password after first sign in (Account menu).
const SEED_PASSWORDS = {
  osman: 'Beme820mgg',
  jybran: 'Llgb605qzm',
  sanwa: 'Uvea913awg',
  ayesha: 'Vpql417dpn',
  danish: 'Ssyt200scv',
  talha: 'Apfm516xlo',
  junaid: 'Daiq653qcl',
  hamza: 'Giyt494tkd',
  mesum: 'Msnk665ulj',
  ahsan: 'Xilo376wyo',
  umair: 'Iaem761lyn',
};

// Canonical team: username, name, role, department, accessLevel.
// Used by both the fresh seed and the one-time login reconciliation.
const CANONICAL_USERS = [
  ['osman', 'Osman Rao', 'Founder & CEO', 'Executive', 'admin'],
  ['jybran', 'Jybran Waheed', 'COO', 'Operations', 'director'],
  ['sanwa', 'Sanwa Ali', 'Co-Founder & CSO / Head of Investor Relations', 'Investor Pipeline', 'director'],
  ['ayesha', 'Ayesha Khan', 'Project Director', 'Project Management', 'director'],
  ['danish', 'M. Danish Ishfaq', 'CTO', 'Engineering', 'member'],
  ['talha', 'Talha Asif', 'Co-Founder & CPO', 'Product', 'member'],
  ['junaid', 'Junaid Amir', 'Marketing Head', 'Marketing', 'member'],
  ['hamza', 'Hamza Dar', 'Investor Relations', 'Investor Relations', 'member'],
  ['mesum', 'Mesum', 'Design Team', 'Product', 'member'],
  ['ahsan', 'Ahsan', 'Advisor', 'Executive', 'member'],
  ['umair', 'Umair', 'Trainee', 'Operations', 'member'],
];

// Bump to re-apply the canonical logins on next boot (one-time per version).
const LOGINS_VERSION = 2;

// Reconcile the team logins on an EXISTING database without touching tasks.
// Creates any missing canonical users, aligns their access level, and sets the
// shared password so the credentials sheet works. Runs once per LOGINS_VERSION.
function ensureCanonicalLogins() {
  if (!db.meta) db.meta = {};
  if (db.meta.loginsVersion === LOGINS_VERSION) return;
  let created = 0;
  CANONICAL_USERS.forEach(([username, name, role, department, accessLevel]) => {
    let u = db.users.find((x) => x.username === username);
    if (!u) {
      u = {
        id: id('usr'),
        username,
        name,
        role,
        department,
        accessLevel,
        active: true,
        createdAt: new Date().toISOString(),
      };
      db.users.push(u);
      created++;
    }
    u.accessLevel = accessLevel;
    u.role = role;
    u.department = department;
    u.active = true;
    if (SEED_PASSWORDS[username]) u.passwordHash = bcrypt.hashSync(SEED_PASSWORDS[username], 10);
  });
  db.meta.loginsVersion = LOGINS_VERSION;
  store.persist();
  console.log('Reconciled team logins (v' + LOGINS_VERSION + '): ' + created + ' user(s) created, passwords set from the credentials sheet.');
}

function seed() {
  if (db.meta.seeded) return;
  const osman = {
    id: id('usr'),
    username: 'osman',
    name: 'Osman Rao',
    role: 'Founder & CEO',
    department: 'Executive',
    accessLevel: 'admin',
    active: true,
    passwordHash: bcrypt.hashSync(SEED_PASSWORDS.osman, 10),
    createdAt: new Date().toISOString(),
  };

  // Each teammate is seeded with a ready password (first-name username).
  function member(name, role, department, accessLevel) {
    const username = uniqueUsername(firstNameSlug(name));
    const pw = SEED_PASSWORDS[username] || generatePassword(10);
    return {
      id: id('usr'),
      username,
      name,
      role,
      department,
      accessLevel,
      active: true,
      passwordHash: bcrypt.hashSync(pw, 10),
      createdAt: new Date().toISOString(),
    };
  }

  const sanwa = member('Sanwa Ali', 'Co-Founder & CSO / Head of Investor Relations', 'Investor Pipeline', 'director');
  const ayesha = member('Ayesha Khan', 'Project Director', 'Project Management', 'director');
  const danish = member('M. Danish Ishfaq', 'CTO', 'Engineering', 'member');
  const talha = member('Talha Asif', 'Co-Founder & CPO', 'Product', 'member');
  const junaid = member('Junaid Amir', 'Marketing Head', 'Marketing', 'member');
  const hamza = member('Hamza Dar', 'Investor Relations', 'Investor Relations', 'member');
  // COO oversight account: Director access (all tasks, calendar, KPIs and
  // remarks; no user management).
  const jybran = member('Jybran Waheed', 'COO', 'Operations', 'director');

  // Additional team members.
  const mesum = member('Mesum', 'Design Team', 'Product', 'member');
  const ahsan = member('Ahsan', 'Advisor', 'Executive', 'member');
  const umair = member('Umair', 'Trainee', 'Operations', 'member');

  db.users.push(osman, sanwa, ayesha, danish, talha, junaid, hamza, jybran, mesum, ahsan, umair);

  const now = new Date().toISOString();
  function task(o) {
    return Object.assign(
      {
        id: id('tsk'),
        parentId: null,
        owners: [],
        createdBy: osman.id,
        description: '',
        department: 'Executive',
        priority: 'P1',
        status: 'Not Started',
        startDate: '',
        dueDate: '',
        completedAt: null,
        milestones: [],
        timeLogs: [],
        updates: [],
        createdAt: now,
        updatedAt: now,
      },
      o
    );
  }
  function ms(titles) {
    return titles.map((t) => ({ id: id('ms'), title: t, done: false }));
  }

  db.tasks.push(
    task({
      title: 'Finalize the pitch deck',
      department: 'Investor Pipeline',
      priority: 'P0',
      owners: [sanwa.id],
      description:
        'Lock the canonical deck. Use the conservative base case throughout. Represent traction with the Signed, Activating, Proving framing. No projections shown as recognised revenue.',
      milestones: ms([
        'Narrative and structure locked',
        'Conservative base-case financials inserted',
        'Traction slide (Signed / Activating / Proving)',
        'Brand and design pass',
        'Final review with CEO',
      ]),
    }),
    task({
      title: 'Secure 3 to 5 investor meetings this month',
      department: 'Investor Pipeline',
      priority: 'P0',
      owners: [sanwa.id, osman.id],
      description:
        'Identify and approach target investors and VCs. Sequencing: Pakistan first (warmest), UK second, KSA last. Each completed milestone equals one confirmed meeting.',
      milestones: ms(['Meeting 1', 'Meeting 2', 'Meeting 3', 'Meeting 4', 'Meeting 5']),
    }),
    task({
      title: 'Rebuild core app to investor-demo-ready',
      department: 'Engineering',
      priority: 'P0',
      owners: [danish.id],
      description:
        'Single highest-priority item. Full rebuild and fix across all three modules: InstaWallet, space booking, AI listing verification. Needs a clear sprint plan with weekly milestones, not just "in progress". Coordinate scope and acceptance criteria with CPO.',
      milestones: ms([
        'Weekly sprint plan published',
        'InstaWallet module working',
        'Space booking module working',
        'AI listing verification module working',
        'End-to-end demo flow stable',
        'Deployed to a shareable staging URL',
      ]),
    }),
    task({
      title: "Define product 'done' for each module",
      department: 'Product',
      priority: 'P0',
      owners: [talha.id],
      description:
        'Work directly with the CTO on scope, UX flow, and acceptance criteria for each module so engineering is not guessing.',
      milestones: ms([
        'InstaWallet acceptance criteria',
        'Space booking acceptance criteria',
        'AI verification acceptance criteria',
        'UX flows handed to CTO',
      ]),
    }),
    task({
      title: 'Own investor demo script and product roadmap',
      department: 'Product',
      priority: 'P1',
      owners: [talha.id],
      description: 'The script the team walks investors through in meetings, plus the roadmap for the next two quarters.',
      milestones: ms(['Demo script drafted', 'Roadmap (next two quarters) drafted', 'Reviewed with CSO']),
    }),
    task({
      title: 'Own the master project timeline',
      department: 'Project Management',
      priority: 'P1',
      owners: [ayesha.id],
      description:
        'Own the timeline across all workstreams. Track CTO sprint progress, CSO investor meeting schedule, and marketing deliverables.',
      milestones: ms([
        'Timeline built across all workstreams',
        'CTO sprint tracking live',
        'Investor meeting schedule tracked',
        'Marketing deliverables tracked',
      ]),
    }),
    task({
      title: 'Weekly status report to COO',
      department: 'Project Management',
      priority: 'P2',
      owners: [ayesha.id],
      description: 'A consolidated weekly status across all workstreams, delivered to the COO.',
      milestones: ms(['Week 1 report', 'Week 2 report', 'Week 3 report', 'Week 4 report']),
    }),
    task({
      title: 'Activate social media presence',
      department: 'Marketing',
      priority: 'P1',
      owners: [junaid.id],
      description:
        'Get InstaSpace active on Instagram, LinkedIn, and Twitter/X at minimum, with a consistent posting schedule. Public positioning is a Dubai/UAE company. Keep network outreach to Pakistan private and offline, never on public assets.',
      milestones: ms([
        'Instagram live with schedule',
        'LinkedIn active cadence',
        'Twitter/X active',
        'Posting schedule documented',
      ]),
    }),
    task({
      title: 'Fix the single-pager website',
      department: 'Marketing',
      priority: 'P0',
      owners: [junaid.id],
      description:
        'Get the site fully functional this week. A working site is non-negotiable for investor credibility. Must be brand compliant.',
      milestones: ms([
        'All links and sections working',
        'Contact / lead capture works',
        'Mobile responsive',
        'Brand compliant',
        'Live on myinstaspace.com',
      ]),
    }),
    task({
      title: 'Build investor target list and outreach tracker',
      department: 'Investor Relations',
      priority: 'P1',
      owners: [hamza.id],
      description: 'Coordinate scheduling with CSO and CEO. Build the list by market in the agreed sequence.',
      milestones: ms([
        'Pakistan list (warm network)',
        'UK list',
        'KSA list',
        'Outreach tracker and stages set up',
      ]),
    }),
    task({
      title: 'Prepare data room materials',
      department: 'Investor Relations',
      priority: 'P1',
      owners: [hamza.id],
      description:
        'Prepare in parallel with product development. The post-money SAFE document is currently missing from the follow-up package and is needed to enable commitments.',
      milestones: ms([
        'Financials pack',
        'Cap table',
        'Traction metrics (Signed / Activating / Proving)',
        'Post-money SAFE document included',
        'Access controls set',
      ]),
    })
  );

  db.meta.seeded = true;
  store.persist();

  console.log('\n==================================================');
  console.log(' InstaSpace ERP seeded with 11 team logins.');
  console.log(' Admin: osman / ' + SEED_PASSWORDS.osman);
  console.log(' All eight first-name logins are set (see the team');
  console.log(' credentials sheet). Ask everyone to change their');
  console.log(' password after first sign in (Account menu).');
  console.log('==================================================\n');
}

seed();
ensureCanonicalLogins();

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */
app.use(express.json({ limit: '256kb' }));
app.use(
  cookieSession({
    name: 'iss',
    secret: SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY !== 'false',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Load current user fresh from store on every request (so deactivation and
// access-level changes take effect immediately).
app.use((req, res, next) => {
  req.user = null;
  if (req.session && req.session.uid) {
    const u = userById(req.session.uid);
    if (u && u.active) req.user = u;
    else req.session = null;
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.accessLevel !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}
function canSeeAll(user) {
  return user.accessLevel === 'admin' || user.accessLevel === 'director';
}

/* ------------------------------------------------------------------ *
 * Auth routes
 * ------------------------------------------------------------------ */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find(
    (x) => x.username === String(username || '').toLowerCase().trim()
  );
  if (!u || !u.active) return res.status(401).json({ error: 'Invalid username or password' });
  if (!u.passwordHash)
    return res
      .status(403)
      .json({ error: 'No password set yet. Ask your admin to generate your access.' });
  if (!bcrypt.compareSync(String(password || ''), u.passwordHash))
    return res.status(401).json({ error: 'Invalid username or password' });
  req.session.uid = u.id;
  res.json({ user: publicUser(u) });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), reference: { STATUSES, PRIORITIES, DEPARTMENTS, ACCESS_LEVELS } });
});

// Change own password.
app.post('/api/me/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.passwordHash || ''))
    return res.status(400).json({ error: 'Current password is incorrect' });
  if (!next || String(next).length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  req.user.passwordHash = bcrypt.hashSync(String(next), 10);
  store.persist();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Users (Admin only)
 * ------------------------------------------------------------------ */
app.get('/api/users', requireAuth, (req, res) => {
  // Everyone can read the directory (names, roles). Only admin sees status flags meaningfully.
  res.json({ users: db.users.map(publicUser) });
});

app.post('/api/users', requireAdmin, (req, res) => {
  if (db.users.length >= 20)
    return res.status(400).json({ error: 'User limit reached (20).' });
  const { name, role, department, accessLevel } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ error: 'Name is required' });
  const level = ACCESS_LEVELS.includes(accessLevel) ? accessLevel : 'member';
  const dept = DEPARTMENTS.includes(department) ? department : 'Executive';
  const password = generatePassword(10);
  const u = {
    id: id('usr'),
    username: uniqueUsername(firstNameSlug(name)),
    name: String(name).trim(),
    role: String(role || '').trim(),
    department: dept,
    accessLevel: level,
    active: true,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  db.users.push(u);
  store.persist();
  // Return the generated password ONCE so the admin can share it.
  res.json({ user: publicUser(u), credentials: { username: u.username, password } });
});

app.post('/api/users/:uid/password', requireAdmin, (req, res) => {
  const u = userById(req.params.uid);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const password = generatePassword(10);
  u.passwordHash = bcrypt.hashSync(password, 10);
  store.persist();
  res.json({ credentials: { username: u.username, password } });
});

app.patch('/api/users/:uid', requireAdmin, (req, res) => {
  const u = userById(req.params.uid);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { name, role, department, accessLevel, active } = req.body || {};
  if (name != null) u.name = String(name).trim() || u.name;
  if (role != null) u.role = String(role).trim();
  if (department != null && DEPARTMENTS.includes(department)) u.department = department;
  if (accessLevel != null && ACCESS_LEVELS.includes(accessLevel)) {
    // Guard: never remove the last active admin.
    if (u.accessLevel === 'admin' && accessLevel !== 'admin') {
      const otherAdmins = db.users.filter(
        (x) => x.accessLevel === 'admin' && x.active && x.id !== u.id
      );
      if (otherAdmins.length === 0)
        return res.status(400).json({ error: 'There must be at least one admin.' });
    }
    u.accessLevel = accessLevel;
  }
  if (active != null) {
    if (u.accessLevel === 'admin' && active === false) {
      const otherAdmins = db.users.filter(
        (x) => x.accessLevel === 'admin' && x.active && x.id !== u.id
      );
      if (otherAdmins.length === 0)
        return res.status(400).json({ error: 'Cannot deactivate the last admin.' });
    }
    u.active = !!active;
  }
  store.persist();
  res.json({ user: publicUser(u) });
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */
function decorateTask(t) {
  return Object.assign({}, t, {
    progress: taskProgress(t),
    totalHours: taskHours(t),
    childCount: childrenOf(t.id).length,
    ownerNames: t.owners.map((oid) => {
      const u = userById(oid);
      return u ? u.name : 'Unknown';
    }),
    timeLogs: (t.timeLogs || []).map((l) => {
      const u = userById(l.userId);
      return Object.assign({}, l, { userName: u ? u.name : (l.userName || 'Unknown') });
    }),
  });
}

// Member sees their own and connected tasks; director/admin see all.
app.get('/api/tasks', requireAuth, (req, res) => {
  const list = db.tasks.filter((t) => visibleToUser(req.user, t));
  res.json({ tasks: list.map(decorateTask) });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title || !String(b.title).trim())
    return res.status(400).json({ error: 'Title is required' });

  // Sub-task support: validate parent and the right to attach to it.
  let parentId = null;
  if (b.parentId) {
    const parent = db.tasks.find((x) => x.id === b.parentId);
    if (!parent) return res.status(400).json({ error: 'Parent task not found' });
    if (parent.parentId)
      return res.status(400).json({ error: 'Sub-tasks cannot have their own sub-tasks' });
    if (!canEditTask(req.user, parent) && !ownsTask(req.user, parent) && !createdByUser(req.user, parent))
      return res.status(403).json({ error: 'You cannot add sub-tasks to this task' });
    parentId = parent.id;
  }

  const isPriv = req.user.accessLevel === 'admin' || req.user.accessLevel === 'director';
  let owners = Array.isArray(b.owners) ? b.owners.filter((oid) => userById(oid)) : [];
  // Members can only assign themselves; privileged roles may assign anyone.
  if (!isPriv) owners = owners.filter((oid) => oid === req.user.id);
  if (!owners.length) owners = [req.user.id];

  const now = new Date().toISOString();
  const status = STATUSES.includes(b.status) ? b.status : 'Not Started';
  const t = {
    id: id('tsk'),
    parentId,
    title: String(b.title).trim(),
    description: String(b.description || '').trim(),
    owners,
    createdBy: req.user.id,
    department: DEPARTMENTS.includes(b.department) ? b.department : (req.user.department || 'Executive'),
    priority: PRIORITIES.includes(b.priority) ? b.priority : 'P1',
    status,
    startDate: String(b.startDate || ''),
    dueDate: String(b.dueDate || ''),
    completedAt: status === 'Done' ? now : null,
    milestones: Array.isArray(b.milestones)
      ? b.milestones
          .filter((m) => m && m.title)
          .map((m) => ({ id: id('ms'), title: String(m.title).trim(), done: !!m.done }))
      : [],
    timeLogs: [],
    updates: [],
    createdAt: now,
    updatedAt: now,
  };
  db.tasks.push(t);
  store.persist();
  res.json({ task: decorateTask(t) });
});

app.patch('/api/tasks/:tid', requireAuth, (req, res) => {
  const t = db.tasks.find((x) => x.id === req.params.tid);
  if (!t) return res.status(404).json({ error: 'Task not found' });

  const canComment = visibleToUser(req.user, t);
  if (!canComment)
    return res.status(403).json({ error: 'You do not have access to this task' });

  const b = req.body || {};
  const mayEdit = canEditTask(req.user, t);
  const isPriv = req.user.accessLevel === 'admin' || req.user.accessLevel === 'director';
  const mayReassign = isPriv || createdByUser(req.user, t);

  if (mayEdit) {
    // Status (and completion timestamp).
    if (b.status != null && STATUSES.includes(b.status)) {
      t.status = b.status;
      if (b.status === 'Done') t.completedAt = t.completedAt || new Date().toISOString();
      else t.completedAt = null;
    }
    // Content fields directors and members can both edit.
    if (b.title != null && String(b.title).trim()) t.title = String(b.title).trim();
    if (b.description != null) t.description = String(b.description).trim();
    if (b.priority != null && PRIORITIES.includes(b.priority)) t.priority = b.priority;
    if (b.department != null && DEPARTMENTS.includes(b.department)) t.department = b.department;
    if (b.startDate != null) t.startDate = String(b.startDate);
    if (b.dueDate != null) t.dueDate = String(b.dueDate);

    // Milestones (any editor).
    if (b.toggleMilestone != null) {
      const m = t.milestones.find((x) => x.id === b.toggleMilestone);
      if (m) m.done = !m.done;
    }
    if (b.addMilestone && String(b.addMilestone).trim())
      t.milestones.push({ id: id('ms'), title: String(b.addMilestone).trim(), done: false });
    if (b.removeMilestone)
      t.milestones = t.milestones.filter((m) => m.id !== b.removeMilestone);

    // Owner reassignment (privileged roles or the task's creator).
    if (Array.isArray(b.owners) && mayReassign) {
      const valid = b.owners.filter((oid) => userById(oid));
      if (valid.length) t.owners = valid;
    }

    // Time logging: total hours worked on the task.
    if (b.addTimeLog && typeof b.addTimeLog === 'object') {
      const hrs = Number(b.addTimeLog.hours);
      if (isFinite(hrs) && hrs > 0 && hrs <= 1000) {
        if (!Array.isArray(t.timeLogs)) t.timeLogs = [];
        t.timeLogs.unshift({
          id: id('log'),
          userId: req.user.id,
          userName: req.user.name,
          hours: Math.round(hrs * 100) / 100,
          date: String(b.addTimeLog.date || new Date().toISOString().slice(0, 10)),
          note: String(b.addTimeLog.note || '').trim(),
          createdAt: new Date().toISOString(),
        });
      } else {
        return res.status(400).json({ error: 'Hours must be a number between 0 and 1000' });
      }
    }
    if (b.removeTimeLog && Array.isArray(t.timeLogs)) {
      // A user can remove their own log; privileged roles can remove any.
      t.timeLogs = t.timeLogs.filter((l) => {
        if (l.id !== b.removeTimeLog) return true;
        return !(isPriv || l.userId === req.user.id);
      });
    }
  } else if (
    b.status != null || b.title != null || b.description != null ||
    b.priority != null || b.toggleMilestone != null || b.addTimeLog != null
  ) {
    return res.status(403).json({ error: 'You can only edit your own or tasks you created' });
  }

  // Comments / remarks: anyone who can see the task (members, directors, admins).
  if (b.update && String(b.update).trim()) {
    t.updates.unshift({
      id: id('upd'),
      text: String(b.update).trim(),
      by: req.user.id,
      byName: req.user.name,
      at: new Date().toISOString(),
    });
  }

  t.updatedAt = new Date().toISOString();
  store.persist();
  res.json({ task: decorateTask(t) });
});

app.delete('/api/tasks/:tid', requireAuth, (req, res) => {
  const t = db.tasks.find((x) => x.id === req.params.tid);
  if (!t) return res.status(404).json({ error: 'Task not found' });

  const isAdmin = req.user.accessLevel === 'admin';
  if (!isAdmin && t.createdBy !== req.user.id)
    return res.status(403).json({ error: 'Only an admin or the task creator can delete this task' });

  // Cascade: remove the task and any sub-tasks under it.
  const removeIds = new Set([t.id, ...childrenOf(t.id).map((c) => c.id)]);
  db.tasks = db.tasks.filter((x) => !removeIds.has(x.id));
  store.persist();
  res.json({ ok: true, removed: removeIds.size });
});

/* ------------------------------------------------------------------ *
 * Metrics (scoped by access level)
 * ------------------------------------------------------------------ */
app.get('/api/metrics', requireAuth, (req, res) => {
  const all = canSeeAll(req.user);
  const scope = all ? db.tasks : db.tasks.filter((t) => ownsTask(req.user, t));

  const byStatus = {};
  STATUSES.forEach((s) => (byStatus[s] = 0));
  const byDept = {};
  const byPriority = {};
  PRIORITIES.forEach((p) => (byPriority[p] = 0));

  scope.forEach((t) => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byDept[t.department] = (byDept[t.department] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  });

  const total = scope.length;
  const done = byStatus['Done'] || 0;
  const completion = total ? Math.round((done / total) * 100) : 0;
  const p0Open = scope.filter((t) => t.priority === 'P0' && t.status !== 'Done').length;
  const blocked = byStatus['Blocked'] || 0;
  const totalHours = Math.round(scope.reduce((s, t) => s + taskHours(t), 0) * 100) / 100;

  const metrics = {
    scope: all ? 'all' : 'self',
    total,
    done,
    completion,
    p0Open,
    blocked,
    totalHours,
    byStatus,
    byDept,
    byPriority,
  };

  // Investor-meeting tracker: surface the dedicated task's milestone progress.
  const meetingTask = db.tasks.find((t) => /investor meetings/i.test(t.title));
  if (meetingTask && all) {
    metrics.investorMeetings = {
      booked: meetingTask.milestones.filter((m) => m.done).length,
      target: meetingTask.milestones.length,
    };
  }

  // Per-person leaderboard (cross-team view only).
  if (all) {
    metrics.people = db.users
      .filter((u) => u.active)
      .map((u) => {
        const mine = db.tasks.filter((t) => t.owners.includes(u.id));
        const myDone = mine.filter((t) => t.status === 'Done').length;
        const hours = Math.round(
          db.tasks.reduce(
            (s, t) => s + (t.timeLogs || []).reduce((a, l) => a + (l.userId === u.id ? (Number(l.hours) || 0) : 0), 0),
            0
          ) * 100
        ) / 100;
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          department: u.department,
          tasks: mine.length,
          done: myDone,
          hours,
          completion: mine.length ? Math.round((myDone / mine.length) * 100) : 0,
          avgProgress: mine.length
            ? Math.round(mine.reduce((s, t) => s + taskProgress(t), 0) / mine.length)
            : 0,
        };
      });
  }

  res.json({ metrics });
});

/* ------------------------------------------------------------------ *
 * KPI report (per user, including the admin)
 * ------------------------------------------------------------------ */
function computeKpi(u) {
  const owned = db.tasks.filter((t) => t.owners.includes(u.id));
  const mainTasks = owned.filter((t) => !t.parentId).length;
  const subTasks = owned.filter((t) => t.parentId).length;

  const by = { 'Not Started': 0, 'In Progress': 0, Blocked: 0, Done: 0 };
  owned.forEach((t) => { by[t.status] = (by[t.status] || 0) + 1; });

  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  let overdue = 0, dueSoon = 0, onTimeDone = 0, lateDone = 0;
  owned.forEach((t) => {
    const due = t.dueDate ? new Date(t.dueDate).getTime() : null;
    if (t.status === 'Done') {
      if (due && t.completedAt) {
        if (new Date(t.completedAt).getTime() <= due) onTimeDone++;
        else lateDone++;
      }
    } else if (due) {
      if (due < now) overdue++;
      else if (due <= weekAhead) dueSoon++;
    }
  });

  // Hours logged by this user across every task (not only owned).
  let hours = 0;
  db.tasks.forEach((t) => {
    (t.timeLogs || []).forEach((l) => {
      if (l.userId === u.id) hours += Number(l.hours) || 0;
    });
  });
  hours = Math.round(hours * 100) / 100;

  // Remarks / comments posted by this user across all tasks.
  let comments = 0;
  db.tasks.forEach((t) => {
    (t.updates || []).forEach((up) => { if (up.by === u.id) comments++; });
  });

  const total = owned.length;
  const done = by['Done'] || 0;
  const openP = { P0: 0, P1: 0, P2: 0 };
  owned.forEach((t) => { if (t.status !== 'Done') openP[t.priority] = (openP[t.priority] || 0) + 1; });

  const avgProgress = total
    ? Math.round(owned.reduce((s, t) => s + taskProgress(t), 0) / total)
    : 0;

  return {
    id: u.id,
    name: u.name,
    role: u.role,
    department: u.department,
    accessLevel: u.accessLevel,
    tasks: total,
    mainTasks,
    subTasks,
    done,
    inProgress: by['In Progress'] || 0,
    blocked: by['Blocked'] || 0,
    notStarted: by['Not Started'] || 0,
    completion: total ? Math.round((done / total) * 100) : 0,
    avgProgress,
    overdue,
    dueSoon,
    onTimeDone,
    lateDone,
    hours,
    comments,
    openP0: openP.P0 || 0,
    openP1: openP.P1 || 0,
    openP2: openP.P2 || 0,
  };
}

app.get('/api/kpis', requireAuth, (req, res) => {
  const all = canSeeAll(req.user);
  const users = all
    ? db.users.filter((u) => u.active)
    : db.users.filter((u) => u.id === req.user.id);
  const kpis = users.map(computeKpi);
  // Sort the cross-team view by completion then hours, strongest first.
  if (all) kpis.sort((a, b) => b.completion - a.completion || b.hours - a.hours);
  res.json({ scope: all ? 'all' : 'self', kpis });
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log('InstaSpace ERP running on http://localhost:' + PORT);
  if (!process.env.SESSION_SECRET)
    console.log('Note: set SESSION_SECRET in production to keep sessions stable across restarts.');
});
