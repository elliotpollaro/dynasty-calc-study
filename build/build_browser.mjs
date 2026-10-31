// Calculator accuracy study: build the trade browser, a static site that shows every scored trade with the
// crowd's votes, each calculator's numbers and the screenshot behind each reading. Every number is read from
// the published files; nothing is typed by hand. The build fails unless the page's numbers reproduce the
// published leaderboard and every thread's vote weights exactly.
//
// Usage: node research/calc-accuracy/build_browser.mjs --study <unzipped calc-accuracy-2026-10-30> --live <dd-live-2026-10-31 dir>
//          [--live2 <its pass2 dir: full-trade screenshots>]
//          --out <site dir> [--template <browser_template.html>]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN, NAMES, gapOf, calcVerdict, agreement } from './analysis_lib.mjs';
import { parseCsvLine } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const fail = (msg) => { console.error(`BUILD FAILED: ${msg}`); process.exit(1); };
const STUDY = flag('--study');
const LIVE = flag('--live');
const LIVE2 = flag('--live2');
const OUT = flag('--out');
if (!STUDY || !LIVE || !OUT) fail('usage: build_browser.mjs --study <dir> --live <dir> --out <dir>');
const TEMPLATE = flag('--template', join(HERE, 'browser_template.html'));

const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const readCsv = (...p) => {
  const [head, ...rows] = readFileSync(join(...p), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = parseCsvLine(head);
  return rows.map((l) => Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])));
};

