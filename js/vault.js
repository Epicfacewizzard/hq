// Reading and writing the vault's markdown. No app state here: every function
// takes file text in and gives data (or new file text) back.

export const CIRCLES = ['CSS', 'Nursing', 'Friends', 'Family', 'Work', 'Other clubs', 'Other'];
export const CLOSENESS = ['Close', 'Friendly', 'Acquaintance'];

// ---------- dates ----------

export const iso = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const parseIso = (s) => (s ? new Date(s + 'T00:00:00') : null);

export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

export const ago = (date) => {
  if (!date) return '';
  const d = daysBetween(date, iso());
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

export const prettyDate = (s, opts = { month: 'short', day: 'numeric' }) =>
  s ? parseIso(s).toLocaleDateString(undefined, opts) : '';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// "text Joey back sat" -> due date of next Saturday. Only plain words, nothing clever.
export const guessDue = (text) => {
  const t = text.toLowerCase();
  const today = new Date();
  if (/\btoday\b|\btonight\b/.test(t)) return iso(today);
  if (/\btomorrow\b|\btmr\b/.test(t)) return iso(new Date(today.getTime() + 86400000));
  const m = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    let diff = (target - today.getDay() + 7) % 7 || 7;
    return iso(new Date(today.getTime() + diff * 86400000));
  }
  return null;
};

// ---------- frontmatter ----------

const unquote = (v) => v.replace(/^["'](.*)["']$/, '$1');

export const parseFrontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v
        .slice(1, -1)
        .split(',')
        .map((x) => unquote(x.trim()))
        .filter(Boolean);
    } else {
      v = unquote(v);
    }
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length) };
};

const yamlValue = (v) => {
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[:#\[\]{}]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
};

// Set frontmatter keys, keeping every other line and the key order as is.
export const setFrontmatter = (text, changes) => {
  const { body } = parseFrontmatter(text);
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const lines = m ? m[1].split(/\r?\n/) : [];
  const done = new Set();
  const out = lines.map((line) => {
    const kv = line.match(/^([A-Za-z0-9_]+):/);
    if (kv && kv[1] in changes) {
      done.add(kv[1]);
      return `${kv[1]}: ${yamlValue(changes[kv[1]])}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(changes)) if (!done.has(k)) out.push(`${k}: ${yamlValue(v)}`);
  return `---\n${out.join('\n')}\n---\n${body}`;
};

// ---------- sections ----------

// Lines under "## Heading" up to the next "## ".
export const section = (body, heading) => {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) out.push(lines[i]);
  return out;
};

// Add a line at the end of a section; create the section (before "Up:" footer) if missing.
export const appendToSection = (text, heading, line, { top = false } = {}) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) {
    // put the section after the first H1 (or after frontmatter) when top, else before "Up:"
    let at = lines.length;
    if (top) {
      const h1 = lines.findIndex((l) => /^#\s/.test(l));
      at = h1 === -1 ? 0 : h1 + 1;
      while (at < lines.length && (lines[at].startsWith('>') || lines[at].trim() === '')) at++;
    } else {
      const up = lines.findIndex((l) => /^Up:/.test(l));
      if (up !== -1) at = up;
    }
    lines.splice(at, 0, `## ${heading}`, line, '');
    return lines.join('\n');
  }
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end]) && !/^Up:/.test(lines[end])) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  lines.splice(end, 0, line);
  return lines.join('\n');
};

// ---------- tasks ----------

const TASK = /^(\s*)- \[( |x|X)\] (.*)$/;

export const parseTasks = (path, text) => {
  const tasks = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(TASK);
    if (!m) return;
    const raw = m[3];
    const due = (raw.match(/📅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    tasks.push({
      path,
      line: i,
      raw: line,
      done: m[2].toLowerCase() === 'x',
      due,
      text: raw.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '').replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trim(),
    });
  });
  return tasks;
};

