'use strict';
/* InstaSpace ERP - front-end SPA (vanilla JS, no build step). */

const ICON = `<svg class="icon" viewBox="0 0 32.476 72.022" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.518 0.018 C12.36 0.253 9.904 1.056 8.171 2.086 C3.593 4.812 0.641 9.48 0.117 14.852 C0.0 16.098 0.0 56.204 0.117 57.368 C0.758 63.418 4.587 68.609 10.076 70.884 C11.241 71.363 12.017 71.589 13.435 71.841 C14.392 72.013 14.753 72.022 16.55 71.986 C18.283 71.95 18.735 71.914 19.628 71.715 C21.046 71.408 21.895 71.11 23.231 70.469 C28.395 67.986 31.709 63.228 32.341 57.368 C32.467 56.204 32.476 15.99 32.35 14.789 C31.817 9.715 29.208 5.345 25.055 2.573 C23.402 1.472 21.552 0.704 19.493 0.271 C18.59 0.081 18.094 0.036 16.64 0.009 C15.674 0.0 14.717 0.0 14.518 0.018 M17.778 6.058 C19.231 6.329 20.405 6.835 21.588 7.72 C23.538 9.2 24.802 11.358 25.398 14.256 C25.831 16.378 25.849 17.019 25.849 28.729 C25.849 35.248 25.813 39.69 25.768 39.672 C25.723 39.654 24.919 38.914 23.98 38.02 C23.041 37.126 21.524 35.7 20.613 34.86 C12.451 27.33 11.024 25.867 9.282 23.258 C7.936 21.227 7.205 19.637 6.79 17.796 C6.401 16.053 6.537 13.642 7.124 11.837 C8.505 7.548 12.884 5.182 17.778 6.058 M9.607 35.086 C10.916 36.304 12.613 37.894 13.39 38.616 C14.157 39.338 15.439 40.539 16.234 41.288 C20.874 45.64 22.942 48.114 24.359 51.012 C25.47 53.269 25.903 55.057 25.822 57.025 C25.705 59.878 24.919 61.847 23.204 63.607 C19.999 66.894 13.633 66.966 10.157 63.752 C8.225 61.964 7.051 59.255 6.717 55.816 C6.654 55.174 6.618 50.868 6.618 43.6 L6.618 32.368 L6.916 32.621 C7.088 32.756 8.297 33.867 9.607 35.086"/></svg>`;
const WM = `<span class="wordmark"><span class="insta">Insta</span><span class="space">Space</span></span>`;

const STATUS_COLOR = {
  'Not Started': 'var(--st-notstarted)',
  'In Progress': 'var(--st-progress)',
  'Blocked': 'var(--st-blocked)',
  'Done': 'var(--st-done)',
};

let state = { me: null, ref: null, tasks: [], users: [], metrics: null, kpis: null, tab: null, calMonth: null, expanded: {} };

/* ---------- date helpers ---------- */
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return esc(s);
  const hasTime = /T\d/.test(s);
  const opt = { year: 'numeric', month: 'short', day: 'numeric' };
  let out = d.toLocaleDateString(undefined, opt);
  if (hasTime) out += ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return out;
}
function isOverdue(t) {
  if (!t.dueDate || t.status === 'Done') return false;
  const d = new Date(t.dueDate);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

/* ---------- api ---------- */
async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- boot ---------- */
async function init() {
  try {
    const data = await api('/api/me');
    state.me = data.user;
    state.ref = data.reference;
    await loadApp();
  } catch (e) {
    renderLogin();
  }
}

/* ---------- login ---------- */
function renderLogin(msg) {
  document.body.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">${ICON}${WM}</div>
        <div class="tag">Team operations portal</div>
        <div class="field"><label>Username</label><input id="u" type="text" autocomplete="username" autofocus></div>
        <div class="field"><label>Password</label><input id="p" type="password" autocomplete="current-password"></div>
        <div class="error" id="err">${msg ? esc(msg) : ''}</div>
        <button class="btn primary" id="go">Sign in</button>
      </div>
    </div>`;
  const submit = async () => {
    $('#err').textContent = '';
    try {
      const d = await api('/api/login', 'POST', { username: $('#u').value, password: $('#p').value });
      state.me = d.user;
      const me = await api('/api/me');
      state.ref = me.reference;
      await loadApp();
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#go').onclick = submit;
  $('#p').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

/* ---------- app shell ---------- */
function tabsFor(level) {
  if (level === 'admin') return ['Overview', 'Tasks', 'Calendar', 'KPIs', 'Team', 'Account'];
  if (level === 'director') return ['Overview', 'Tasks', 'Calendar', 'KPIs', 'Account'];
  return ['My work', 'Calendar', 'KPIs', 'Account'];
}

async function loadApp() {
  await refreshData();
  state.tab = tabsFor(state.me.accessLevel)[0];
  renderShell();
}

async function refreshData() {
  const [m, t, u, k] = await Promise.all([
    api('/api/metrics'),
    api('/api/tasks'),
    api('/api/users'),
    api('/api/kpis'),
  ]);
  state.metrics = m.metrics;
  state.tasks = t.tasks;
  state.users = u.users;
  state.kpis = k.kpis;
}

function renderShell() {
  const me = state.me;
  const tabs = tabsFor(me.accessLevel);
  document.body.innerHTML = `
    <div class="topbar">
      <div class="brand">${ICON}${WM}</div>
      <div class="right">
        <div class="who"><div class="name">${esc(me.name)}</div><div class="role">${esc(me.role || '')}</div></div>
        <span class="badge ${me.accessLevel}">${me.accessLevel}</span>
        <button class="btn ghost sm" id="logout" style="color:var(--cream);border-color:#5a4d68">Sign out</button>
      </div>
    </div>
    <div class="container">
      <div class="tabs">${tabs.map((t) => `<button class="tab ${t === state.tab ? 'active' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>
      <div id="view"></div>
    </div>`;
  $('#logout').onclick = async () => { await api('/api/logout', 'POST'); renderLogin(); };
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; renderShell(); }));
  renderView();
}

