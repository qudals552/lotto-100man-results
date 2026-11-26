// 로또 6/45 최신 당첨번호를 공개 JSON(smok95/lotto)에서 받아 검증한 뒤 results/ 에 저장한다.
// GitHub Actions 에서 토요일 밤~일요일 오전에 여러 번 돈다. 이미 받은 회차면 요청 없이 끝낸다.
//
// 사용법
//   node scripts/fetch-results.mjs                 # 자동 (smok95 에서 받기)
//   node scripts/fetch-results.mjs --manual 1252 "1 2 3 4 5 6" 7   # 수동 입력 (출처가 멈췄을 때)
// 환경변수
//   RESULTS_DIR  저장 폴더 (기본: results)
//   NOW          테스트용 현재 시각 (ISO 문자열)
//   GITHUB_OUTPUT  Actions 가 주면 status=updated|already|not_yet 를 적는다
//
// 끝나는 코드: 0 = 저장했거나 이미 있음, 2 = 아직 안 올라옴, 1 = 검증 실패·오류

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.RESULTS_DIR ? join(ROOT, process.env.RESULTS_DIR) : join(ROOT, 'results');
const SOURCE = 'https://smok95.github.io/lotto/results/';
const WEEK = 7 * 864e5;
const FIRST_DRAW = Date.UTC(2002, 11, 7, 11, 35); // 1회 2002-12-07 20:35 KST (추첨 시각)

const now = () => (process.env.NOW ? Date.parse(process.env.NOW) : Date.now());

// 지금 기준으로 추첨이 끝난 가장 최근 회차
export function expectedRound(t = now()) {
  return Math.floor((t - FIRST_DRAW) / WEEK) + 1;
}

export function validate(r, round) {
  const errs = [];
  if (r.draw_no !== round) errs.push(`회차가 ${round}가 아니라 ${r.draw_no}`);
  const nums = r.numbers;
  if (!Array.isArray(nums) || nums.length !== 6) errs.push('번호가 6개가 아님');
  else {
    if (!nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) errs.push('1~45 밖의 번호');
    if (new Set(nums).size !== 6) errs.push('번호 중복');
  }
  const b = r.bonus;
  if (!Number.isInteger(b) || b < 1 || b > 45) errs.push('보너스 번호 범위 오류');
  else if (Array.isArray(nums) && nums.includes(b)) errs.push('보너스가 당첨번호와 겹침');
  // 추첨일은 토요일이어야 하고, 예상 추첨일과 같아야 함
  if (r.date) {
    const exp = new Date(FIRST_DRAW + (round - 1) * WEEK + 9 * 36e5).toISOString().slice(0, 10);
    if (r.date !== exp) errs.push(`추첨일이 ${exp}가 아니라 ${r.date}`);
  }
  return errs;
}

async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

async function output(status) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
  console.log(`status=${status}`);
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'cache-control': 'no-cache', 'user-agent': 'lotto-100man-results/1.0' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// all.json: 역대 회차 전부를 [회차, 번호6개, 보너스] 배열로 (앱의 "2002년부터 매주 샀다면"용)
const rowOf = (r) => [r.draw_no, ...r.numbers, r.bonus];
function rowOk(r, i) {
  const nums = r.slice(1, 7);
  return r.length === 8 && r[0] === i + 1 && new Set(nums).size === 6 &&
    r.slice(1).every((n) => Number.isInteger(n) && n >= 1 && n <= 45) && !nums.includes(r[7]);
}
async function ensureAll(upTo) {
  const p = join(DIR, 'all.json');
  let rows = (await readJson(p)) || [];
  if (rows.length >= upTo && rows.every(rowOk)) return false;
  if (rows.length < upTo - 1 || !rows.every(rowOk)) {
    // 처음이거나 망가졌으면 출처의 전체 파일로 한 번 다시 만든다
    const all = await fetchJson(`${SOURCE}all.json`);
    if (!Array.isArray(all)) throw new Error('all.json 을 받지 못했어요');
    rows = all.map((d) => [d.draw_no, ...[...d.numbers].sort((a, b) => a - b), d.bonus_no]).sort((a, b) => a[0] - b[0]);
  }
  const latest = await readJson(join(DIR, 'latest.json'));
  if (latest && rows.length === latest.draw_no - 1) rows.push(rowOf(latest));
  rows = rows.slice(0, upTo);
  if (!rows.every(rowOk)) throw new Error('all.json 검증 실패');
  await mkdir(DIR, { recursive: true });
  await writeFile(p, JSON.stringify(rows));
  console.log(`all.json 갱신: 1~${rows.length}회`);
  return true;
}

async function save(rec) {
  await mkdir(DIR, { recursive: true });
  const body = JSON.stringify(rec, null, 2) + '\n';
  await writeFile(join(DIR, `${rec.draw_no}.json`), body);
  await writeFile(join(DIR, 'latest.json'), body);
  await ensureAll(rec.draw_no);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--manual') {
    const round = Number(args[1]);
    const numbers = String(args[2] || '').split(/[\s,]+/).filter(Boolean).map(Number).sort((a, b) => a - b);
    const rec = { draw_no: round, date: new Date(FIRST_DRAW + (round - 1) * WEEK + 9 * 36e5).toISOString().slice(0, 10), numbers, bonus: Number(args[3]), source: 'manual', fetched_at: new Date(now()).toISOString() };
    const errs = validate(rec, round);
    if (errs.length) { console.error('입력 검증 실패: ' + errs.join(', ')); process.exit(1); }
    await save(rec); await output('updated');
    console.log(`${round}회 수동 저장: ${numbers.join(' ')} + ${rec.bonus}`);
    return;
  }

  const round = expectedRound();
  const have = await readJson(join(DIR, 'latest.json'));
  if (have && have.draw_no >= round) {
    if (await ensureAll(have.draw_no)) { await output('updated'); return; }
    console.log(`${round}회는 이미 저장돼 있어요. 요청하지 않고 끝냅니다.`);
    await output('already');
    return;
  }

  // 회차별 파일을 먼저 보고, 없으면 latest 로 한 번 더 확인
  let raw = await fetchJson(`${SOURCE}${round}.json`);
  if (!raw) {
    const latest = await fetchJson(`${SOURCE}latest.json`);
    if (latest && latest.draw_no === round) raw = latest;
  }
  if (!raw) {
    console.log(`${round}회가 아직 올라오지 않았어요.`);
    await output('not_yet');
    process.exit(2);
  }

  const rec = {
    draw_no: raw.draw_no,
    date: String(raw.date || '').slice(0, 10),
    numbers: [...(raw.numbers || [])].sort((a, b) => a - b),
    bonus: raw.bonus_no,
    source: 'smok95/lotto',
    fetched_at: new Date(now()).toISOString(),
  };
  const errs = validate(rec, round);
  if (errs.length) {
    console.error(`${round}회 검증 실패: ${errs.join(', ')}`);
    await output('invalid');
    process.exit(1);
  }
  await save(rec);
  await output('updated');
  console.log(`${round}회 저장: ${rec.numbers.join(' ')} + ${rec.bonus}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(async (e) => { console.error('오류: ' + e.message); await output('error'); process.exit(1); });
}
