// "로또 5천만" 주간 데이터
//   build N : N회용 5천만 장을 뽑아 weeks/N.json (국민 번호 1~10위, 통계, 화면 피드용 샘플)
//   score N : N회 당첨번호로 같은 5천만 장을 채점해 weeks/N-score.json
//   (인자 없음) : 필요한 것만 알아서 — 다음 회차 build, 당첨번호가 들어온 회차 score
// 환경변수 DRAWS 로 장수를 바꿔 시험할 수 있다 (기본 5천만).
import { mkdir, readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOTAL, seedOf, makeDrawer, unrank } from './lotto-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEEKS = join(ROOT, 'weeks');
const DRAWS = Number(process.env.DRAWS || 50_000_000);
const WEEK = 7 * 864e5, FIRST_DRAW = Date.UTC(2002, 11, 7, 11, 35);
const exists = (p) => access(p).then(() => true, () => false);
const readJson = async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };
const lastDrawn = () => Math.floor((Date.now() - FIRST_DRAW) / WEEK) + 1;

export function build(round) {
  const t0 = Date.now(), seed = seedOf(round), dr = makeDrawer(seed), a = dr.a;
  const counts = new Uint8Array(TOTAL), freq = new Float64Array(45);
  const SNAP = DRAWS / 40, snaps = [], recent = [0, 0, 0];
  let lastDup = -1, maxC = 0;
  for (let d = 0; d < DRAWS; d++) {
    dr.next();
    for (let i = 0; i < 6; i++) freq[a[i]]++;
    const r = dr.rank(), c = counts[r];
    if (c < 255) counts[r] = c + 1;
    if (c + 1 > maxC) maxC = c + 1;
    if (c >= 1) lastDup = r;
    recent[d % 3] = r;
    if ((d + 1) % SNAP === 0) {
      snaps.push({
        at: d + 1, top: maxC,
        lines: [0, 1, 2].map((k) => { const rr = recent[(d - k + 3) % 3]; return { nums: unrank(rr), count: counts[rr] }; }),
        dup: lastDup >= 0 ? { nums: unrank(lastDup), count: counts[lastDup] } : null,
      });
    }
  }
  // 횟수별 조합 수 → 상위 10개를 뽑을 기준선
  const hist = new Array(256).fill(0);
  for (let r = 0; r < TOTAL; r++) hist[counts[r]]++;
  let T = 255, acc = 0; while (T > 0 && acc + hist[T] < 10) { acc += hist[T]; T--; }
  const cand = [];
  for (let r = 0; r < TOTAL; r++) if (counts[r] >= T) cand.push(r);
  const ranked = cand.map((r) => { const nums = unrank(r); return { nums, count: counts[r], score: nums.reduce((s, n) => s + freq[n - 1], 0), r }; })
    .sort((x, y) => y.count - x.count || y.score - x.score || x.r - y.r);
  const topC = ranked[0].count;
  let repeated = 0; for (let k = 2; k < 256; k++) repeated += hist[k];
  const maxK = hist.reduce((m, v, k) => (v ? k : m), 0);
  // 앞에서부터 몇 번째에 처음 나왔는지는 필요 없어서 계산하지 않는다
  return {
    round, seed, draws: DRAWS, made_at: new Date().toISOString(),
    top: ranked.slice(0, 10).map(({ nums, count }) => ({ nums, count })),
    tied: hist[topC], repeated, never: hist[0],
    countHist: hist.slice(0, maxK + 1),
    freq: Array.from(freq),
    snaps, ms: Date.now() - t0,
  };
}

export function score(round, win, bonus) {
  const t0 = Date.now(), dr = makeDrawer(seedOf(round)), a = dr.a;
  const hit = new Uint8Array(45); for (const n of win) hit[n - 1] = 1;
  const b = bonus - 1;
  const dist = { m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m5b: 0, m6: 0 }, firsts = [];
  for (let d = 0; d < DRAWS; d++) {
    dr.next();
    let m = 0, hb = false;
    for (let i = 0; i < 6; i++) { m += hit[a[i]]; if (a[i] === b) hb = true; }
    if (m === 6) { dist.m6++; if (firsts.length < 20) firsts.push(d + 1); }
    else if (m === 5) { if (hb) dist.m5b++; else dist.m5++; }
    else dist['m' + m]++;
  }
  return { round, win, bonus, draws: DRAWS, dist, firsts, made_at: new Date().toISOString(), ms: Date.now() - t0 };
}

async function save(name, obj) { await mkdir(WEEKS, { recursive: true }); await writeFile(join(WEEKS, name), JSON.stringify(obj)); }
async function winOf(round) {
  const latest = await readJson(join(ROOT, 'results', 'latest.json'));
  if (latest && latest.draw_no === round) return { win: latest.numbers, bonus: latest.bonus };
  const all = await readJson(join(ROOT, 'results', 'all.json'));
  const row = all && all[round - 1];
  return row && row[0] === round ? { win: row.slice(1, 7), bonus: row[7] } : null;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  let changed = false;
  if (cmd === 'build') { const w = build(+arg); await save(`${arg}.json`, w); console.log(`${arg}회 5천만 장: 1위 ${w.top[0].nums.join(' ')} · ${w.top[0].count}번 (${w.ms}ms)`); changed = true; }
  else if (cmd === 'score') {
    const wb = await winOf(+arg); if (!wb) throw new Error(`${arg}회 당첨번호가 없어요`);
    const s = score(+arg, wb.win, wb.bonus); await save(`${arg}-score.json`, s); console.log(`${arg}회 채점: 1등 ${s.dist.m6}줄 (${s.ms}ms)`); changed = true;
  } else {
    // 자동: 당첨번호가 들어온 회차를 채점하고, 다음 회차 5천만 장을 준비한다
    const latest = await readJson(join(ROOT, 'results', 'latest.json'));
    if (latest && await exists(join(WEEKS, `${latest.draw_no}.json`)) && !(await exists(join(WEEKS, `${latest.draw_no}-score.json`)))) {
      const s = score(latest.draw_no, latest.numbers, latest.bonus); await save(`${latest.draw_no}-score.json`, s);
      console.log(`${latest.draw_no}회 채점: 1등 ${s.dist.m6}줄 (${s.ms}ms)`); changed = true;
    }
    const next = lastDrawn() + 1;
    if (!(await exists(join(WEEKS, `${next}.json`)))) {
      const w = build(next); await save(`${next}.json`, w);
      console.log(`${next}회 5천만 장: 1위 ${w.top[0].nums.join(' ')} · ${w.top[0].count}번 (${w.ms}ms)`); changed = true;
    }
    if (!changed) console.log('할 일이 없어요.');
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `week_changed=${changed ? 1 : 0}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error('오류: ' + e.message); process.exit(1); });
