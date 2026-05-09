# in-progress

## [TOP — A 세션] B8/B9 dataset injection (2026-05-09)

**브랜치**: `feat/b8-b9-dataset-injection` (origin/main `2b85ae0` 기반)
**상태**: 코드 + 테스트 + 검증 완료. commit/push/PR 은 사용자 직접 수행.
**근거 plan**: `for-claude/personal/lawcalc-kr/docs/plans/v0.2-roadmap.md` §"Phase 2 Entry Order" 1번 + §"First v0.2 Commit Shape".

### 변경 요약

#### B8 — `data/legal-rates/v1.json` single source

`legal-rates.ts:DEFAULT_DATASET` 인라인 ↔ `data/legal-rates/v1.json` 의 "수동 동기화" 이중 계약 제거. workspace JSON 을 single source 로 두고, 빌드 타임 codegen 으로 인라인.

- 신규: `packages/core-engine/scripts/sync-legal-rates.mjs` — workspace `data/legal-rates/v1.json` 을 읽어 `src/legal-rates.dataset.generated.ts` 출력. `prebuild`/`pretest` 훅으로 자동 실행.
- 신규 (생성됨): `packages/core-engine/src/legal-rates.dataset.generated.ts` — 코드젠 결과 commit. 수동 편집 금지 banner.
- 수정: `packages/core-engine/src/legal-rates.ts` — 인라인 객체 리터럴을 `DEFAULT_LEGAL_RATES_DATASET` import 로 대체. "수동 동기화" 주석 제거. 출처 주석은 유지.
- 수정: `packages/core-engine/package.json` — `sync:legal-rates`, `prebuild`, `pretest` 스크립트 추가.

`tsc rootDir=src` 위반을 피하기 위해 워크스페이스 JSON 을 직접 import 하지 않고 codegen 으로 inline. roadmap §"B8/B9: legal-rate single source and dataset injection" 의 "or generate the TypeScript default dataset from it" 경로 채택.

#### B9 — `calculateInterest(input, deps?: { dataset })`

- 수정: `packages/core-engine/src/interest.ts` — `CalculateInterestDeps` interface 추가, `calculateInterest(input, deps?)` 두 번째 인자. 기본 호출 `calculateInterest(input)` 은 그대로 동작 (default ⇒ bundled dataset).
- 수정: `packages/core-engine/src/segments.ts` — `ResolveSegmentsDeps` 추가, `resolveSegments(input, deps?)`. `loadLegalRates(deps?.dataset)` 로 위임.
- numerator 계산 로직 (`partialDays`, `containsLeapDay` segment 분기) 은 손대지 않음 (C 세션 leap-366 audit 영역).

#### `loadLegalRates(override)` 정리

- `packages/core-engine/src/index.ts` 의 public export 에서 `loadLegalRates` 제거. `@internal` JSDoc 추가. dataset 주입은 이제 `calculateInterest(input, { dataset })` 단일 경로.
- 수정: `packages/core-engine/tests/legal-rates.test.ts` — `loadLegalRates` import 를 `../src/legal-rates` 로 직접. 기존 검증 로직 보존.
- 수정: `packages/core-engine/tests/smoke.test.ts` — surface 검증에서 `loadLegalRates` 제거, `datasetVersionTag` 로 교체.

### 신규 테스트 — `packages/core-engine/tests/dataset-injection.test.ts`

- B8 byte-equivalence 3건:
  - `DEFAULT_LEGAL_RATES_DATASET` deep-equals workspace `data/legal-rates/v1.json`
  - `JSON.stringify` 직렬화 결과 일치
  - dataset version 태그가 v1.json `version` 과 일치
- B9 결정성 4건:
  - default 호출 — bundled dataset, totalInterest 50,000, dataVersion `legal-rates/v1.0.0`
  - custom dataset (civil 7%) — totalInterest 70,000, dataVersion 변경
  - dsA(3%) vs dsB(8%) — totalInterest 가 30,000 vs 80,000 으로 결정적으로 분기
  - 잘못된 dataset (validTo < validFrom) — `calculateInterest` 가 `validate()` 거쳐 거부

### 검증 결과

- `pnpm --filter @lawcalc-kr/core-engine test` — 8 files, 102 tests passed
- `pnpm --filter @lawcalc-kr/core-engine test:golden` — 1 file, 11 tests passed (case-001 ~ case-010 + schema/count)
- `pnpm --filter @lawcalc-kr/core-engine lint` — clean
- `npx tsc --noEmit` (core-engine) — 타입 에러 0
- `apps/desktop` `npx tsc --noEmit` — 타입 에러 0 (calculateInterest deps 가 optional 이라 기존 호출 호환)
- `pnpm -r --if-present lint` — clean (core-engine + desktop)

### 추천 commit 메시지 초안

```
feat(core-engine): B8/B9 dataset single source + inject

- data/legal-rates/v1.json 을 single source 로 두고 codegen 으로
  packages/core-engine/src/legal-rates.dataset.generated.ts 인라인.
  legal-rates.ts 의 인라인 DEFAULT_DATASET 수동 동기화 제거. (B8)
- calculateInterest(input, deps?: { dataset }) 시그니처 추가.
  resolveSegments 도 동일한 deps 로 dataset 위임. 기존 1-arg 호출 호환. (B9)
- loadLegalRates(override) 를 internal-only 로 강등. dataset 주입은
  calculateInterest 단일 경로.
- 신규: tests/dataset-injection.test.ts (byte-equivalence 3 + 결정성 4).

근거: docs/plans/v0.2-roadmap.md §"Phase 2 Entry Order" 1번.
```

(레포 정책상 Co-Authored-By Claude 트레이스 처리는 사용자 commit 시점에 결정)

### 영역 격리 (다중 세션)

- 본 세션이 손댄 파일: `packages/core-engine/{src/legal-rates.ts, src/interest.ts, src/segments.ts, src/index.ts, src/legal-rates.dataset.generated.ts (생성), tests/legal-rates.test.ts, tests/smoke.test.ts, tests/dataset-injection.test.ts (신규), package.json, scripts/sync-legal-rates.mjs (신규)}`, `docs/history/in-progress.md (신규)`.
- 손대지 않음 (B 세션 영역): `apps/desktop/src/lib/lcalc-migrations.ts`, `packages/core-engine/src/disclaimers.ts`, `App.tsx`, `lcalc.rs`.
- 손대지 않음 (C 세션 leap-366 영역): `packages/core-engine/src/days.ts:containsLeapDay`, `interest.ts` numerator 계산.
- for-claude 측 in-progress.md 는 미수정 (C/D 영역).
