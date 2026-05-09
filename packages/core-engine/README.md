# @lawcalc-kr/core-engine

판결금·지연손해금 이자 계산을 위한 순수 TypeScript 엔진. lawcalc-kr 데스크톱 앱의 계산 모듈을
독립 패키지로 분리해, UI 나 Tauri 셸 없이도 단위 테스트와 골든 테스트로 검증할 수 있게 한다.

> **상태 (2026-05-09, v0.2 entry hardening)**: 공개 API 안정. 102 단위 회귀 / 11 골든 게이트 통과. 반올림 정책 v2 (`options.rounding`) + 데이터셋 주입 (`calculateInterest(input, { dataset })`, B9) 도입 완료.

본 엔진의 알고리즘 / 옵션 / 분모 결정 / 구간 분해 / 골든 케이스 매핑 상세는
루트 [`docs/INTEREST_FORMULAS.md`](../../docs/INTEREST_FORMULAS.md) 가 단일 출처다.

## 설치 (워크스페이스)

```bash
# 모노레포 루트에서
pnpm install
```

본 패키지는 사설 워크스페이스 패키지이며 npm 에 별도 배포되지 않는다. 데스크톱 앱
(`apps/desktop`) 이 `workspace:*` 로 import 하며, 외부 npm 배포는 v0.2 이후 검토.

## 빠른 사용

```ts
import {
  calculateInterest,
  type CalcOptions,
  type InterestInput,
  type InterestResult,
} from "@lawcalc-kr/core-engine";

const input: InterestInput = {
  principal: 10_000_000,
  startDate: "2023-01-01",
  endDate: "2024-01-01",
  legalRatePreset: "civil", // 민법 제379조 (연 5%)
  options: {
    mode: "period",
    leapYear: "fixed365",
    includeFirstDay: false,
    // rounding 미지정 시 default "floor" (v1 회귀 호환)
  },
};

const result: InterestResult = calculateInterest(input);
// result.principal      = 10_000_000
// result.totalInterest  = 500_000          (1년 풀, 분모/분모 = 1)
// result.grandTotal     = 10_500_000
// result.dataVersion    = "legal-rates/v1.0.0"
// result.computedAt     = ISO datetime
// result.segments[0]    = {
//   from: "2023-01-01", to: "2024-01-01",
//   days: 365, rate: 0.05,
//   formula: "1년 × 10,000,000원 × 5%",
//   interest: 500_000,
// }
```

`result.segments[i].formula` 는 사람이 읽을 수 있는 적용 식이다 (예: `1,000,000원 × 5% × 100일 / 365`).
원금에 `원`, 이율은 `%`, 일수는 `일` 접미사로 통일 — UI / PDF / CSV 가 그대로 노출해 계산 근거를 투명하게 보여준다.

## Dataset 주입 (`deps.dataset`, v0.2)

`calculateInterest` 두 번째 인자로 `LegalRateDataset` 을 주입할 수 있다 (B9). 미지정 시 빌드 타임에
인라인된 bundled dataset (`data/legal-rates/v1.json` 동등) 으로 동작해 v0.1.x 호출자는 무변경 통과한다.

```ts
import {
  calculateInterest,
  type CalcOptions,
  type InterestInput,
  type LegalRateDataset,
} from "@lawcalc-kr/core-engine";

const input: InterestInput = {
  principal: 1_000_000,
  startDate: "2023-01-01",
  endDate: "2024-01-01",
  legalRatePreset: "civil",
  options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false } satisfies CalcOptions,
};

// (1) 기본 호출 — bundled dataset, dataVersion = "legal-rates/v1.0.0"
const def = calculateInterest(input);

// (2) 주입 — 미래 시점 데이터셋 시뮬레이션, 단위 테스트 결정성
const future: LegalRateDataset = {
  version: "9.9.9-test",
  updatedAt: "2030-01-01",
  rates: [{ code: "civil", label_ko: "test 7%", annualRate: 0.07, validFrom: "1958-02-22", validTo: null }],
};
const inj = calculateInterest(input, { dataset: future });
// inj.totalInterest = 70_000, inj.dataVersion = "legal-rates/v9.9.9-test"
```

