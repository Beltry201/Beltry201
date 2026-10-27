// Pulls the last 12 months of activity from the GitHub GraphQL API and draws two figures:
//   assets/activity-{light,dark}.svg  weekly contributions + headline numbers
//   assets/rhythm-{light,dark}.svg    commit day x hour heatmap + languages by code volume
//
// Run locally:  GH_TOKEN=xxx GH_LOGIN=Beltry201 node scripts/build-metrics.mjs
// Preview:      node scripts/build-metrics.mjs --demo
// In CI it runs daily from .github/workflows/profile-metrics.yml. No dependencies (Node 20+).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, THEMES, svgDoc, esc, fmt, measure, r1, richLine, richWidth } from './lib/design.mjs';

const DEMO = process.argv.includes('--demo');
const LOGIN = process.env.GH_LOGIN || 'Beltry201';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const TZ = process.env.TIMEZONE || 'America/Bogota';
const TZ_LABEL = process.env.TIMEZONE_LABEL || 'Bogotá time';
const MAX_REPOS = 25; // repos scanned for commit timestamps
const MAX_PAGES = 5; // x100 commits per repo

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

// ================================================================ data
async function gql(query, variables) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-metrics' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json.errors) return json.data;
    if (attempt >= 3) throw new Error(`GitHub API ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 400)}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const Q_PROFILE = `query($login:String!){
  user(login:$login){
    id
    contributionsCollection{
      totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions
      totalIssueContributions restrictedContributionsCount
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
      commitContributionsByRepository(maxRepositories:${MAX_REPOS}){
        repository{ name owner{ login } }
        contributions{ totalCount }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT, direction:DESC}){
      nodes{ languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } } }
    }
  }
}`;

const Q_HISTORY = `query($owner:String!,$name:String!,$author:ID!,$since:GitTimestamp!,$cursor:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{ target{ ... on Commit{
      history(first:100, after:$cursor, since:$since, author:{id:$author}){
        pageInfo{ hasNextPage endCursor } nodes{ authoredDate }
      }
    } } }
  }
}`;

async function fetchLive() {
  if (!TOKEN) throw new Error('Set GH_TOKEN (or run with --demo).');
  const { user } = await gql(Q_PROFILE, { login: LOGIN });
  if (!user) throw new Error(`User ${LOGIN} not found`);
  const cc = user.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })));

  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const stamps = [];
  for (const { repository: repo } of cc.commitContributionsByRepository) {
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await gql(Q_HISTORY, { owner: repo.owner.login, name: repo.name, author: user.id, since, cursor }).catch((e) => {
        console.warn(`skip ${repo.owner.login}/${repo.name}: ${e.message}`);
        return null;
      });
      const hist = data?.repository?.defaultBranchRef?.target?.history;
      if (!hist) break;
      stamps.push(...hist.nodes.map((n) => n.authoredDate));
      if (!hist.pageInfo.hasNextPage) break;
      cursor = hist.pageInfo.endCursor;
    }
  }

  const langBytes = {};
  for (const repo of user.repositories.nodes)
    for (const e of repo.languages.edges) langBytes[e.node.name] = (langBytes[e.node.name] || 0) + e.size;

  return {
    demo: false,
    days,
    stamps,
    langBytes,
    prs: cc.totalPullRequestContributions,
    reviews: cc.totalPullRequestReviewContributions,
  };
}

function fakeData() {
  let seed = 20261027;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const days = [];
  const end = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 864e5);
    const dow = d.getUTCDay();
    const season = 1 + 0.8 * Math.sin(i / 38) + (i < 90 ? 0.9 : 0);
    const p = dow === 0 || dow === 6 ? 0.45 : 0.86;
    days.push({ date: d.toISOString().slice(0, 10), count: rand() < p ? Math.round(rand() * 7 * season) : 0 });
  }
  const stamps = [];
  for (let i = 0; i < 640; i++) {
    const d = new Date(end.getTime() - Math.floor(rand() * 365) * 864e5);
    const r = rand();
    const h = r < 0.45 ? 21 + Math.floor(rand() * rand() * 4) : r < 0.9 ? 10 + Math.floor(rand() * 8) : Math.floor(rand() * 2);
    d.setUTCHours((h + 5) % 24, Math.floor(rand() * 60)); // stored as UTC, rendered in Bogotá time
    if ([0, 6].includes(d.getUTCDay()) && rand() < 0.6) continue;
    stamps.push(d.toISOString());
  }
  return {
    demo: true,
    days,
    stamps,
    langBytes: { TypeScript: 410, Python: 220, JavaScript: 150, Dart: 90, HTML: 50, CSS: 40, Shell: 15, Dockerfile: 10 },
    prs: 64,
    reviews: 41,
  };
}

// ================================================================ derive
function derive(raw) {
  const days = raw.days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((s, d) => s + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;

  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // today isn't over yet
  for (; i >= 0 && days[i].count > 0; i--) current++;

  // weekly sums, weeks starting Sunday like GitHub's calendar
  const weeks = [];
  for (const d of days) {
    const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    if (!weeks.length || dow === 0) weeks.push({ start: d.date, count: 0 });
    weeks[weeks.length - 1].count += d.count;
  }

  // day x hour punch card in the chosen time zone
  const punch = DAYS.map(() => Array(24).fill(0));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  for (const s of raw.stamps) {
    const p = Object.fromEntries(parts.formatToParts(new Date(s)).map((x) => [x.type, x.value]));
    const di = DAYS.indexOf(p.weekday);
    if (di >= 0) punch[di][Number(p.hour) % 24]++;
  }
  const commits = raw.stamps.length;

  const langs = Object.entries(raw.langBytes).sort((a, b) => b[1] - a[1]);
  const langTotal = langs.reduce((s, [, b]) => s + b, 0);
  let languages = langs.slice(0, 6).map(([name, b]) => ({ name, share: b / langTotal }));
  const rest = langs.slice(6).reduce((s, [, b]) => s + b, 0);
  if (rest > 0) languages.push({ name: 'Other', share: rest / langTotal });
  if (!langTotal) languages = [];

  return { demo: raw.demo, total, active, dayCount: days.length, longest, current, weeks, punch, commits, languages, prs: raw.prs, reviews: raw.reviews, from: days[0]?.date, to: days.at(-1)?.date };
}

// ================================================================ helpers
const niceMax = (v) => {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
};

// Fritsch–Carlson monotone cubic: smooth, never overshoots below zero or above the peak
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r1(pts[i][0] + h)} ${r1(pts[i][1] + h * t[i])} ${r1(pts[i + 1][0] - h)} ${r1(pts[i + 1][1] - h * t[i + 1])} ${r1(pts[i + 1][0])} ${r1(pts[i + 1][1])}`;
  }
  return d;
}

