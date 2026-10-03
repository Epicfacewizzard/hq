import { marked } from 'https://cdn.jsdelivr.net/npm/marked@14.1.4/lib/marked.esm.js';
import { DemoStore, GitHubStore, githubConfig, saveGithubConfig } from './store.js';
import { icon } from './icons.js';
import * as V from './vault.js';

const cfg = githubConfig();
let store = cfg ? new GitHubStore(cfg) : new DemoStore();
const view = document.getElementById('view');

const state = { files: {}, people: [], tasks: [], days: [], peopleFilter: { circle: '', closeness: '', q: '' } };

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const enc = (p) => encodeURIComponent(p);
const noteName = (p) => p.split('/').pop().replace(/\.md$/, '');

const findNote = (name) => {
  const n = name.split('|')[0].split('#')[0].trim().toLowerCase();
  return Object.keys(state.files).find((p) => noteName(p).toLowerCase() === n);
};

// inline text: escape, then @mentions and [[links]] become links
const inline = (text) =>
  esc(text)
    .replace(/@([\p{L}][\p{L}\-_.]*)/gu, (all, tag) => {
      const p = V.findMentions('@' + tag, state.people)[0];
      return p ? `<a class="mention" href="#/p/${enc(p.path)}">@${esc(tag)}</a>` : all;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (all, name) => {
      const p = findNote(name);
      const label = esc(name.split('|').pop());
      return p ? `<a class="wikilink" href="#/n/${enc(p)}">${label}</a>` : `<span class="wikilink missing">${label}</span>`;
    })
    .replace(/📅\s*(\d{4}-\d{2}-\d{2})/g, (all, d) => `<span class="due">${V.prettyDate(d)}</span>`)
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '');

const md = (body) => {
  const pre = body
    .replace(/^> \[!(\w+)\]\s?/gm, '> ')
    .replace(/\[\[([^\]]+)\]\]/g, (all, name) => {
      const p = findNote(name);
      const label = name.split('|').pop();
      return p ? `[${label}](#/n/${enc(p)})` : label;
    });
  return marked.parse(pre);
};

const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
};

const CIRCLE_CLASS = {
  CSS: 'c-red',
  Nursing: 'c-blue',
  Friends: 'c-green',
  Family: 'c-pink',
  Work: 'c-amber',
  'Other clubs': 'c-orange',
  Other: 'c-gray',
};
const chip = (c) => `<span class="chip ${CIRCLE_CLASS[c] || 'c-gray'}">${esc(c)}</span>`;
const dot = (closeness) => (closeness ? `<span class="dot dot-${closeness.toLowerCase()}"></span>` : '');