주입된 dataset 도 `validate()` 를 통과해야 한다 (code unique, `validTo >= validFrom`, `annualRate >= 0`).
검증 실패 시 `RangeError` / `Error` 가 던져진다.

향후 도메인이 추가되면 `deps` 타입은 `{ datasets: { legalRates?, inheritance? } }` 로 일반화될 수 있다
(roadmap §"Inheritance Dataset-Dependence Spike" 참조). 현 시점은 `legalRates` 단일 dataset 만 다룬다.

## 옵션 (`CalcOptions`)

| 필드              | 값                                                           | 의미                                                                 |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `mode`            | `"period"` \| `"totalDays"`                                  | 기간식 / 총일수식 (법원 매뉴얼 두 정의)                              |
| `leapYear`        | `"fixed365"` \| `"actual"`                                   | 분모 결정 — 365 고정 vs 윤일/윤달 포함 시 366                        |
| `includeFirstDay` | `boolean`                                                    | 초일 산입 여부. 민법 제157조 원칙은 불산입 (`false`)                 |
| `rounding`        | `"floor"` \| `"ceil"` \| `"round"` (선택, default `"floor"`) | 원 단위 끝수 처리 — 절사 / 절상 / 사사오입 (`Calculator.hwp` 매뉴얼) |

`rounding` 미지정 시 `"floor"` 가 적용되어 v1 호환을 유지한다 — `.lcalc` v1 파일,
기존 골든, 외부 호출자가 무변경 통과한다.

## 법정이율 프리셋 (`legalRatePreset`)

| 값               | 근거                          | 변경 이력                                               |
| ---------------- | ----------------------------- | ------------------------------------------------------- |
| `"civil"`        | 민법 제379조                  | 연 5%, 1958-02-22~                                      |
| `"commercial"`   | 상법 제54조                   | 연 6%, 1962-01-20~                                      |
| `"promotion"`    | 소송촉진 등에 관한 특례법 §3  | 연 12%(2019-06-01~) / 15%(2015-10-01~05-31) / 20%(이전) |
| `{ customRate }` | 사용자 지정 (예: 당사자 합의) | 단일 구간 고정                                          |

`promotion` 프리셋은 `[startDate, endDate]` 가 변경일을 가로지르면 자동으로 segment 를
분할한다. 데이터셋 변경 이력의 single source 는 워크스페이스 루트 `data/legal-rates/v1.json` 이며,
`scripts/sync-legal-rates.mjs` 가 빌드 타임 (`prebuild` / `pretest` 훅) 에 `src/legal-rates.dataset.generated.ts`
로 인라인한다. JSON Schema 정의는 [`data/legal-rates/v1.schema.json`](../../data/legal-rates/v1.schema.json) 참조.
`result.dataVersion` 에 식별자(`legal-rates/vX.Y.Z`) 가 기록되어 재현성을 보장한다.

## 명시 segments (`input.segments`)

`legalRatePreset` 대신 구간별 이율을 직접 지정할 수도 있다. 정렬/겹침/공백/`[startDate, endDate]`
를 정확히 덮는지 검증된다.

```ts
const result = calculateInterest({
  principal: 5_000_000,
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  segments: [
    { from: "2024-01-01", to: "2024-06-30", rate: 0.05 },
    { from: "2024-07-01", to: "2024-12-31", rate: 0.1 },
  ],
  options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
});
```

## 디렉토리

