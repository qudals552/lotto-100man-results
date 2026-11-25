# 로또 6/45 당첨번호 (자동 갱신)

토스 미니앱 "로또 100만번"이 읽는 당첨번호 파일이에요. 매주 토요일 밤부터 일요일 오후까지 여러 번 확인해서 새 회차가 올라오면 저장해요.

- 최신 회차: `results/latest.json`
- 회차별: `results/{회차}.json`

```json
{ "draw_no": 1251, "date": "2026-11-21", "numbers": [14, 18, 19, 29, 40, 45], "bonus": 1, "source": "smok95/lotto", "fetched_at": "..." }
```

출처: [smok95/lotto](https://github.com/smok95/lotto) 공개 JSON. 받은 뒤 회차·추첨일·번호 형식을 검증해요.
오류가 있을 수 있으니 정확한 당첨번호는 동행복권 사이트에서 확인해 주세요.