function renderView() {
  const v = $('#view');
  const t = state.tab;
  if (t === 'Overview') v.innerHTML = viewDashboard(true);
  else if (t === 'My work') v.innerHTML = viewMyWork();
  else if (t === 'Tasks') v.innerHTML = viewTasks();
  else if (t === 'Calendar') v.innerHTML = viewCalendar();
  else if (t === 'KPIs') v.innerHTML = viewKpis();
  else if (t === 'Team') v.innerHTML = viewTeam();
  else if (t === 'Account') v.innerHTML = viewAccount();
  wireView();
}

/* ---------- dashboard ---------- */
function svgDonut(byStatus) {
  const order = ['Done', 'In Progress', 'Blocked', 'Not Started'];
  const total = order.reduce((s, k) => s + (byStatus[k] || 0), 0);
  const r = 52, cx = 70, cy = 70, C = 2 * Math.PI * r;
  let off = 0;
  let arcs = '';
  if (total === 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
  } else {
    order.forEach((k) => {
      const val = byStatus[k] || 0;
      if (!val) return;
      const len = (val / total) * C;
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STATUS_COLOR[k]}" stroke-width="22"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"/>`;
      off += len;
    });
  }
  return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Task status breakdown">
    ${arcs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="30" font-weight="800" fill="var(--aubergine)">${total}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink-soft)">tasks</text>
  </svg>`;
}

function legend(byStatus) {
  return `<div class="legend">` + ['Done', 'In Progress', 'Blocked', 'Not Started']
    .map((k) => `<span><i style="background:${STATUS_COLOR[k]}"></i>${k} (${byStatus[k] || 0})</span>`).join('') + `</div>`;
}

function deptBars(byDept) {
  const entries = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">No tasks yet.</div>`;
  const max = Math.max(...entries.map((e) => e[1]));
  return `<table><tbody>` + entries.map(([d, n]) =>
    `<tr><td style="width:42%">${esc(d)}</td>
       <td><div class="bar"><span style="width:${Math.round((n / max) * 100)}%"></span></div></td>
       <td style="width:36px;text-align:right;font-weight:800">${n}</td></tr>`).join('') + `</tbody></table>`;
}

function viewDashboard(all) {
  const m = state.metrics;
  const scopeAll = m.scope === 'all';
  const readinessLabel = scopeAll ? 'Investor readiness (overall task completion)' : 'Your completion';
  let html = `
    <div class="readiness">
      <div><div class="headline">${readinessLabel}</div><div class="big">${m.completion}%</div></div>
      <div class="meter"><div class="meter-track"><div class="meter-fill" style="width:${m.completion}%"></div></div>
        <div style="font-size:12px;color:#d9cbe6;margin-top:8px">${m.done} of ${m.total} tasks done${m.p0Open ? ' &middot; ' + m.p0Open + ' P0 still open' : ''}${m.totalHours ? ' &middot; ' + m.totalHours + ' h logged' : ''}</div></div>
    </div>`;

  html += `<div class="grid cols-4" style="margin-top:16px">
    <div class="stat"><div class="label">Total tasks</div><div class="value">${m.total}</div><div class="sub">${scopeAll ? 'all workstreams' : 'assigned to you'}</div></div>
    <div class="stat accent"><div class="label">Completed</div><div class="value">${m.done}</div><div class="sub">${m.completion}% of total</div></div>
    <div class="stat alert"><div class="label">P0 open</div><div class="value">${m.p0Open}</div><div class="sub">highest priority</div></div>
    <div class="stat"><div class="label">Blocked</div><div class="value" style="color:var(--crimson)">${m.blocked}</div><div class="sub">needs attention</div></div>
  </div>`;

  html += `<div class="grid cols-2" style="margin-top:16px">
    <div class="card"><h3>Status breakdown</h3>
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${svgDonut(m.byStatus)}<div style="flex:1;min-width:160px">${legend(m.byStatus)}</div></div></div>
    <div class="card"><h3>Tasks by department</h3>${deptBars(m.byDept)}</div>
  </div>`;

  if (scopeAll && m.investorMeetings) {
    const im = m.investorMeetings;
    const pct = im.target ? Math.round((im.booked / im.target) * 100) : 0;
    html += `<div class="card" style="margin-top:16px"><h3>Investor meetings this month</h3>
      <div class="progress-row"><div class="progress"><span style="width:${pct}%"></span></div><div class="progress-num">${im.booked} / ${im.target}</div></div>
      <div class="sub" style="font-size:12px;color:var(--muted)">Target is 3 to 5 confirmed meetings. Updated from the investor pipeline task.</div></div>`;
  }

  if (scopeAll && m.people) {
    const people = m.people.filter((p) => p.tasks > 0).sort((a, b) => b.completion - a.completion);
    html += `<div class="section-title">Team progress</div><div class="card">
      <table><thead><tr><th>Person</th><th>Department</th><th>Done</th><th>Hours</th><th>Progress</th><th style="text-align:right">Completion</th></tr></thead><tbody>` +
      people.map((p) => `<tr>
        <td><strong>${esc(p.name)}</strong><div style="font-size:12px;color:var(--muted)">${esc(p.role || '')}</div></td>
        <td>${esc(p.department)}</td>
        <td>${p.done} / ${p.tasks}</td>
        <td>${p.hours}</td>
        <td><div class="bar"><span style="width:${p.avgProgress}%"></span></div></td>
        <td style="text-align:right;font-weight:800">${p.completion}%</td></tr>`).join('') +
      `</tbody></table></div>`;
  }

  // Read-only task feed for directors/admins, plus comment ability.
  if (scopeAll) {
    html += `<div class="section-title">All tasks</div><div id="taskfeed">${renderFeed(state.tasks)}</div>`;
  }
  return html;
}

/* ---------- my work ---------- */
function viewMyWork() {
  let html = viewDashboard(false);
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 4px">
      <div class="section-title" style="margin:0">My tasks</div>
      <button class="btn primary" data-act="new-task">New task</button>
    </div><div id="taskfeed">`;
  html += state.tasks.length ? renderFeed(state.tasks) : `<div class="empty">No tasks yet. Create one to get started.</div>`;
  html += `</div>`;
  return html;
}

/* ---------- task feed (main tasks with nested sub-tasks) ---------- */
function renderFeed(list) {
  const mains = list.filter((t) => !t.parentId);
  const subsBy = {};
  list.filter((t) => t.parentId).forEach((s) => { (subsBy[s.parentId] = subsBy[s.parentId] || []).push(s); });
  const ids = new Set(list.map((t) => t.id));
  const orphans = list.filter((t) => t.parentId && !ids.has(t.parentId));
  let html = '';
  mains.forEach((m) => {
    const subs = subsBy[m.id] || [];
    html += taskCard(m, false);
    if (subs.length) {
      const open = state.expanded[m.id] ? ' open' : '';
      html += `<div class="subwrap${open}" id="subwrap-${m.id}">` + subs.map((s) => taskCard(s, true)).join('') + `</div>`;
    }
  });
  orphans.forEach((s) => (html += taskCard(s, false)));
  return html || '<div class="empty">No tasks yet.</div>';
}

/* ---------- task card ---------- */
function rightsFor(t) {
  const me = state.me;
  const owner = (t.owners || []).includes(me.id);
  const creator = t.createdBy === me.id;
  const admin = me.accessLevel === 'admin';
  const director = me.accessLevel === 'director';
  const canEdit = admin || director || owner || creator;
  return {
    edit: canEdit,             // progress, status, milestones, dates, hours
    comment: true,             // anyone who can see the task may comment
    del: admin || creator,     // delete (admin or the creator)
    addSub: canEdit && !t.parentId, // sub-tasks only under a main task
  };
}

function taskCard(t, isSub) {
  const r = rightsFor(t);
  const sClass = t.status === 'In Progress' ? 's-progress' : t.status === 'Blocked' ? 's-blocked' : t.status === 'Done' ? 's-done' : '';
  const pClass = t.priority === 'P0' ? 'p0' : t.priority === 'P1' ? 'p1' : '';
  const statusSel = r.edit
    ? `<select class="status-select" data-act="status" data-id="${t.id}">${state.ref.STATUSES.map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`
    : `<span class="pill">${esc(t.status)}</span>`;

  const milestones = (t.milestones || []).map((m) =>
    `<li class="${m.done ? 'done' : ''}">
      <input type="checkbox" ${m.done ? 'checked' : ''} ${r.edit ? '' : 'disabled'} data-act="ms" data-id="${t.id}" data-ms="${m.id}">
      <span>${esc(m.title)}</span></li>`).join('');

  const updates = (t.updates || []).slice(0, 4).map((u) =>
    `<div class="update"><span class="by">${esc(u.byName)}</span> ${esc(u.text)} <span class="at">&middot; ${new Date(u.at).toLocaleDateString()}</span></div>`).join('');

  const overdue = isOverdue(t);
  const dueChip = t.dueDate
    ? `<span class="pill ${overdue ? 'p0' : ''}">${overdue ? 'Overdue' : 'Due'} ${esc(fmtDate(t.dueDate))}</span>` : '';
  const startChip = t.startDate ? `<span class="pill">Start ${esc(fmtDate(t.startDate))}</span>` : '';

  // Time logs block
  const logs = (t.timeLogs || []).slice(0, 4).map((l) =>
    `<div class="update"><span class="by">${esc(l.userName)}</span> ${l.hours}h${l.note ? ' &middot; ' + esc(l.note) : ''} <span class="at">&middot; ${esc(fmtDate(l.date))}</span>
      ${(state.me.accessLevel === 'admin' || state.me.accessLevel === 'director' || l.userId === state.me.id) ? `<button class="linkbtn" data-act="rmlog" data-id="${t.id}" data-log="${l.id}">remove</button>` : ''}</div>`).join('');

  const hoursBlock = `<div class="hours">
      <div class="hours-head"><span>Hours logged</span><strong>${t.totalHours || 0} h</strong></div>
      ${logs || '<div class="update" style="color:var(--muted)">No time logged yet.</div>'}
      ${r.edit ? `<div class="log-row">
        <input type="number" min="0" step="0.25" placeholder="Hrs" class="log-hrs" data-id="${t.id}">
        <input type="date" class="log-date" data-id="${t.id}">
        <input type="text" placeholder="Note (optional)" class="log-note" data-id="${t.id}">
        <button class="btn dark sm" data-act="loghrs" data-id="${t.id}">Log</button></div>` : ''}
    </div>`;

  return `<div class="task ${sClass} ${isSub ? 'subtask' : ''}">
    <div class="head">
      <div><div class="title">${!isSub && t.childCount ? `<button class="chev-btn${state.expanded[t.id] ? ' open' : ''}" data-act="toggle-subs" data-id="${t.id}" aria-label="Toggle sub-tasks"><svg class="chev-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ''}${isSub ? '<span class="sub-tag">Sub-task</span> ' : ''}${esc(t.title)}</div>
        <div class="meta">
          <span class="pill dept">${esc(t.department)}</span>
          ${pClass ? `<span class="pill ${pClass}">${t.priority}</span>` : `<span class="pill">${t.priority}</span>`}
          ${startChip}${dueChip}
          ${!isSub && t.childCount ? `<span class="pill">${t.childCount} sub-task${t.childCount > 1 ? 's' : ''}</span>` : ''}
        </div></div>
      <div style="display:flex;gap:8px;align-items:center">${statusSel}
        ${r.edit ? `<button class="btn ghost sm" data-act="edit" data-id="${t.id}">Edit</button>` : ''}</div>
    </div>
    ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ''}
    <div class="owners">Owner: ${(t.ownerNames || []).map(esc).join(', ') || 'Unassigned'}</div>
    <div class="progress-row"><div class="progress ${t.progress === 100 ? 'done' : ''}"><span style="width:${t.progress}%"></span></div><div class="progress-num">${t.progress}%</div></div>
    ${milestones ? `<ul class="milestones">${milestones}</ul>` : ''}
    ${hoursBlock}
    <div class="updates">
      ${updates || '<div class="update" style="color:var(--muted)">No updates yet.</div>'}
      ${r.comment ? `<div class="update-row"><input type="text" placeholder="Add a remark / update..." data-upd="${t.id}"><button class="btn dark sm" data-act="update" data-id="${t.id}">Post</button></div>` : ''}
    </div>
    ${r.addSub ? `<div style="margin-top:10px"><button class="btn ghost sm" data-act="add-sub" data-id="${t.id}">+ Add sub-task</button></div>` : ''}
  </div>`;
}

/* ---------- tasks (admin + director) ---------- */
function viewTasks() {
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="section-title" style="margin:0">Manage tasks (${state.tasks.length})</div>
      <button class="btn primary" data-act="new-task">New task</button>
    </div>
    <div id="taskfeed">${renderFeed(state.tasks)}</div>`;
}

/* ---------- calendar ---------- */
function viewCalendar() {
  if (!state.calMonth) { const n = new Date(); state.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const base = state.calMonth;
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = {};
  state.tasks.forEach((t) => {
    if (!t.dueDate) return;
    const d = new Date(t.dueDate);
    if (isNaN(d.getTime())) return;
    if (d.getFullYear() === year && d.getMonth() === month) {
      const k = d.getDate(); (byDay[k] = byDay[k] || []).push(t);
    }
  });
  const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell blank"></div>`;
  const todayStr = new Date().toDateString();
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const isToday = cellDate.toDateString() === todayStr;
    const items = (byDay[day] || []).map((t) => {
      const cls = t.status === 'Done' ? 'done' : isOverdue(t) ? 'overdue' : '';
      return `<div class="cal-task ${cls}" data-act="edit" data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</div>`;
    }).join('');
    cells += `<div class="cal-cell ${isToday ? 'today' : ''}"><div class="cal-num">${day}</div>${items}</div>`;
  }
  const upcoming = state.tasks
    .filter((t) => t.dueDate && t.status !== 'Done')
    .map((t) => ({ t, d: new Date(t.dueDate) }))
    .filter((x) => !isNaN(x.d.getTime()))
    .sort((a, b) => a.d - b.d).slice(0, 12);
  const agenda = upcoming.length
    ? upcoming.map(({ t }) => `<tr class="${isOverdue(t) ? 'od' : ''}">
        <td style="white-space:nowrap">${esc(fmtDate(t.dueDate))}</td>
        <td><strong>${esc(t.title)}</strong>${t.parentId ? ' <span class="sub-tag">sub</span>' : ''}</td>
        <td>${(t.ownerNames || []).map(esc).join(', ')}</td>
        <td>${esc(t.status)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">Nothing scheduled.</td></tr>`;

  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="section-title" style="margin:0">Calendar</div>
      <button class="btn primary" data-act="new-task">New task</button>
    </div>
    <div class="card">
      <div class="cal-bar">
        <button class="btn ghost sm" data-act="cal-prev">&lsaquo; Prev</button>
        <div class="cal-title">${monthName}</div>
        <button class="btn ghost sm" data-act="cal-next">Next &rsaquo;</button>
        <button class="btn ghost sm" data-act="cal-today" style="margin-left:auto">Today</button>
      </div>
      <div class="cal-grid head">${dow.map((d) => `<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="section-title">Upcoming deadlines</div>
    <div class="card" style="padding:6px 14px"><table><thead><tr><th>Due</th><th>Task</th><th>Owner</th><th>Status</th></tr></thead><tbody>${agenda}</tbody></table></div>`;
}

/* ---------- KPIs ---------- */
function statusMini(p) {
  const rows = [['Not started', p.notStarted], ['In progress', p.inProgress], ['Blocked', p.blocked], ['Done', p.done]];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<table><tbody>` + rows.map(([k, n]) =>
    `<tr><td style="width:42%">${k}</td><td><div class="bar"><span style="width:${Math.round((n / max) * 100)}%"></span></div></td><td style="width:36px;text-align:right;font-weight:800">${n}</td></tr>`).join('') + `</tbody></table>`;
}

function kpiTable(list) {
  return `<div class="card" style="padding:6px 14px;overflow-x:auto"><table class="kpi"><thead><tr>
    <th>Person</th><th>Tasks</th><th>Done</th><th>Completion</th><th>Avg</th><th>Hours</th><th>Overdue</th><th>On-time</th><th>Remarks</th></tr></thead><tbody>` +
    list.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong><div style="font-size:12px;color:var(--muted)">${esc(p.role || '')} &middot; <span class="badge ${p.accessLevel}" style="border-color:var(--line)">${p.accessLevel}</span></div></td>
      <td>${p.tasks} <span style="color:var(--muted);font-size:11px">(${p.mainTasks}m/${p.subTasks}s)</span></td>
      <td>${p.done}</td>
      <td><div class="bar" style="display:inline-block;width:54px;vertical-align:middle"><span style="width:${p.completion}%"></span></div> ${p.completion}%</td>
      <td>${p.avgProgress}%</td>
      <td><strong>${p.hours}</strong></td>
      <td>${p.overdue ? `<span style="color:var(--crimson);font-weight:700">${p.overdue}</span>` : '0'}</td>
      <td>${p.onTimeDone}/${p.onTimeDone + p.lateDone}</td>
      <td>${p.comments}</td></tr>`).join('') +
    `</tbody></table></div>`;
}

function viewKpis() {
  const all = state.me.accessLevel === 'admin' || state.me.accessLevel === 'director';
  const k = state.kpis || [];
  if (all) {
    const tot = k.reduce((a, p) => ({
      tasks: a.tasks + p.tasks, done: a.done + p.done,
      hours: Math.round((a.hours + p.hours) * 100) / 100, overdue: a.overdue + p.overdue,
    }), { tasks: 0, done: 0, hours: 0, overdue: 0 });
    return `<div class="section-title" style="margin-top:0">KPI report &mdash; whole team</div>
      <div class="grid cols-4">
        <div class="stat"><div class="label">People</div><div class="value">${k.length}</div><div class="sub">active</div></div>
        <div class="stat accent"><div class="label">Tasks done</div><div class="value">${tot.done}</div><div class="sub">of ${tot.tasks}</div></div>
        <div class="stat"><div class="label">Hours logged</div><div class="value">${tot.hours}</div><div class="sub">all users</div></div>
        <div class="stat alert"><div class="label">Overdue</div><div class="value" style="${tot.overdue ? 'color:var(--crimson)' : ''}">${tot.overdue}</div><div class="sub">open past due</div></div>
      </div>
      <div class="section-title">Per-person KPIs</div>
      ${kpiTable(k)}
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:12px">Tasks are shown as (main / sub). On-time counts tasks completed on or before their due date. Hours are summed from each person's time logs across all tasks.</p>`;
  }
  const p = k[0];
  if (!p) return `<div class="empty">No KPI data yet.</div>`;
  return `<div class="section-title" style="margin-top:0">Your KPIs</div>
    <div class="grid cols-4">
      <div class="stat"><div class="label">Your tasks</div><div class="value">${p.tasks}</div><div class="sub">${p.mainTasks} main &middot; ${p.subTasks} sub</div></div>
      <div class="stat accent"><div class="label">Completed</div><div class="value">${p.done}</div><div class="sub">${p.completion}% completion</div></div>
      <div class="stat"><div class="label">Hours logged</div><div class="value">${p.hours}</div><div class="sub">across your tasks</div></div>
      <div class="stat alert"><div class="label">Overdue</div><div class="value" style="${p.overdue ? 'color:var(--crimson)' : ''}">${p.overdue}</div><div class="sub">${p.dueSoon} due within 7 days</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><h3>Status of your tasks</h3>${statusMini(p)}</div>
      <div class="card"><h3>Delivery</h3>
        <table><tbody>
          <tr><td>Average progress</td><td style="text-align:right;font-weight:800">${p.avgProgress}%</td></tr>
          <tr><td>On-time completions</td><td style="text-align:right;font-weight:800">${p.onTimeDone}</td></tr>
          <tr><td>Late completions</td><td style="text-align:right;font-weight:800">${p.lateDone}</td></tr>
          <tr><td>Open P0 / P1 / P2</td><td style="text-align:right;font-weight:800">${p.openP0} / ${p.openP1} / ${p.openP2}</td></tr>
          <tr><td>Remarks posted</td><td style="text-align:right;font-weight:800">${p.comments}</td></tr>
        </tbody></table></div>
    </div>`;
}
function viewTeam() {
  const isAdmin = state.me.accessLevel === 'admin';
  const rows = state.users.map((u) => `<tr>
    <td><strong>${esc(u.name)}</strong><div style="font-size:12px;color:var(--muted)">@${esc(u.username)}</div></td>
    <td>${esc(u.role || '')}</td>
    <td>${esc(u.department)}</td>
    <td><span class="badge ${u.accessLevel}" style="border-color:var(--line)">${u.accessLevel}</span></td>
    <td>${u.hasPassword ? '<span style="color:var(--aubergine);font-weight:700">Active</span>' : '<span style="color:var(--crimson);font-weight:700">No password</span>'}${u.active ? '' : ' &middot; <span style="color:var(--muted)">disabled</span>'}</td>
    ${isAdmin ? `<td style="text-align:right;white-space:nowrap">
        <button class="btn ghost sm" data-act="user-pass" data-id="${u.id}">${u.hasPassword ? 'Reset' : 'Generate'} password</button>
        <button class="btn ghost sm" data-act="user-edit" data-id="${u.id}">Edit</button>
      </td>` : ''}
  </tr>`).join('');

  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="section-title" style="margin:0">Team (${state.users.length} / 20)</div>
      <button class="btn primary" data-act="new-user" ${state.users.length >= 20 ? 'disabled' : ''}>Add user</button>
    </div>
    <div class="card" style="padding:6px 14px">
      <table><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Access</th><th>Login</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:12px">Generating or resetting a password shows it once. Copy it and share it securely with the person. Passwords are stored hashed and cannot be viewed again.</p>`;
}

/* ---------- account ---------- */
function viewAccount() {
  return `<div class="card" style="max-width:440px">
    <h3>Change your password</h3>
    <div class="field"><label>Current password</label><input id="cur" type="password" autocomplete="current-password"></div>
    <div class="field"><label>New password (8+ characters)</label><input id="nw" type="password" autocomplete="new-password"></div>
    <div class="error" id="pwerr"></div>
    <button class="btn primary" data-act="change-pw">Update password</button>
  </div>`;
}

/* ---------- wiring ---------- */
function wireView() {
  document.querySelectorAll('[data-act]').forEach((el) => {
    const act = el.dataset.act;
    if (act === 'status') el.onchange = () => patchTask(el.dataset.id, { status: el.value });
    else if (act === 'ms') el.onchange = () => patchTask(el.dataset.id, { toggleMilestone: el.dataset.ms });
    else if (act === 'update') el.onclick = () => {
      const inp = document.querySelector(`[data-upd="${el.dataset.id}"]`);
      if (inp && inp.value.trim()) patchTask(el.dataset.id, { update: inp.value.trim() });
    };
    else if (act === 'loghrs') el.onclick = () => {
      const id = el.dataset.id;
      const hrs = document.querySelector(`.log-hrs[data-id="${id}"]`);
      const date = document.querySelector(`.log-date[data-id="${id}"]`);
      const note = document.querySelector(`.log-note[data-id="${id}"]`);
      const h = parseFloat(hrs && hrs.value);
      if (!h || h <= 0) { toast('Enter hours greater than 0'); return; }
      patchTask(id, { addTimeLog: { hours: h, date: (date && date.value) || undefined, note: (note && note.value) || '' } });
    };
    else if (act === 'rmlog') el.onclick = () => patchTask(el.dataset.id, { removeTimeLog: el.dataset.log });
    else if (act === 'edit') el.onclick = () => openTaskModal(el.dataset.id);
    else if (act === 'new-task') el.onclick = () => openTaskModal(null);
    else if (act === 'add-sub') el.onclick = () => openTaskModal(null, { parentId: el.dataset.id });
    else if (act === 'toggle-subs') el.onclick = () => {
      const tid = el.dataset.id;
      const w = document.getElementById('subwrap-' + tid);
      if (!w) return;
      const open = w.classList.toggle('open');
      el.classList.toggle('open', open);
      state.expanded[tid] = open;
    };
    else if (act === 'new-user') el.onclick = () => openUserModal(null);
    else if (act === 'user-edit') el.onclick = () => openUserModal(el.dataset.id);
    else if (act === 'user-pass') el.onclick = () => resetPassword(el.dataset.id);
    else if (act === 'change-pw') el.onclick = changePassword;
    else if (act === 'cal-prev') el.onclick = () => { const b = state.calMonth; state.calMonth = new Date(b.getFullYear(), b.getMonth() - 1, 1); renderView(); };
    else if (act === 'cal-next') el.onclick = () => { const b = state.calMonth; state.calMonth = new Date(b.getFullYear(), b.getMonth() + 1, 1); renderView(); };
    else if (act === 'cal-today') el.onclick = () => { const n = new Date(); state.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); renderView(); };
  });
}

async function patchTask(id, body) {
  try { await api('/api/tasks/' + id, 'PATCH', body); await refreshData(); renderView(); toast('Saved'); }
  catch (e) { toast(e.message); }
}

async function changePassword() {
  $('#pwerr').textContent = '';
  try {
    await api('/api/me/password', 'POST', { current: $('#cur').value, next: $('#nw').value });
    $('#cur').value = ''; $('#nw').value = '';
    toast('Password updated');
  } catch (e) { $('#pwerr').textContent = e.message; }
}

async function resetPassword(uid) {
  try {
    const d = await api('/api/users/' + uid + '/password', 'POST');
    await refreshData();
    showModal(`<h3>Access generated</h3>
      <p style="font-size:13.5px;color:var(--ink-soft)">Share these securely. They will not be shown again.</p>
      <div class="cred">Username: <code>${esc(d.credentials.username)}</code><br>Password: <code>${esc(d.credentials.password)}</code></div>
      <div class="row"><button class="btn primary" data-close>Done</button></div>`);
  } catch (e) { toast(e.message); }
}

/* ---------- modals ---------- */
function showModal(inner) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${inner}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.hasAttribute('data-close')) { back.remove(); renderView(); } });
  document.body.appendChild(back);
  return back;
}