const hourLabel = (h) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);

function stampText(m) {
  if (m.demo) return 'Demo data. Run the Profile metrics workflow to load real numbers.';
  const d = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
  return `Updated ${d} from the GitHub API`;
}

// ================================================================ figure: activity
function activity(t, m) {
  const W = 1000, H = 412;
  const big = { size: 32, num: { weight: 800, fill: t.ink }, txt: { weight: 400, fill: t.ink } };
  const small = { size: 17, num: { weight: 700, fill: t.ink }, txt: { weight: 400, fill: t.slate } };

  const head = [[fmt(m.total), 'num'], [' contributions in the last year', 'txt']];
  const sub = [
    ['Active on ', 'txt'], [fmt(m.active), 'num'], [` of ${m.dayCount} days. Longest streak `, 'txt'], [`${m.longest} days`, 'num'],
    [', current ', 'txt'], [`${m.current}`, 'num'], ['. ', 'txt'], [fmt(m.prs), 'num'], [' pull requests and ', 'txt'], [fmt(m.reviews), 'num'], [' reviews.', 'txt'],
  ];
  let subLines = [sub];
  if (richWidth(sub, small) > 920) subLines = [sub.slice(0, 7), sub.slice(7)];

  const x0 = 64, x1 = 960, yTop = 150 + (subLines.length - 1) * 26, yBot = 330;
  const max = niceMax(Math.max(1, ...m.weeks.map((w) => w.count)));
  const X = (i) => x0 + (i / Math.max(1, m.weeks.length - 1)) * (x1 - x0);
  const Y = (v) => yBot - (v / max) * (yBot - yTop);
  const pts = m.weeks.map((w, i) => [X(i), Y(w.count)]);
  const line = monotonePath(pts);
  const area = `${line} L${r1(x1)} ${yBot} L${x0} ${yBot} Z`;

  const ticks = [0, max / 2, max];
  const grid = ticks
    .map((v) => `<line x1="${x0}" x2="${x1}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" stroke="${v === 0 ? t.hair : t.grid}" stroke-width="1"/>
  <text x="${x0 - 12}" y="${r1(Y(v) + 4.5)}" text-anchor="end" font-size="13.5" fill="${t.faint}">${fmt(v)}</text>`)
    .join('\n  ');

  // month labels at the first week that starts in a new month
  let lastX = -99, prevMonth = null;
  const months = [];
  m.weeks.forEach((w, i) => {
    const d = new Date(`${w.start}T12:00:00Z`);
    const mo = d.getUTCMonth();
    if (mo !== prevMonth && i > 0 && X(i) - lastX > 46 && X(i) < x1 - 20) {
      months.push(`<text x="${r1(X(i))}" y="${yBot + 24}" text-anchor="middle" font-size="13.5" fill="${t.slate}">${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`);
      lastX = X(i);
    }
    prevMonth = mo;
  });

  // direct labels: peak week and this week
  const peakI = m.weeks.reduce((bi, w, i, a) => (w.count > a[bi].count ? i : bi), 0);
  const marks = [];
  const label = (i, text) => {
    const [x, y] = pts[i];
    const w = measure(text, 14, 700);
    const anchor = x + w / 2 > x1 ? 'end' : x - w / 2 < x0 ? 'start' : 'middle';
    const tx = anchor === 'end' ? x + 6 : anchor === 'start' ? x - 6 : x;
    marks.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="4.5" fill="${t.accent}" stroke="${t.page}" stroke-width="2"/>
  <text x="${r1(tx)}" y="${r1(Math.max(yTop - 4, y - 13))}" text-anchor="${anchor}" font-size="14" font-weight="700" fill="${t.ink}">${esc(text)}</text>`);
  };
  if (m.weeks.length) {
    label(peakI, `Busiest week, ${fmt(m.weeks[peakI].count)}`);
  }

  const body = `
<defs>
  <linearGradient id="wash" x1="0" y1="${yTop}" x2="0" y2="${yBot}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${t.accentWash}" stop-opacity="${t.name === 'dark' ? 0.32 : 0.16}"/>
    <stop offset="1" stop-color="${t.accentWash}" stop-opacity="0"/>
  </linearGradient>
</defs>
${richLine(40, 52, head, big)}
${subLines.map((l, i) => richLine(40, 88 + i * 26, l, small)).join('\n')}
<text x="${x0}" y="${yTop - 26}" font-size="14.5" font-weight="700" fill="${t.slate}">Contributions per week</text>
  ${grid}
<path d="${area}" fill="url(#wash)"/>
<path d="${line}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${months.join('\n  ')}
  ${marks.join('\n  ')}
<text x="960" y="${H - 18}" text-anchor="end" font-size="13.5" fill="${m.demo ? t.accent : t.faint}">${esc(stampText(m))}</text>`;

  return svgDoc({
    width: W, height: H, weights: [400, 700, 800],
    title: `${fmt(m.total)} GitHub contributions in the last year`,
    desc: `Active on ${m.active} of ${m.dayCount} days. Longest streak ${m.longest} days, current ${m.current}. ${m.prs} pull requests and ${m.reviews} reviews. Line chart of contributions per week; busiest week had ${m.weeks[peakI]?.count ?? 0}.`,
    body,
  });
}

// ================================================================ figure: rhythm
function rhythm(t, m) {
  const W = 1000, H = 440;
  const flat = m.punch.flat();
  const enough = m.commits >= 15;

  const big = { size: 27, num: { weight: 800, fill: t.ink }, txt: { weight: 400, fill: t.ink } };
  const small = { size: 17, num: { weight: 700, fill: t.ink }, txt: { weight: 400, fill: t.slate } };
  let head, sub;
  if (enough) {
    const hours = Array.from({ length: 24 }, (_, h) => m.punch.reduce((s, row) => s + row[h], 0));
    const peakH = hours.indexOf(Math.max(...hours));
    const dayTotals = m.punch.map((row) => row.reduce((a, b) => a + b, 0));
    const peakD = dayTotals.indexOf(Math.max(...dayTotals));
    const weekend = Math.round(((dayTotals[5] + dayTotals[6]) / m.commits) * 100);
    const when = peakH === 0 ? 'midnight' : peakH === 12 ? 'noon' : hourLabel(peakH);
    head = [['Most of my commits land around ', 'txt'], [when, 'num'], [', and ', 'txt'], [DAYS_LONG[peakD], 'num'], [' are the busiest.', 'txt']];
    sub = [[`${weekend}%`, 'num'], [' happen on weekends. Based on ', 'txt'], [fmt(m.commits), 'num'], [` commits from the last year, ${TZ_LABEL}.`, 'txt']];
  } else {
    head = [['Not enough commit history yet to show a rhythm.', 'txt']];
    sub = [['This fills in as commits land on default branches.', 'txt']];
  }

  // heatmap
  const gx = 96, gy = 156, cell = 24, gap = 3, pitch = cell + gap;
  const nonzero = flat.filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 ? -1 : v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : v <= cuts[2] ? 2 : 3);
  const cells = m.punch
    .map((row, d) =>
      row.map((v, h) => {
        const lv = level(v);
        return `<rect x="${gx + h * pitch}" y="${gy + d * pitch}" width="${cell}" height="${cell}" rx="5" fill="${lv < 0 ? t.empty : t.ramp[lv]}"/>`;
      }).join('')
    ).join('\n  ');
  const dayLabels = DAYS.map((d, i) => `<text x="${gx - 12}" y="${gy + i * pitch + 16.5}" text-anchor="end" font-size="13.5" fill="${t.slate}">${d}</text>`).join('\n  ');
  const hourTicks = [0, 6, 12, 18].map((h) => `<text x="${gx + h * pitch}" y="${gy + 7 * pitch + 16}" font-size="13.5" fill="${t.slate}">${hourLabel(h)}</text>`).join('\n  ');
  const lx = gx, ly = gy + 7 * pitch + 46;
  const legend = `<text x="${lx}" y="${ly + 11}" font-size="13.5" fill="${t.slate}">Fewer</text>
  ${[t.empty, ...t.ramp].map((c, i) => `<rect x="${lx + 48 + i * 18}" y="${ly}" width="14" height="14" rx="3.5" fill="${c}"/>`).join('')}
  <text x="${lx + 48 + 5 * 18 + 4}" y="${ly + 11}" font-size="13.5" fill="${t.slate}">More</text>`;

  // languages, one row per heatmap row
  const px = 784, pw = 176;
  const langRows = m.languages.length
    ? m.languages.map((l, i) => {
        const y = gy + i * pitch;
        const pct = l.share >= 0.1 ? `${Math.round(l.share * 100)}%` : `${(l.share * 100).toFixed(1)}%`;
        return `<text x="${px}" y="${y + 12}" font-size="14.5" fill="${t.ink}" font-weight="${i === 0 ? 700 : 400}">${esc(l.name)}</text>
  <text x="${px + pw}" y="${y + 12}" text-anchor="end" font-size="14" fill="${t.slate}">${pct}</text>
  <rect x="${px}" y="${y + 18}" width="${pw}" height="4" rx="2" fill="${t.grid}"/>
  <rect x="${px}" y="${y + 18}" width="${r1(Math.max(4, pw * l.share))}" height="4" rx="2" fill="${l.name === 'Other' ? t.faint : t.accent}"/>`;
      }).join('\n  ')
    : `<text x="${px}" y="${gy + 12}" font-size="13.5" fill="${t.slate}">No language data yet.</text>`;

  const body = `
${richLine(40, 52, head, big)}
${richLine(40, 88, sub, small)}
<text x="${gx}" y="${gy - 18}" font-size="14.5" font-weight="700" fill="${t.slate}">Commits by day and hour</text>
<text x="${px}" y="${gy - 18}" font-size="14.5" font-weight="700" fill="${t.slate}">Top languages</text>
  ${cells}
  ${dayLabels}
  ${hourTicks}
  ${legend}
  ${langRows}
<text x="960" y="${H - 18}" text-anchor="end" font-size="13.5" fill="${m.demo ? t.accent : t.faint}">${esc(stampText(m))}</text>`;

  const plain = (parts) => parts.map((p) => p[0]).join('');
  return svgDoc({
    width: W, height: H, weights: [400, 700, 800],
    title: plain(head),
    desc: `${plain(sub)} Heatmap of commits by weekday and hour. Languages by code volume: ${m.languages.map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(', ')}.`,
    body,
  });
}

// ================================================================ main
const raw = DEMO ? fakeData() : await fetchLive();
const m = derive(raw);
for (const t of Object.values(THEMES)) {
  writeFileSync(join(ROOT, 'assets', `activity-${t.name}.svg`), activity(t, m));
  writeFileSync(join(ROOT, 'assets', `rhythm-${t.name}.svg`), rhythm(t, m));
}
console.log(`metrics: ${m.total} contributions, ${m.commits} commits sampled, ${m.languages.length} languages${m.demo ? ' (demo)' : ''}`);