// The study's own files.
const verdicts = readJson(STUDY, 'verdicts.json').verdicts.filter((v) => ['A', 'B', 'even'].includes(v.verdict));
const threads = new Map(readCsv(STUDY, 'threads.csv').map((t) => [t.thread_id, t]));
const readings = readFileSync(join(STUDY, 'readings.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const reading = new Map(readings.map((r) => [`${r.thread_id}|${r.calculator}`, r]));
const analysis = readJson(STUDY, 'analysis_unblinded_after_fc_relisting.json');
const faTrades = readJson(STUDY, 'free_agents', 'fa_trades.json').trades;
const ddLive30 = readCsv(STUDY, 'dd_live_check.csv');
// The Oct 30 check's first attempts that were re-entered, with the reason the capture log gives.
const ddFirst30 = readCsv(STUDY, 'dd_live_check_first_attempt.csv');
const REENTERED = {
  '1xcvu16': 'entered with tier names instead of the exact 2027 slots the thread named',
  '1xgwouz': 'entered with tier names instead of the exact 2027 slots the thread named',
  '1wzof24': 'a tight end added with TE+ already off kept his TE-premium value (a live-site bug, since fixed)',
  '1wv9xhm': 'a tight end added with TE+ already off kept his TE-premium value (a live-site bug, since fixed)',
};
const ddLive31 = new Map(readCsv(LIVE, 'live.csv').map((r) => [r.thread_id, r]));
const ddLive31b = LIVE2 ? new Map(readCsv(LIVE2, 'live.csv').map((r) => [r.thread_id, r])) : new Map();
const comments = readCsv(STUDY, 'comment_positions.csv').filter((c) => c.pass === 'pass1');

// Every image the page shows is copied next to it, under the same relative path as in the published files.
const copied = new Set();
const copyShot = (root, rel) => {
  if (!rel) return null;
  const src = join(root, rel);
  if (!existsSync(src)) fail(`missing screenshot ${src}`);
  const out = root === LIVE ? `dd-live-2026-10-31/${rel}` : root === LIVE2 ? `dd-live-2026-10-31/pass2/${rel}` : rel;
  if (!copied.has(out)) { mkdirSync(dirname(join(OUT, out)), { recursive: true }); copyFileSync(src, join(OUT, out)); copied.add(out); }
  return out;
};

const ONE_DAY = (iso) => iso.slice(0, 10);
const calcCell = (r, crowd) => {
  if (!r || r.status !== 'ok') return { status: r ? r.status : 'missing' };
  const call = calcVerdict(gapOf(r.total_a, r.total_b));
  return {
    a: r.total_a, b: r.total_b, call, ok: crowd ? call === crowd : undefined,
    shot: r.method === 'browser' ? copyShot(STUDY, r.screenshot) : null,
    at: r.captured_at, text: r.verdict_text || '', method: r.method,
  };
};
const live30 = (id) => {
  const shot = (r, first) => ({ a: Number(r.live_total_a), b: Number(r.live_total_b), at: r.captured_at, tep: r.tep, shot: copyShot(STUDY, r.screenshot), ...(first && { first }) });
  const final = ddLive30.filter((r) => r.thread_id === id);
  const firsts = ddFirst30.filter((r) => r.thread_id === id && !final.some((f) => f.screenshot === r.screenshot));
  if (firsts.some((r) => !REENTERED[id])) fail(`${id}: a re-entered first attempt has no reason recorded`);
  return [...firsts.map((r) => shot(r, REENTERED[id])), ...final.map((r) => shot(r))];
};
const live31 = (id) => {
  const r = ddLive31.get(id);
  return r && r.status === 'ok' ? { a: Number(r.live_total_a), b: Number(r.live_total_b), at: r.captured_at, shot: copyShot(LIVE, r.screenshot) } : null;
};
// The second pass: the same trades entered again later that day, with screenshots of the whole trade.
const live31b = (id) => {
  const r = ddLive31b.get(id);
  return r && r.status === 'ok' ? { a: Number(r.live_total_a), b: Number(r.live_total_b), at: r.captured_at, shots: [r.screenshot, r.screenshot2].filter(Boolean).map((x) => copyShot(LIVE2, x)) } : null;
};

// §3's vote rule, rebuilt from the published comment positions: one vote per commenter, through their
// highest-scored comment that takes a position (ties go to the earliest); the poster and calculator quotes
// don't vote; a lean counts half for its side and half for even. Checked against the locked weights below.
const WEIGHT = { A: { A: 1 }, lean_A: { A: 0.5, even: 0.5 }, even: { even: 1 }, lean_B: { B: 0.5, even: 0.5 }, B: { B: 1 } };
const votesOf = (id) => {
  const best = new Map();
  for (const c of comments.filter((x) => x.thread_id === id)) {
    if (c.commenter === 'OP' || !c.commenter || c.position === 'none' || c.calc_cited === 'true') continue;
    const score = Number(c.comment_score);
    const prev = best.get(c.commenter);
    if (!prev || score > prev.score || (score === prev.score && c.comment_created < prev.created)) {
      best.set(c.commenter, { c: c.commenter, p: c.position, id: c.comment_id, score, created: c.comment_created });
    }
  }
  return [...best.values()].sort((x, y) => Number(x.c.slice(1)) - Number(y.c.slice(1))).map(({ c, p, id: cid }) => ({ c, p, id: cid }));
};

const trades = verdicts.map((v) => {
  const t = threads.get(v.thread_id);
  if (!t) fail(`thread ${v.thread_id} is not in threads.csv`);
  const votes = votesOf(v.thread_id);
  const w = { A: 0, B: 0, even: 0 };
  for (const { p } of votes) for (const [k, x] of Object.entries(WEIGHT[p])) w[k] += x;
  if (votes.length !== v.voters || ['A', 'B', 'even'].some((k) => w[k] !== v.weights[k])) {
    fail(`${v.thread_id}: rebuilt votes ${JSON.stringify(w)} (${votes.length}) differ from the locked ${JSON.stringify(v.weights)} (${v.voters})`);
  }
  return {
    id: v.thread_id, url: t.url, date: ONE_DAY(t.created), tep: v.flair_tep, bucket: t.bucket, a: t.side_a, b: t.side_b,
    crowd: v.verdict, voters: v.voters, w: v.weights, votes,
    calc: Object.fromEntries(MAIN.map((c) => [c, calcCell(reading.get(`${v.thread_id}|${c}`), v.verdict)])),
    more: Object.fromEntries(['KTC_CROWD_TRADES', 'KTC_TRADE'].map((c) => [c, calcCell(reading.get(`${v.thread_id}|${c}`), v.verdict)])),
    dd30: live30(v.thread_id), dd31: live31(v.thread_id), dd31b: live31b(v.thread_id),
  };
});

// The page's calls must reproduce the published leaderboard exactly.
for (const row of analysis.primary.leaderboard) {
  const code = MAIN.find((c) => NAMES[c] === row.calculator);
  const mine = agreement(trades.map((t) => ({ verdict: t.crowd, calc: t.calc[code].call })));
  for (const k of ['accuracy', 'match', 'evenHit', 'winHit', 'nEven', 'nWin']) {
    if (mine[k] !== row[k]) fail(`${row.calculator} ${k}: page ${mine[k]} vs published ${row[k]}`);
  }
}

// Free-agent tests (§5): the registered pass/fail rows, joined to each reading.
const faRows = (name, test) => new Map((analysis.freeAgents.results[name]?.[test]?.rows || []).map((r) => [r.id, r]));
const fa = faTrades.map((f) => {
  const names = (side) => side.map((x) => x.name).join(' + ');
  const calc = Object.fromEntries(MAIN.map((c) => {
    const cell = calcCell(reading.get(`${f.thread_id}|${c}`), null);
    const row = faRows(NAMES[c], f.test === 'A' ? 'testA' : 'testB').get(f.thread_id);
    return [c, { ...cell, ...(row && { pass: row.pass, delta: row.delta, allowed: row.allowed, wrongWay: row.wrongWay, throwIn: row.throwInValue }) }];
  }));
  return { id: f.thread_id, test: f.test, pile: f.pile, pair: f.pair, variant: f.variant, a: names(f.side_a), b: names(f.side_b), calc, dd30: live30(f.thread_id), dd31: live31(f.thread_id), dd31b: live31b(f.thread_id) };
});

const summary = MAIN.map((c) => {
  const row = analysis.primary.leaderboard.find((r) => r.calculator === NAMES[c]);
  const res = analysis.freeAgents.results[NAMES[c]];
  return { code: c, name: NAMES[c], accuracy: row.accuracy, ci95: row.ci95, winHit: row.winHit, evenHit: row.evenHit, nWin: row.nWin, nEven: row.nEven,
    faA: `${res.testA.passed} of ${res.testA.of}`, faB: `${res.testB.passed} of ${res.testB.of}` };
});

const data = { names: NAMES, main: MAIN, winner: analysis.primary.winner, summary, trades, fa };
mkdirSync(OUT, { recursive: true });
const html = readFileSync(TEMPLATE, 'utf8').replace('/*STUDY_DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
writeFileSync(join(OUT, 'index.html'), html);
console.log(`trades ${trades.length}, free-agent tests ${fa.length}, images ${copied.size} -> ${join(OUT, 'index.html')}`);
console.log('checks passed: the leaderboard reproduces exactly; every thread\'s votes rebuild to the locked weights');