export const toggleTaskLine = (text, task) => {
  const lines = text.split(/\r?\n/);
  // find by content in case the file moved since we indexed it
  let i = lines[task.line] === task.raw ? task.line : lines.indexOf(task.raw);
  if (i === -1) return null;
  const m = lines[i].match(TASK);
  if (!m) return null;
  if (m[2] === ' ') {
    lines[i] = `${m[1]}- [x] ${m[3]} ✅ ${iso()}`;
  } else {
    lines[i] = `${m[1]}- [ ] ${m[3].replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, '')}`;
  }
  return lines.join('\n');
};

export const taskLine = (text, due) => `- [ ] ${text}${due ? ` 📅 ${due}` : ''}`;

// ---------- daily notes ----------

export const dailyPath = (date = iso()) => `01 Daily/${date}.md`;

export const newDaily = (date) => {
  const d = parseIso(date);
  const title = d.toLocaleDateString('en-CA', { weekday: 'short' });
  return `---\ndomain: daily\ntype: daily\nstatus: active\nupdated: ${date}\n---\n# ${date} (${title})\n\n> [!info] Up: [[Home]]\n\n## Jots\n\nUp: [[Home]]\n`;
};

// Jot lines look like "- 14:05 text". Tasks inside jots stay task lines.
export const parseJots = (text) =>
  section(parseFrontmatter(text).body, 'Jots')
    .filter((l) => /^- /.test(l))
    .map((l) => {
      const task = l.match(TASK);
      const m = l.match(/^- (?:\[[ xX]\] )?(?:(\d{1,2}:\d{2}) )?(.*)$/);
      return { time: m[1] || '', text: m[2], task: !!task, done: task ? task[2] !== ' ' : false, raw: l };
    });

// ---------- people ----------

export const isPersonPath = (p) => p.startsWith('05 People/') && p.endsWith('.md');

export const parsePerson = (path, text) => {
  const { data, body } = parseFrontmatter(text);
  const name = path.split('/').pop().replace(/\.md$/, '');
  const group = path.split('/')[1];
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const log = section(body, 'Log')
    .filter((l) => /^- /.test(l))
    .map((l) => {
      const m = l.match(/^- (\d{4}-\d{2}-\d{2}):?\s*(.*)$/);
      return m ? { date: m[1], text: m[2] } : { date: null, text: l.slice(2) };
    })
    .reverse();
  return {
    path,
    name,
    first: name.split(' ')[0],
    group,
    aliases: list(data.aliases),
    role: data.role || '',
    circles: list(data.circle).length ? list(data.circle) : group === 'CSS' ? ['CSS'] : [],
    closeness: data.closeness || '',
    instagram: (data.instagram || '').replace(/^@/, ''),
    major: data.major || '',
    grad_year: data.grad_year || '',
    where_we_met: data.where_we_met || '',
    met_on: data.met_on || '',
    likes: data.likes || '',
    dislikes: data.dislikes || '',
    memory_cues: data.memory_cues || '',
    birthday: data.birthday || '',
    last_talked: data.last_talked || '',
    follow_up: data.follow_up || '',
    log,
    body,
  };
};

// Days until the next birthday (0 = today).
export const nextBirthday = (birthday) => {
  if (!birthday) return null;
  const [, m, d] = birthday.split('-').map(Number);
  const now = parseIso(iso());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 86400000);
};

// "@Avery" / "@avery-lin" / alias -> person
export const findMentions = (text, people) => {
  const found = [];
  for (const m of text.matchAll(/@([\p{L}][\p{L}\-_.]*)/gu)) {
    const tag = m[1].toLowerCase().replace(/[-_.]/g, ' ');
    const p = people.find(
      (x) =>
        x.name.toLowerCase() === tag ||
        x.first.toLowerCase() === tag ||
        x.aliases.some((a) => a.toLowerCase() === tag),
    );
    if (p && !found.includes(p)) found.push(p);
  }
  return found;
};