```
packages/core-engine/
├── scripts/
│   └── sync-legal-rates.mjs           # data/legal-rates/v1.json → src/legal-rates.dataset.generated.ts
├── src/
│   ├── types.ts                       # 공개 타입 (InterestInput / CalcOptions / InterestResult …)
│   ├── days.ts                        # 일수 계산 (countDays / addDays / addYears / containsLeapDay …)
│   ├── segments.ts                    # resolveSegments — 명시/프리셋/customRate 구간 확정 (deps?: { dataset })
│   ├── legal-rates.ts                 # 데이터셋 검증 + getRateAt / rateHistoryFor / datasetVersionTag
│   ├── legal-rates.dataset.generated.ts  # 자동 생성 — 수동 편집 금지
│   ├── interest.ts                    # calculateInterest(input, deps?) — 메인 엔트리, applyRounding (v2)
│   └── index.ts                       # public surface 재출력
├── tests/
│   ├── days.test.ts
│   ├── legal-rates.test.ts            # 검증/getRateAt/rateHistoryFor (loadLegalRates 는 internal import)
│   ├── segments.test.ts
│   ├── interest.test.ts
│   ├── edge.test.ts                   # 긴 기간/큰 원금/same-day/0 rate/floor 누적
│   ├── rounding.test.ts               # v2 floor/ceil/round 분기 + invariant
│   ├── dataset-injection.test.ts      # B8 byte-equivalence + B9 결정성
│   ├── smoke.test.ts                  # 패키지 surface
│   ├── golden.test.ts                 # GOLDEN_FIXTURE_SCHEMA gate + cases
│   ├── golden/                        # case-001..010.json
│   ├── golden-pending/                # case-008-input.json (외부 캡처 대기)
│   └── import-meta.d.ts               # vite/client 없이 import.meta.glob 시그니처
├── tsconfig.json         # lint/dev (noEmit)
├── tsconfig.build.json   # dist 산출
├── vitest.config.ts      # 단위 테스트
└── vitest.golden.config.ts
```

## 스크립트

| 명령                                                       | 동작                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter @lawcalc-kr/core-engine sync:legal-rates`   | `data/legal-rates/v1.json` → `src/legal-rates.dataset.generated.ts` |
| `pnpm --filter @lawcalc-kr/core-engine build`              | `prebuild` (sync) → `tsc -p tsconfig.build.json` → `dist/`    |
| `pnpm --filter @lawcalc-kr/core-engine lint`               | `eslint src tests`                                            |
| `pnpm --filter @lawcalc-kr/core-engine test`               | `pretest` (sync) → 단위 테스트 (`tests/golden.test.ts` 제외)  |
| `pnpm --filter @lawcalc-kr/core-engine test:golden`        | 골든 테스트                                                   |

루트에서 `pnpm test` / `pnpm test:golden` / `pnpm lint` / `pnpm build` 도 모두 본 패키지를
포함한다 (워크스페이스 단위).

## 골든 케이스

- `tests/golden/case-XXX.json` 에 입력 + 기대 출력으로 동결.
- `case-001..006` 은 엔진 내부 회귀 (`source: engine-internal-w2`).
- `case-007` 은 법원 매뉴얼 (`Interest.hwp`) 예시 직접 인용 (`mode="period"`, `leapYear="actual"`,
  2015-05-01 시작 → 1년 사이 2016-02-29 포함 → 분모 366).
- `case-009 / case-010` 은 후속 회귀 케이스 (반올림 v2 / TIER-A #2 윤년 만기 등).
- `case-008-input.json` (golden-pending) 은 외부 캡처 대기용 입력 시트. 한국 IP / VPN 으로 ejpc.scourt.go.kr
  결과를 받거나 Windows VM 에서 `CourtCalcExSetup.msi` 결과를 받으면 골든화한다.

각 fixture 는 `"schemaVersion": "1"` 을 가지며, `golden.test.ts` 의 `GOLDEN_FIXTURE_SCHEMA`
gate 가 누락 / 불일치를 명시 실패로 잡는다 (v2 옵션 추가 시 fixture 동시 진화 강제).

## 출처 / 참고

근거: [`docs/LEGAL_REFERENCES.md`](../../docs/LEGAL_REFERENCES.md) 참조.

본 엔진은 독립 구현이며, 매뉴얼 본문·MSI 내부 리소스를 포함하지 않는다. 골든 테스트는 결과(JSON)만 비교한다.

## 라이선스

GNU Affero General Public License v3.0 (이상). 루트 `LICENSE` 참조.
