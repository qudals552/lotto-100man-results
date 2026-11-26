// 로또 6/45 대량 추첨 공통 코드 (서버 전용)
// 회차마다 정해진 시드로 5천만 장을 뽑는다. 같은 시드면 언제 다시 돌려도 같은 5천만 장이 나온다.
import { createHash } from 'node:crypto';

export const N = 45, K = 6, TOTAL = 8145060;

export const C = [];
for (let n = 0; n <= N; n++) {
  C[n] = new Array(K + 1).fill(0);
  C[n][0] = 1;
  for (let k = 1; k <= Math.min(n, K); k++) C[n][k] = C[n - 1][k - 1] + C[n - 1][k];
}

// 시드는 회차 번호로만 정해진다 (공개). 추첨 전에 이미 정해져 있었다는 걸 누구나 확인할 수 있다.
export function seedOf(round) {
  const h = createHash('sha256').update(`lotto5000man-v1:${round}`).digest();
  return [0, 4, 8, 12].map((i) => h.readUInt32LE(i));
}

export function sfc32(s) {
  let x = s[0] | 0, y = s[1] | 0, z = s[2] | 0, w = s[3] | 0;
  return function () {
    const t = (((x + y) | 0) + w) | 0;
    w = (w + 1) | 0; x = y ^ (y >>> 9); y = (z + (z << 3)) | 0; z = (z << 21) | (z >>> 11); z = (z + t) | 0;
    return t >>> 0;
  };
}

// 매번 새로 부르는 생성기: next() 가 정렬된 6개 번호(0부터)를 a 에 채운다
export function makeDrawer(seed) {
  const rng = sfc32(seed), pool = new Uint8Array(N), a = new Uint8Array(K);
  for (let i = 0; i < N; i++) pool[i] = i;
  return {
    a,
    next() {
      for (let i = 0; i < K; i++) {
        const j = i + Math.floor((rng() / 4294967296) * (N - i));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        a[i] = pool[i];
      }
      for (let i = 1; i < K; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
    },
    rank() { return C[a[0]][1] + C[a[1]][2] + C[a[2]][3] + C[a[3]][4] + C[a[4]][5] + C[a[5]][6]; },
  };
}

export function unrank(r) {
  const out = new Array(K); let c = N - 1;
  for (let k = K; k >= 1; k--) { while (C[c][k] > r) c--; out[k - 1] = c + 1; r -= C[c][k]; c--; }
  return out;
}