const avatar = (p, size = 40) => {
  const initials = p.name
    .split(' ')
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  let hash = 0;
  for (const ch of p.name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar" style="--s:${size}px;--h:${hash}">${esc(initials)}</span>`;
};

// ---------- load + index ----------

// fetch everything from the store, then build the lists
async function load() {
  state.files = await store.all();
  index();
}

function index() {
  const paths = Object.keys(state.files);

  state.people = paths
    .filter(V.isPersonPath)
    .map((p) => V.parsePerson(p, state.files[p]))
    .sort((a, b) => a.name.localeCompare(b.name));

  // task sources: Tasks.md, daily notes, and dated tasks anywhere
  state.tasks = paths.flatMap((p) => {
    const all = V.parseTasks(p, state.files[p]);
    if (p === 'Tasks.md' || p.startsWith('01 Daily/')) return all;
    return all.filter((t) => t.due);
  });

  state.days = paths
    .filter((p) => /^01 Daily\/\d{4}-\d{2}-\d{2}\.md$/.test(p))
    .map((p) => ({ date: p.slice(9, 19), path: p, jots: V.parseJots(state.files[p]) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// change one note: fn gets the current text and returns the new text (or null to skip)
async function change(path, fn, msg) {
  const next = await store.update(path, fn, msg);
  if (next !== null && next !== undefined) state.files[path] = next;
  return next;
}

// run a save, say what went wrong if it fails, then redraw
async function saving(work, done) {
  document.body.classList.add('busy');
  try {
    await work();
    index();
    if (done) toast(done);
  } catch (e) {
    console.error(e);
    toast(e.status === 401 ? 'GitHub key expired. Reconnect in Settings.' : 'Could not save. Check your connection.');
  } finally {
    document.body.classList.remove('busy');
    render();
  }
}

// ---------- capture ----------

async function capture(raw) {
  let text = raw.trim();
  if (!text) return;
  const today = V.iso();
  const time = new Date().toTimeString().slice(0, 5);
  const isTask = /^\[\s?\]/.test(text);
  text = text.replace(/^\[\s?\]\s*/, '');

  // a to-do with no date is a to-do for today
  const line = isTask ? V.taskLine(`${time} ${text}`, V.guessDue(text) || today) : `- ${time} ${text}`;
  const path = V.dailyPath(today);
  const mentions = isTask ? [] : V.findMentions(text, state.people);

  await saving(async () => {
    await change(path, (t) => V.appendToSection(t || V.newDaily(today), 'Jots', line, { top: true }), `Jot ${today}`);
    // @mentions on a normal jot = a chat with that person
    for (const p of mentions) {
      await change(
        p.path,
        (t) => t && V.setFrontmatter(V.appendToSection(t, 'Log', `- ${today}: ${text}`), { last_talked: today }),
        `Log ${p.name}`,
      );
    }
  }, isTask ? 'To-do added' : 'Jotted');
}

async function toggleTask(path, line) {
  const task = state.tasks.find((t) => t.path === path && t.line === line);
  if (!task) return;
  await saving(() => change(path, (t) => t && V.toggleTaskLine(t, task), task.done ? 'Reopen to-do' : 'Done: ' + task.text));
}

// ---------- views ----------

const captureBox = (placeholder) => `
  <form class="capture" data-action="capture">
    <textarea name="text" rows="2" placeholder="${esc(placeholder)}"></textarea>
    <div class="capture-bar">
      <span class="hint"><code>[]</code> task · <code>@name</code> person · <code>tmr</code>/<code>fri</code> due date</span>
      <button class="btn primary" type="submit">${icon('plus', 14)} Jot</button>
    </div>
  </form>`;

const jotList = (jots) =>
  jots.length
    ? `<ul class="jots">${jots
        .map(
          (j) => `<li class="${j.task ? 'is-task' : ''} ${j.done ? 'is-done' : ''}">
            <span class="time">${esc(j.time)}</span>
            ${j.task ? `<span class="box">${j.done ? icon('check', 12) : ''}</span>` : ''}
            <span class="text">${inline(j.text)}</span></li>`,
        )
        .join('')}</ul>`
    : '';

const taskRow = (t, { showDue = true } = {}) => {
  const late = t.due && t.due < V.iso() && !t.done;
  return `<li class="task ${t.done ? 'is-done' : ''}">
    <button class="check" data-action="toggle" data-path="${esc(t.path)}" data-line="${t.line}" aria-label="Done">
      ${t.done ? icon('check', 12) : ''}</button>
    <div class="task-body">
      <span>${inline(t.text.replace(/^\d{1,2}:\d{2}\s/, ''))}</span>
      <span class="meta">
        ${showDue && t.due ? `<span class="${late ? 'late' : ''}">${late ? (V.daysBetween(t.due, V.iso()) === 1 ? 'From yesterday' : 'Overdue · ' + V.prettyDate(t.due)) : V.prettyDate(t.due)}</span>` : ''}
        ${t.path === 'Tasks.md' ? '' : t.path.startsWith('01 Daily/') ? `<a href="#/n/${enc(t.path)}">Jots · ${V.prettyDate(noteName(t.path))}</a>` : `<a href="#/n/${enc(t.path)}">${esc(noteName(t.path))}</a>`}
      </span>
    </div></li>`;
};

function viewToday() {
  const today = V.iso();
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const day = state.days.find((d) => d.date === today);
  const earlier = state.days.filter((d) => d.date < today && d.jots.length).slice(0, 7);

  const open = state.tasks.filter((t) => !t.done);
  const due = open.filter((t) => t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  const soon = open.filter((t) => t.due && t.due > today && V.daysBetween(today, t.due) <= 3);
  // ticked off today stay visible (crossed out) so the list feels like progress
  const doneToday = state.tasks.filter((t) => t.done && t.raw.includes(`✅ ${today}`));
  const followUps = state.people.filter((p) => p.follow_up && p.follow_up <= V.iso(new Date(Date.now() + 2 * 86400000)));
  const birthdays = state.people
    .map((p) => ({ p, n: V.nextBirthday(p.birthday) }))
    .filter((x) => x.n !== null && x.n <= 14)
    .sort((a, b) => a.n - b.n);
  const catchUp = state.people
    .filter((p) => p.closeness === 'Close' && (!p.last_talked || V.daysBetween(p.last_talked, today) > 14))
    .slice(0, 4);

  return `
  ${store.demo ? `<a class="demo-banner" href="#/settings">You're looking at demo data. <b>Connect your vault →</b></a>` : ''}
  <header class="page-head">
    <p class="eyebrow">${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <h1>${hello}, Gordon</h1>
  </header>

  ${captureBox("Jot a thought… or [] a to-do")}

  <div class="today-grid">
    <section class="col-main">
      <h2 class="section-title">Today</h2>
      ${day && day.jots.length ? `<div class="card">${jotList(day.jots)}</div>` : `<p class="empty">Nothing jotted yet today.</p>`}

      ${
        earlier.length
          ? `<h2 class="section-title earlier">Earlier</h2>
        ${earlier
          .map(
            (d) => `<div class="card day earlier">
              <a class="day-head" href="#/n/${enc(d.path)}">
                <span>${V.parseIso(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                <span class="muted">${V.ago(d.date)}</span></a>
              ${jotList(d.jots)}</div>`,
          )
          .join('')}`
          : ''
      }
    </section>

    <aside class="col-side">
      <div class="card todo">
        <div class="card-head">${icon('check-square', 15)} To-do today <span class="count">${due.length}</span>
          <a class="more" href="#/tasks">All</a></div>
        ${due.length || doneToday.length ? `<ul class="tasks">${due.map((t) => taskRow(t, { showDue: t.due < today })).join('')}${doneToday.map((t) => taskRow(t, { showDue: false })).join('')}</ul>` : `<p class="empty sm">Nothing for today. Add one with <code>[]</code>.</p>`}
        ${soon.length ? `<div class="card-sub">Coming up</div><ul class="tasks">${soon.map((t) => taskRow(t)).join('')}</ul>` : ''}
      </div>

      <div class="card">
        <div class="card-head">${icon('calendar', 15)} Calendar</div>
        <p class="empty sm">Google Calendar connects in a later step.</p>
      </div>

      ${
        followUps.length || catchUp.length
          ? `<div class="card">
        <div class="card-head">${icon('message', 15)} Reach out</div>
        <ul class="people-mini">
          ${followUps
            .map(
              (p) => `<li><a href="#/p/${enc(p.path)}">${avatar(p, 28)}<span class="grow">${esc(p.name)}</span>
              <span class="${p.follow_up < today ? 'late' : 'muted'}">Follow up ${V.prettyDate(p.follow_up)}</span></a></li>`,
            )
            .join('')}
          ${catchUp
            .filter((p) => !followUps.includes(p))
            .map(
              (p) => `<li><a href="#/p/${enc(p.path)}">${avatar(p, 28)}<span class="grow">${esc(p.name)}</span>
              <span class="muted">${p.last_talked ? 'Last ' + V.ago(p.last_talked) : 'Never logged'}</span></a></li>`,
            )
            .join('')}
        </ul></div>`
          : ''
      }

      ${
        birthdays.length
          ? `<div class="card">
        <div class="card-head">${icon('cake', 15)} Birthdays</div>
        <ul class="people-mini">${birthdays
          .map(
            ({ p, n }) => `<li><a href="#/p/${enc(p.path)}">${avatar(p, 28)}<span class="grow">${esc(p.name)}</span>
            <span class="${n <= 1 ? 'accent' : 'muted'}">${n === 0 ? 'Today 🎉' : n === 1 ? 'Tomorrow' : 'in ' + n + ' days'}</span></a></li>`,
          )
          .join('')}</ul></div>`
          : ''
      }
    </aside>
  </div>`;
}

function viewTasks() {
  const today = V.iso();
  const open = state.tasks.filter((t) => !t.done);
  const groups = [
    ['Overdue', open.filter((t) => t.due && t.due < today)],
    ['Today', open.filter((t) => t.due === today)],
    ['Upcoming', open.filter((t) => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due))],
    ['No date', open.filter((t) => !t.due)],
    ['Done recently', state.tasks.filter((t) => t.done).slice(-5)],
  ];
  return `
  <header class="page-head"><h1>Tasks</h1><p class="muted">${open.length} open</p></header>
  ${captureBox('[] Add a task… (try “[] call mom fri”)')}
  ${groups
    .filter(([, list]) => list.length)
    .map(
      ([name, list]) => `<h2 class="section-title ${name === 'Overdue' ? 'late' : ''}">${name} <span class="count">${list.length}</span></h2>
      <div class="card"><ul class="tasks">${list.map((t) => taskRow(t, { showDue: name !== 'Today' })).join('')}</ul></div>`,
    )
    .join('')}`;
}

function viewPeople() {
  const f = state.peopleFilter;
  const q = f.q.toLowerCase();
  const list = state.people.filter(
    (p) =>
      (!f.circle || p.circles.includes(f.circle)) &&
      (!f.closeness || p.closeness === f.closeness) &&
      (!q ||
        [p.name, p.role, p.memory_cues, p.likes, p.major, p.where_we_met, p.instagram, ...p.aliases]
          .join(' ')
          .toLowerCase()
          .includes(q)),
  );
  const circles = V.CIRCLES.map((c) => [c, state.people.filter((p) => p.circles.includes(c)).length]).filter(
    ([, n]) => n,
  );

  return `
  <header class="page-head"><h1>People</h1><p class="muted">${state.people.length} people</p></header>
  <div class="search">${icon('search', 15)}<input data-action="people-q" type="search" value="${esc(f.q)}" placeholder="Search names, memory cues, likes, major…"></div>
  <div class="filters">
    <button class="pill ${!f.circle ? 'on' : ''}" data-action="circle" data-v="">Everyone</button>
    ${circles.map(([c, n]) => `<button class="pill ${f.circle === c ? 'on' : ''}" data-action="circle" data-v="${esc(c)}">${esc(c)} <span>${n}</span></button>`).join('')}
    <span class="sep"></span>
    ${V.CLOSENESS.map((c) => `<button class="pill ${f.closeness === c ? 'on' : ''}" data-action="closeness" data-v="${c}">${dot(c)} ${c}</button>`).join('')}
  </div>
  ${
    list.length
      ? `<div class="people-grid">${list
          .map(
            (p) => `<a class="person-card" href="#/p/${enc(p.path)}">
          <div class="pc-top">${avatar(p, 44)}${p.closeness ? `<span class="dot-badge dot-${p.closeness.toLowerCase()}"></span>` : ''}
            <div class="grow min0"><div class="pc-name">${esc(p.name)}</div><div class="pc-sub">${esc(p.role || p.major || '')}</div></div>
            ${p.follow_up && p.follow_up <= V.iso() ? '<span class="tag-late">Follow up</span>' : ''}
          </div>
          ${p.memory_cues ? `<p class="pc-cue">${icon('bulb', 13)} ${esc(p.memory_cues)}</p>` : ''}
          <div class="pc-foot"><div class="chips">${p.circles.map(chip).join('')}</div>
            <span class="muted xs">${p.last_talked ? V.ago(p.last_talked) : ''}</span></div>
        </a>`,
          )
          .join('')}</div>`
      : `<p class="empty">Nobody matches.</p>`
  }`;
}

function viewPerson(path) {
  const p = state.people.find((x) => x.path === path);
  if (!p) return `<p class="empty">Person not found.</p>`;
  const today = V.iso();
  const restBody = p.body
    .replace(/^## Log[\s\S]*?(?=^## |^Up:|(?![\s\S]))/m, '')
    .replace(/^# .*$/m, '')
    .replace(/^Up:.*$/m, '');

  return `
  <a class="back" href="#/people">${icon('chevron-left', 14)} People</a>
  <header class="person-head">
    ${avatar(p, 64)}
    <div class="min0">
      <h1>${esc(p.name)}</h1>
      <div class="chips">${p.closeness ? `<span class="chip c-${p.closeness.toLowerCase()}">${esc(p.closeness)}</span>` : ''}${p.circles.map(chip).join('')}
        ${p.role ? `<span class="muted sm">${esc(p.role)}</span>` : ''}</div>
    </div>
    <button class="btn" data-action="edit-person" data-path="${esc(p.path)}">${icon('pencil', 13)} Edit</button>
  </header>

  <div class="card stats">
    <div><span class="lbl">${icon('message', 13)} Last talked</span><b>${p.last_talked ? V.ago(p.last_talked) : '—'}</b>
      <span class="muted xs">${p.last_talked ? V.prettyDate(p.last_talked, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span></div>
    <div><span class="lbl">${icon('bell', 13)} Follow up</span>
      <b class="${p.follow_up && p.follow_up <= today ? 'late' : ''}">${p.follow_up ? V.prettyDate(p.follow_up) : '—'}</b></div>
    <div><span class="lbl">${icon('cake', 13)} Birthday</span><b>${p.birthday ? V.prettyDate(p.birthday) : '—'}</b>
      <span class="muted xs">${p.birthday ? (V.nextBirthday(p.birthday) === 0 ? 'Today!' : 'in ' + V.nextBirthday(p.birthday) + ' days') : ''}</span></div>
    <div class="min0"><span class="lbl">${icon('at', 13)} Instagram</span>
      ${p.instagram ? `<a class="accent" target="_blank" rel="noopener" href="https://instagram.com/${enc(p.instagram)}">@${esc(p.instagram)}</a>` : '<b>—</b>'}</div>
  </div>

  ${p.memory_cues ? `<div class="cue">${icon('bulb', 15)}<div><span class="lbl">Memory cues</span><p>${esc(p.memory_cues)}</p></div></div>` : ''}

  ${
    p.likes || p.dislikes || p.major || p.where_we_met
      ? `<div class="card facts">
    ${p.likes ? `<div><span class="lbl">♥ Likes</span><p>${esc(p.likes)}</p></div>` : ''}
    ${p.dislikes ? `<div><span class="lbl">Dislikes</span><p>${esc(p.dislikes)}</p></div>` : ''}
    ${p.major || p.grad_year ? `<div><span class="lbl">Major</span><p>${esc(p.major)}${p.grad_year ? ` · class of ${esc(p.grad_year)}` : ''}</p></div>` : ''}
    ${p.where_we_met || p.met_on ? `<div><span class="lbl">Met</span><p>${esc(p.where_we_met)}${p.met_on ? ` · ${V.prettyDate(p.met_on, { month: 'short', year: 'numeric' })}` : ''}</p></div>` : ''}
  </div>`
      : ''
  }

  <form class="capture" data-action="log" data-path="${esc(p.path)}">
    <textarea name="text" rows="2" placeholder="Log a chat with ${esc(p.first)}… what did you talk about?"></textarea>
    <div class="capture-bar"><span class="hint">Saves to their Log and updates Last talked</span>
      <button class="btn primary" type="submit">Log it</button></div>
  </form>

  ${
    p.log.length
      ? `<h2 class="section-title">Log</h2><div class="card"><ul class="log">${p.log
          .map((l) => `<li><span class="muted xs">${l.date ? V.prettyDate(l.date, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span><span>${inline(l.text)}</span></li>`)
          .join('')}</ul></div>`
      : ''
  }

  ${restBody.trim() ? `<h2 class="section-title">Notes</h2><div class="card prose">${md(restBody)}</div>` : ''}
  <p class="file-path">${icon('file', 12)} ${esc(p.path)}</p>`;
}

function editPersonForm(p) {
  const field = (k, label, type = 'text', extra = '') =>
    `<label><span class="lbl">${label}</span><input name="${k}" type="${type}" value="${esc(p[k])}" ${extra}></label>`;
  return `
  <a class="back" href="#/p/${enc(p.path)}">${icon('chevron-left', 14)} ${esc(p.name)}</a>
  <header class="page-head"><h1>Edit ${esc(p.first)}</h1></header>
  <form class="card form" data-action="save-person" data-path="${esc(p.path)}">
    <div><span class="lbl">Circle</span><div class="chips pick">
      ${V.CIRCLES.map((c) => `<label class="pick-chip"><input type="checkbox" name="circle" value="${esc(c)}" ${p.circles.includes(c) ? 'checked' : ''}>${chip(c)}</label>`).join('')}
    </div></div>
    <div><span class="lbl">Closeness</span><div class="seg">
      ${['', ...V.CLOSENESS].map((c) => `<label><input type="radio" name="closeness" value="${c}" ${p.closeness === c ? 'checked' : ''}><span>${c || 'None'}</span></label>`).join('')}
    </div></div>
    <div class="row2">${field('role', 'Role / relation')}${field('instagram', 'Instagram')}</div>
    <label><span class="lbl">Memory cues</span><textarea name="memory_cues" rows="2">${esc(p.memory_cues)}</textarea></label>
    <div class="row2">
      <label><span class="lbl">Likes</span><textarea name="likes" rows="2">${esc(p.likes)}</textarea></label>
      <label><span class="lbl">Dislikes</span><textarea name="dislikes" rows="2">${esc(p.dislikes)}</textarea></label>
    </div>
    <div class="row3">${field('major', 'Major')}${field('grad_year', 'Grad year', 'number')}${field('birthday', 'Birthday', 'date')}</div>
    <div class="row3">${field('where_we_met', 'Where we met')}${field('met_on', 'Met on', 'date')}${field('follow_up', 'Follow up', 'date')}</div>
    <div class="form-foot"><a class="btn ghost" href="#/p/${enc(p.path)}">Cancel</a><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

function viewNotes(path) {
  const paths = Object.keys(state.files).sort();
  const folders = {};
  for (const p of paths) {
    const top = p.includes('/') ? p.split('/')[0] : '·';
    (folders[top] ||= []).push(p);
  }
  const tree = Object.entries(folders)
    .map(
      ([f, list]) => `<details ${path && path.startsWith(f) ? 'open' : ''}><summary>${icon('folder', 14)} ${f === '·' ? 'Vault' : esc(f)} <span class="count">${list.length}</span></summary>
      <ul>${list.map((p) => `<li><a class="${p === path ? 'on' : ''}" href="#/n/${enc(p)}">${esc(noteName(p))}</a></li>`).join('')}</ul></details>`,
    )
    .join('');

  let content = `<p class="empty">Pick a note.</p>`;
  if (path && state.files[path] !== undefined) {
    const { data, body } = V.parseFrontmatter(state.files[path]);
    content = `<div class="note-meta">${Object.entries(data)
      .filter(([k]) => ['type', 'status', 'updated', 'domain'].includes(k))
      .map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`)
      .join('')}</div><article class="prose">${md(body)}</article>
      <p class="file-path">${icon('file', 12)} ${esc(path)}</p>`;
  }
  return `<header class="page-head"><h1>Notes</h1></header>
    <div class="notes-layout"><nav class="tree card">${tree}</nav><div class="card note">${content}</div></div>`;
}

// ---------- router ----------

function render() {
  const hash = decodeURIComponent(location.hash.slice(1) || '/today');
  const [, route, ...rest] = hash.split('/');
  const arg = rest.join('/');
  let html;
  if (route === 'tasks') html = viewTasks();
  else if (route === 'people') html = viewPeople();
  else if (route === 'p') html = viewPerson(arg);
  else if (route === 'edit') html = editPersonForm(state.people.find((p) => p.path === arg));
  else if (route === 'notes') html = viewNotes();
  else if (route === 'n') html = viewNotes(arg);
  else if (route === 'settings') html = viewSettings();
  else html = viewToday();

  view.innerHTML = html;
  const active = route === 'p' || route === 'edit' ? 'people' : route === 'n' ? 'notes' : route || 'today';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === active));
}

// ---------- events ----------

document.addEventListener('submit', async (e) => {
  const form = e.target;
  const action = form.dataset.action;
  if (!action) return;
  e.preventDefault();

  if (action === 'connect') {
    await connect(form);
  } else if (action === 'capture') {
    await capture(form.text.value);
  } else if (action === 'log') {
    const text = form.text.value.trim();
    if (!text) return;
    const today = V.iso();
    const path = form.dataset.path;
    await saving(
      () => change(path, (t) => t && V.setFrontmatter(V.appendToSection(t, 'Log', `- ${today}: ${text}`), { last_talked: today }), 'Log'),
      'Logged',
    );
  } else if (action === 'save-person') {
    const fd = new FormData(form);
    const changes = { circle: fd.getAll('circle'), closeness: fd.get('closeness') };
    for (const k of ['role', 'instagram', 'memory_cues', 'likes', 'dislikes', 'major', 'grad_year', 'birthday', 'where_we_met', 'met_on', 'follow_up']) {
      changes[k] = (fd.get(k) || '').replace(/\n+/g, ' ').trim();
    }
    const path = form.dataset.path;
    await saving(() => change(path, (t) => t && V.setFrontmatter(t, changes), 'Edit person'), 'Saved');
    location.hash = `#/p/${enc(path)}`;
  }
});

// Enter saves a jot, Shift+Enter is a new line
document.addEventListener('keydown', (e) => {
  if (e.target.matches('form.capture textarea') && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
  if (e.key === '/' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.querySelector('form.capture textarea, .search input')?.focus();
  }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const a = el.dataset.action;
  if (a === 'toggle') toggleTask(el.dataset.path, Number(el.dataset.line));
  if (a === 'circle') {
    state.peopleFilter.circle = state.peopleFilter.circle === el.dataset.v ? '' : el.dataset.v;
    render();
  }
  if (a === 'closeness') {
    state.peopleFilter.closeness = state.peopleFilter.closeness === el.dataset.v ? '' : el.dataset.v;
    render();
  }
  if (a === 'edit-person') location.hash = `#/edit/${enc(el.dataset.path)}`;
  if (a === 'reset-demo' && store.demo) {
    store.reset();
    load().then(render);
    toast('Demo data reset');
  }
  if (a === 'disconnect') {
    saveGithubConfig(null);
    location.hash = '#/today';
    location.reload();
  }
  if (a === 'refresh') refresh(true);
  if (a === 'theme') {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('hq-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.action === 'people-q') {
    state.peopleFilter.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.querySelector('[data-action="people-q"]');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// ---------- settings / connect ----------

function viewSettings() {
  const c = githubConfig();
  return `
  <header class="page-head"><h1>Settings</h1></header>
  <div class="card form">
    <div>
      <h2 class="form-title">Connect your vault</h2>
      <p class="muted sm">HQ reads and writes your notes in your private GitHub repo. The key stays on this device only.</p>
    </div>
    ${
      c
        ? `<p class="sm">Connected to <b>${esc(c.repo)}</b>.</p>
           <div class="form-foot"><button class="btn" data-action="refresh">Reload notes</button>
           <button class="btn" data-action="disconnect">Disconnect this device</button></div>`
        : `<form data-action="connect" class="form-inner">
        <label><span class="lbl">Repo</span><input type="text" name="repo" value="Epicfacewizzard/vault" autocomplete="off"></label>
        <label><span class="lbl">GitHub key (fine-grained token)</span>
          <input type="password" name="token" autocomplete="off" placeholder="github_pat_…"></label>
        <p class="muted xs">Make one at GitHub → Settings → Developer settings → Fine-grained tokens. Repository access: only <b>vault</b>. Permissions: Contents → Read and write.</p>
        <div class="form-foot"><button class="btn primary" type="submit">Connect</button></div>
      </form>`
    }
  </div>`;
}

async function connect(form) {
  const cfg = { repo: form.repo.value.trim(), token: form.token.value.trim() };
  if (!cfg.repo.includes('/') || !cfg.token) return toast('Fill in both boxes');
  const test = new GitHubStore(cfg);
  document.body.classList.add('busy');
  try {
    await test.all();
    saveGithubConfig(cfg);
    store = test;
    await load();
    showStore();
    toast('Connected');
    location.hash = '#/today';
  } catch (e) {
    console.error(e);
    connectError(form, e);
  } finally {
    document.body.classList.remove('busy');
  }
}

// Say why connecting failed in plain words, and keep GitHub's own message underneath.
function connectError(form, e) {
  const m = String(e.message || e);
  let why = 'Could not connect.';
  if (e.status === 401 || /bad credentials/i.test(m)) why = "GitHub didn't accept that key. Copy it again (it starts with github_pat_).";
  else if (/could not resolve|not found|empty/i.test(m))
    why = "The key can't see the vault repo. On the key: Repository access → Only select repositories → vault.";
  else if (e.status === 403 || /not accessible|forbidden|permission/i.test(m))
    why = 'The key is missing a permission. On the key: Repository permissions → Contents → Read and write.';
  else if (e instanceof TypeError) why = "Couldn't reach GitHub. Check your internet and try again.";
  let box = form.querySelector('.connect-error');
  if (!box) {
    box = document.createElement('p');
    box.className = 'connect-error';
    form.querySelector('.form-foot').before(box);
  }
  box.innerHTML = `${esc(why)}<br><span class="xs">GitHub said: ${esc(m)}</span>`;
}

// pick up changes made on the laptop when coming back to the app
let lastRefresh = Date.now();
async function refresh(force = false) {
  if (store.demo || document.body.classList.contains('busy')) return;
  if (!force && Date.now() - lastRefresh < 30000) return;
  lastRefresh = Date.now();
  try {
    await load();
    render();
    if (force) toast('Up to date');
  } catch {
    /* offline: keep what we have */
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());

function showStore() {
  document.getElementById('store-name').textContent = store.demo ? 'Demo data' : 'Your vault';
  document.body.classList.toggle('is-demo', store.demo);
}

showStore();

// open instantly from the copy saved last time, then fetch the latest in the background
const cached = store.cached?.();
if (cached) {
  state.files = cached;
  index();
  render();
} else {
  view.innerHTML = '<p class="empty">Loading your notes…</p>';
}
load()
  .then(render)
  .catch((e) => {
    console.error(e);
    if (cached) return toast('Offline: showing your last copy');
    view.innerHTML = `<p class="empty">Could not load your vault (${esc(e.message)}). <a class="accent" href="#/settings">Check Settings</a></p>`;
  });
