# @lawcalc-kr/core-engine

판결금·지연손해금 이자 계산을 위한 순수 TypeScript 엔진. lawcalc-kr 데스크톱 앱의 계산 모듈을
독립 패키지로 분리해, UI 나 Tauri 셸 없이도 단위 테스트와 골든 테스트로 검증할 수 있게 한다.

> **상태 (2026-05-09, v0.1.0 알파 게이트)**: 공개 API 안정. 7 골든 케이스 / 91 단위 회귀 / 9 골든 게이트 통과. 반올림 정책 v2 (`options.rounding`) 도입 완료.

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
분할한다. 데이터셋 변경 이력은 `data/legal-rates/v1.json` 에서 관리되며,
`result.dataVersion` 에 식별자(`legal-rates/vX.Y.Z`)가 기록되어 재현성을 보장한다.

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
├── src/
│   ├── types.ts          # 공개 타입 (InterestInput / CalcOptions / InterestResult …)
│   ├── days.ts           # 일수 계산 (countDays / addDays / addYears / containsLeapDay …)
│   ├── segments.ts       # resolveSegments — 명시/프리셋/customRate 구간 확정
│   ├── legal-rates.ts    # 법정이율 v1 데이터 로더 (loadLegalRates / getRateAt / rateHistoryFor)
│   ├── interest.ts       # calculateInterest — 메인 엔트리, applyRounding (v2)
│   └── index.ts          # public surface 재출력
├── tests/
│   ├── days.test.ts          (18 tests)
│   ├── legal-rates.test.ts   (14 tests)
│   ├── segments.test.ts      (12 tests)
│   ├── interest.test.ts      (13 tests)
│   ├── edge.test.ts          (15 tests, 긴 기간/큰 원금/same-day/0 rate/floor 누적)
│   ├── rounding.test.ts      (17 tests, v2 floor/ceil/round 분기 + invariant)
│   ├── smoke.test.ts         (2 tests, 패키지 surface)
│   ├── golden.test.ts        (1 meta + 1 schemaVersion gate + 7 cases)
│   ├── golden/               case-001..007.json
│   ├── golden-pending/       case-008-input.json (외부 캡처 대기)
│   └── import-meta.d.ts      vite/client 없이 import.meta.glob 시그니처
├── tsconfig.json         # lint/dev (noEmit)
├── tsconfig.build.json   # dist 산출
├── vitest.config.ts      # 단위 테스트
└── vitest.golden.config.ts
```

## 스크립트

| 명령                                                | 동작                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @lawcalc-kr/core-engine build`       | `tsc -p tsconfig.build.json` → `dist/`    |
| `pnpm --filter @lawcalc-kr/core-engine lint`        | `eslint src tests`                        |
| `pnpm --filter @lawcalc-kr/core-engine test`        | 단위 테스트 (`tests/golden.test.ts` 제외) |
| `pnpm --filter @lawcalc-kr/core-engine test:golden` | 골든 테스트                               |

루트에서 `pnpm test` / `pnpm test:golden` / `pnpm lint` / `pnpm build` 도 모두 본 패키지를
포함한다 (워크스페이스 단위).

## 골든 케이스

- 7 케이스 모두 `tests/golden/case-XXX.json` 에 입력 + 기대 출력으로 동결.
- `case-001..006` 은 엔진 내부 회귀 (`source: engine-internal-w2`).
- `case-007` 은 법원 매뉴얼 (`Interest.hwp`) 예시 직접 인용 (`mode="period"`, `leapYear="actual"`,
  2015-05-01 시작 → 1년 사이 2016-02-29 포함 → 분모 366).
- `case-008-input.json` 은 외부 캡처 대기용 입력 시트. 한국 IP / VPN 으로 ejpc.scourt.go.kr
  결과를 받거나 Windows VM 에서 `CourtCalcExSetup.msi` 결과를 받으면 골든화한다.

각 fixture 는 `"schemaVersion": "1"` 을 가지며, `golden.test.ts` 의 `GOLDEN_FIXTURE_SCHEMA`
gate 가 누락 / 불일치를 명시 실패로 잡는다 (v2 옵션 추가 시 fixture 동시 진화 강제).

## 출처 / 참고

근거: [`docs/LEGAL_REFERENCES.md`](../../docs/LEGAL_REFERENCES.md) 참조.

본 엔진은 독립 구현이며, 매뉴얼 본문·MSI 내부 리소스를 포함하지 않는다. 골든 테스트는 결과(JSON)만 비교한다.

## 라이선스

Business Source License 1.1 → 2031-05-09 자동 Apache-2.0 전환. 루트 `LICENSE` 참조.