function deptOptions(sel) { return state.ref.DEPARTMENTS.map((d) => `<option ${d === sel ? 'selected' : ''}>${d}</option>`).join(''); }
function prioOptions(sel) { return state.ref.PRIORITIES.map((p) => `<option ${p === sel ? 'selected' : ''}>${p}</option>`).join(''); }
function statusOptions(sel) { return state.ref.STATUSES.map((s) => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join(''); }
function levelOptions(sel) { return state.ref.ACCESS_LEVELS.map((l) => `<option ${l === sel ? 'selected' : ''}>${l}</option>`).join(''); }

function openUserModal(uid) {
  const u = uid ? state.users.find((x) => x.id === uid) : null;
  const back = showModal(`
    <h3>${u ? 'Edit user' : 'Add user'}</h3>
    <div class="field"><label>Full name</label><input id="m-name" type="text" value="${u ? esc(u.name) : ''}"></div>
    <div class="field"><label>Role / title</label><input id="m-role" type="text" value="${u ? esc(u.role || '') : ''}"></div>
    <div class="grid cols-2">
      <div class="field"><label>Department</label><select id="m-dept">${deptOptions(u ? u.department : 'Executive')}</select></div>
      <div class="field"><label>Access level</label><select id="m-level">${levelOptions(u ? u.accessLevel : 'member')}</select></div>
    </div>
    ${u ? `<div class="field"><label>Status</label><select id="m-active"><option value="true" ${u.active ? 'selected' : ''}>Active</option><option value="false" ${!u.active ? 'selected' : ''}>Disabled</option></select></div>` : ''}
    <div class="error" id="m-err"></div>
    <div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-save">${u ? 'Save' : 'Create user'}</button></div>`);
  $('#m-save', back).onclick = async () => {
    const body = { name: $('#m-name', back).value, role: $('#m-role', back).value, department: $('#m-dept', back).value, accessLevel: $('#m-level', back).value };
    try {
      if (u) {
        body.active = $('#m-active', back).value === 'true';
        await api('/api/users/' + u.id, 'PATCH', body);
        await refreshData(); back.remove(); renderView(); toast('User updated');
      } else {
        const d = await api('/api/users', 'POST', body);
        await refreshData();
        back.querySelector('.modal').innerHTML = `<h3>User created</h3>
          <p style="font-size:13.5px;color:var(--ink-soft)">Share these securely. They will not be shown again.</p>
          <div class="cred">Username: <code>${esc(d.credentials.username)}</code><br>Password: <code>${esc(d.credentials.password)}</code></div>
          <div class="row"><button class="btn primary" data-close>Done</button></div>`;
      }
    } catch (e) { ($('#m-err', back) || {}).textContent = e.message; toast(e.message); }
  };
}

function openTaskModal(tid, opts) {
  opts = opts || {};
  const t = tid ? state.tasks.find((x) => x.id === tid) : null;
  const me = state.me;
  const priv = me.accessLevel === 'admin' || me.accessLevel === 'director';
  const creator = t && t.createdBy === me.id;
  const mayReassign = priv || creator || (!t && priv); // owners picker visible to privileged, or creator on edit

  // Parent handling
  const presetParent = !t && opts.parentId ? opts.parentId : null;
  const parentTask = presetParent ? state.tasks.find((x) => x.id === presetParent) : null;
  const mainCandidates = state.tasks.filter((x) => !x.parentId && rightsFor(x).edit);

  // Owners picker (privileged on create; privileged or creator on edit)
  const showOwners = t ? mayReassign : priv;
  const ownerChecks = state.users.filter((u) => u.active).map((u) =>
    `<label style="font-weight:500;display:flex;gap:8px;align-items:center;margin-bottom:4px">
      <input type="checkbox" value="${u.id}" ${t && t.owners.includes(u.id) ? 'checked' : ''} class="own-chk"> ${esc(u.name)} <span style="color:var(--muted)">(${esc(u.department)})</span></label>`).join('');

  const msList = t ? t.milestones.map((m) =>
    `<li class="${m.done ? 'done' : ''}" style="justify-content:space-between"><span><input type="checkbox" disabled ${m.done ? 'checked' : ''}> ${esc(m.title)}</span>
       <button class="btn danger sm" data-rmms="${m.id}">Remove</button></li>`).join('') : '';

  // Due date as datetime-local; normalise a date-only value so the picker accepts it.
  let dueVal = t && t.dueDate ? t.dueDate : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueVal)) dueVal += 'T00:00';

  let parentField = '';
  if (!t) {
    if (parentTask) {
      parentField = `<div class="field"><label>Sub-task of</label>
        <input type="text" value="${esc(parentTask.title)}" disabled>
        <input type="hidden" id="t-parent" value="${esc(parentTask.id)}"></div>`;
    } else {
      parentField = `<div class="field"><label>Parent task (optional &mdash; leave as none for a main task)</label>
        <select id="t-parent"><option value="">None (main task)</option>
          ${mainCandidates.map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select></div>`;
    }
  } else if (t.parentId) {
    const par = state.tasks.find((x) => x.id === t.parentId);
    parentField = `<div class="field"><label>Sub-task of</label><input type="text" value="${par ? esc(par.title) : 'Parent'}" disabled></div>`;
  }

  const back = showModal(`
    <h3>${t ? 'Edit task' : (parentTask ? 'New sub-task' : 'New task')}</h3>
    <div class="field"><label>Title</label><input id="t-title" type="text" value="${t ? esc(t.title) : ''}"></div>
    <div class="field"><label>Description</label><textarea id="t-desc" placeholder="Scope, acceptance criteria, context...">${t ? esc(t.description) : ''}</textarea></div>
    ${parentField}
    <div class="grid cols-3">
      <div class="field"><label>Department</label><select id="t-dept">${deptOptions(t ? t.department : (me.department || 'Executive'))}</select></div>
      <div class="field"><label>Priority</label><select id="t-prio">${prioOptions(t ? t.priority : 'P1')}</select></div>
      <div class="field"><label>Status</label><select id="t-status">${statusOptions(t ? t.status : 'Not Started')}</select></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>Start date</label><input id="t-start" type="date" value="${t ? esc(t.startDate || '') : ''}"></div>
      <div class="field"><label>Due date &amp; time</label><input id="t-due" type="datetime-local" value="${esc(dueVal)}"></div>
    </div>
    ${showOwners
      ? `<div class="field"><label>Owners</label><div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px">${ownerChecks}</div></div>`
      : (t ? '' : `<div class="field" style="font-size:13px;color:var(--ink-soft)">You will be set as the owner of this task.</div>`)}
    ${t ? `<div class="field"><label>Milestones</label><ul class="milestones">${msList || '<li style="color:var(--muted)">None yet</li>'}</ul>
      <div class="update-row"><input id="t-newms" type="text" placeholder="Add a milestone..."><button class="btn dark sm" id="t-addms">Add</button></div></div>` : ''}
    <div class="error" id="t-err"></div>
    <div class="row">
      ${t && (me.accessLevel === 'admin' || creator) ? `<button class="btn danger" id="t-del" style="margin-right:auto">Delete</button>` : ''}
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="t-save">${t ? 'Save' : 'Create task'}</button>
    </div>`);

  const gather = () => {
    const body = {
      title: $('#t-title', back).value,
      description: $('#t-desc', back).value,
      department: $('#t-dept', back).value,
      priority: $('#t-prio', back).value,
      status: $('#t-status', back).value,
      startDate: $('#t-start', back).value,
      dueDate: $('#t-due', back).value,
    };
    if (showOwners) body.owners = Array.from(back.querySelectorAll('.own-chk:checked')).map((c) => c.value);
    if (!t) {
      const pSel = $('#t-parent', back);
      if (pSel && pSel.value) body.parentId = pSel.value;
    }
    return body;
  };

  $('#t-save', back).onclick = async () => {
    try {
      if (t) await api('/api/tasks/' + t.id, 'PATCH', gather());
      else await api('/api/tasks', 'POST', gather());
      await refreshData(); back.remove(); renderView(); toast('Saved');
    } catch (e) { $('#t-err', back).textContent = e.message; }
  };
  if (t) {
    $('#t-addms', back).onclick = async () => {
      const val = $('#t-newms', back).value.trim();
      if (!val) return;
      try { await api('/api/tasks/' + t.id, 'PATCH', { addMilestone: val }); await refreshData(); back.remove(); openTaskModal(t.id); } catch (e) { toast(e.message); }
    };
    back.querySelectorAll('[data-rmms]').forEach((b) => (b.onclick = async () => {
      try { await api('/api/tasks/' + t.id, 'PATCH', { removeMilestone: b.dataset.rmms }); await refreshData(); back.remove(); openTaskModal(t.id); } catch (e) { toast(e.message); }
    }));
    const del = $('#t-del', back);
    if (del) del.onclick = async () => {
      if (!confirm('Delete this task? Any sub-tasks under it are removed too. This cannot be undone.')) return;
      try { await api('/api/tasks/' + t.id, 'DELETE'); await refreshData(); back.remove(); renderView(); toast('Task deleted'); } catch (e) { toast(e.message); }
    };
  }
}

init();
