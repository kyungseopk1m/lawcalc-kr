# 이자 계산 공식 (INTEREST_FORMULAS)

`@lawcalc-kr/core-engine` v0.x 가 구현하는 이자 계산 알고리즘과 옵션 의미를 정리한다.
법원 사법정보화실의 「손해배상 등 계산프로그램 사용자설명서」(이자 계산 / 계산기) 매뉴얼을
공개 자료로 참고했으며, 코드 구현은 매뉴얼 인용에 한정해 독립 작성했다 (블랙박스 원칙).

---

## 1. 입력과 옵션

`InterestInput` 의 핵심 필드 :

| 필드                      | 타입                                                       | 설명                                                               |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `principal`               | `number`                                                   | 원금(원). 정수, 양수.                                              |
| `startDate` / `endDate`   | `YYYY-MM-DD`                                               | 이자 기산일 / 종료일. `endDate >= startDate`.                      |
| `segments`                | `RateSegment[]?`                                           | 명시 구간(겹침/공백 없이 `[startDate, endDate]` 정확히 덮어야 함). |
| `legalRatePreset`         | `"civil" \| "commercial" \| "promotion" \| { customRate }` | `segments` 미지정 시 fallback.                                     |
| `options.mode`            | `"period" \| "totalDays"`                                  | 기간식 / 총일수식.                                                 |
| `options.leapYear`        | `"fixed365" \| "actual"`                                   | 분모 기준. 자세한 의미는 §3, §4.                                   |
| `options.includeFirstDay` | `boolean`                                                  | 초일 산입 여부. 민법 제157조 원칙은 불산입(`false`).               |

`legalRatePreset` 코드의 변경 이력은 `data/legal-rates/v1.json` 데이터셋이 관리한다.
계산 결과의 `dataVersion` 필드에 데이터셋 식별자(`legal-rates/vX.Y.Z`)가 기록된다.

---

## 2. 일수 계산 (`countDays`)

```
inclusive = (endDate − startDate).days + 1
days      = includeFirstDay ? inclusive : inclusive − 1
```

- `endDate` 는 항상 산입 (말일 산입).
- `includeFirstDay = false` 가 실무 기본값. 민법 제157조의 "초일 불산입" 원칙과 정합.
- 같은 날짜 + 초일 산입 → `1`, 같은 날짜 + 초일 불산입 → `0`.
- `leapYear` 옵션은 일수 자체에는 영향 없음. 분모(연 일수) 결정에만 사용 (§3, §4).

---

## 3. 총일수식 (`mode = "totalDays"`)

각 구간 이자 :

```
interestRaw = principal × rate × days / denominator
```

분모 결정 :

| `leapYear`   | 규칙                                                      |
| ------------ | --------------------------------------------------------- |
| `"fixed365"` | 항상 365                                                  |
| `"actual"`   | 구간 `[from, to]` 안에 윤일(2/29) 포함 시 366, 아니면 365 |

법원 매뉴얼은 총일수식을 "시작일부터 종료일까지 일수만으로 계산"으로 정의한다.
분모를 365 고정으로 보는 해석이 일반적이며, 본 엔진은 사용자가 `leapYear="actual"`을
선택했을 때 윤일 포함 여부에 따라 366을 적용해 두 해석을 모두 노출한다.

---

## 4. 기간식 (`mode = "period"`)

법원 매뉴얼 인용 :

> 기간식은 시작일부터 종료일까지의 기간이 1년을 넘으면 "1+"로 표기된다.
> 나머지 일수는 365로 나누되, 그 기간에 윤달이 포함되어 있으면 366으로 나눈다.
> 분모가 366이 되는 경우는 시작일을 기준으로 1년이 되는 날 사이에 윤달이 포함되어 있는 경우이다
> (예 : 시작일이 2015. 5. 1.이면 1년이 되는 날은 2016. 4. 30.이고 그 사이에 2016. 2. 29.이
> 포함되어 있기 때문에 분모가 366이 된다).

본 엔진의 알고리즘 (`computeSegmentInterest`):

1. 효과 시작일 = `includeFirstDay ? from : from + 1day`
2. 효과 시작일부터 1년 단위로 풀 1년이 종료일 안에 들어가는 횟수(`fullYears`)를 센다.
3. 풀 1년 1회당 이자 = `principal × rate` (분모/분모 = 1, 윤년 무관).
4. 마지막 1년 미만 구간 `[partialStart, to]` 의 일수 = `partialDays`.
5. 분모 결정 (마지막 미만 구간) :
   - `leapYear="fixed365"` → 365
   - `leapYear="actual"` → `[partialStart, partialStart + 1y − 1day]` 에 2/29 포함 시 366, 아니면 365
6. 합산 : `fullYears × principal × rate + principal × rate × partialDays / denom`

`02-29` 이 비윤년 연도로 떨어질 때는 `02-28` 로 clip 한다 (민법 통설).

매뉴얼이 든 예시는 1년 미만 케이스로, 본 엔진의 `case-007` 골든이 그대로 인용한다.

---

## 5. 구간 분해 (`resolveSegments`)

우선순위 :

1. **`input.segments` 명시** — 정렬, 겹침/공백/범위 검증. `[startDate, endDate]` 를 정확히 덮어야 함.
2. **`legalRatePreset = { customRate }`** — 단일 구간으로 고정.
3. **`legalRatePreset` 코드 (civil/commercial/promotion)** — 데이터셋 변경 이력으로 자동 분할.
   - 예 : `promotion` + `[2015-01-01, 2020-12-31]` → 20% / 15% / 12% 세 구간.

자동 분할은 `rateHistoryFor()` 가 반환하는 평면 이력(오름차순)을 `[startDate, endDate]` 로 clip해 만든다.

---

## 6. 반올림 정책 (v1)

- 각 `segment.interest` : `Math.floor(interestRaw)` — 표시용 절사.
- `result.totalInterest` : `Math.floor(rawTotal)` — 합산 후 절사 (raw 값의 합 → floor).
- 결과적으로 표시 segment 합과 `totalInterest` 가 1원 차이가 날 수 있다 (raw 누적 시 소수 합산).
- 채권자 보수 방향 (절상보다 작음) → 변호사 실무 default 와 정합.

법원 계산기는 절사 / 절상 / 사사오입을 모두 옵션으로 제공한다 (`Calculator.hwp` 매뉴얼).
v2 에서 `options.rounding` 추가 예정 (`floor` / `ceil` / `round`).

---

## 7. 골든 케이스 매핑

| 케이스     | mode      | leapYear | 비고                                                            |
| ---------- | --------- | -------- | --------------------------------------------------------------- |
| `case-001` | totalDays | fixed365 | 민법 5% × 1년                                                   |
| `case-002` | totalDays | fixed365 | 상법 6% × 100일                                                 |
| `case-003` | totalDays | fixed365 | 소촉법 자동 분할 (15% → 12%)                                    |
| `case-004` | totalDays | actual   | 윤년 365일, 분모 366                                            |
| `case-005` | period    | fixed365 | 다년 풀 + 100일 partial                                         |
| `case-006` | totalDays | fixed365 | 명시 segments × 다른 이율                                       |
| `case-007` | period    | actual   | **법원 매뉴얼 예시 직접 인용** (2015-05-01 시작, 1년 사이 윤일) |

`case-007` 만 외부 매뉴얼 인용이고, 나머지는 엔진 내부 회귀 테스트(`source: engine-internal-w2`).
Windows VM 으로 `ejpc.scourt.go.kr` 캡처를 진행하면 후속 케이스에 `source` 를 갱신하며 추가한다.

---

## 8. 미해결 / 후속

- `options.rounding` (절사/절상/사사오입) — v2 옵션화. 사전 설계 §9 참조.
- `mode="totalDays"` + `leapYear="actual"` 의 분모 정의 (구간 윤일 vs 1년 사이 윤일) 는
  매뉴얼이 명시하지 않아 본 엔진은 "구간 안 윤일" 해석을 채택. 법원 결과 캡처 후
  필요 시 보정.
- 다년 + 명시 segments 조합 — segment 단위로 `period` 분해된다 (`tests/edge.test.ts`
  "explicit segments + period mode 조합" 회귀로 고정). UI(B 세션) 도 segment 단위로 결과 표시.

---

## 9. 반올림 정책 v2 (사전 설계, W4 도입 예정)

법원 매뉴얼(`Calculator.hwp`)은 "끝수처리" 옵션으로 절사 / 절상 / 사사오입 세 가지를 모두
제공한다. v1 은 채권자 보수 default 인 절사(`Math.floor`) 단일 정책으로 출발했고,
v2 에서 사용자 선택을 노출한다. 본 절은 도입 시 변경 지점을 미리 고정하기 위한 것이며
코드 수정은 W4 진입 시점에 한 번에 수행한다.

### 9.1 인터페이스 (제안)

```ts
export interface CalcOptions {
  mode: "period" | "totalDays";
  leapYear: "fixed365" | "actual";
  includeFirstDay: boolean;
  /**
   * 원 단위 끝수 처리. 미지정 시 "floor" (v1 default 와 동일 → 모든 v1 골든 회귀 호환).
   * - "floor"  : 절사 (채권자 보수, 매뉴얼 default)
   * - "ceil"   : 절상 (채무자 보수)
   * - "round"  : 사사오입
   */
  rounding?: "floor" | "ceil" | "round";
}
```

핵심 결정:

- 새 필드는 **선택(`?`)** 으로 추가한다. v1 호출자(B/C 세션 mock, .lcalc v1 파일,
  기존 골든 7건 + edge.test.ts 케이스) 가 그대로 통과하도록 default 를 `"floor"` 로 고정.
- `.lcalc` 파일 호환성: `schemaVersion = "1"` 은 그대로 유지하되, `options.rounding` 이
  없으면 로더가 `"floor"` 로 보정해 결과 재현성을 유지. 새 필드를 의식적으로 저장한
  파일은 v1 reader 가 알 수 없는 키를 무시할 수 있도록 C 세션의 `LcalcFile` 가 이미
  `serde_json::Value` 통과 구조로 설계됨 → **Rust 측 변경 없음**.

### 9.2 적용 지점

`packages/core-engine/src/interest.ts` 의 두 곳만 변경:

1. `calculateInterest` 내부의 `Math.floor(interestRaw)` (segment 단위) 와
   `Math.floor(rawTotal)` (총합) 을 다음 헬퍼로 교체:

   ```ts
   function applyRounding(value: number, mode: NonNullable<CalcOptions["rounding"]>): number {
     switch (mode) {
       case "ceil":
         return Math.ceil(value);
       case "round":
         // 0.5 가 정확히 반올림되도록 epsilon 보정 (JS Math.round 는 -0.5 → 0 인 banker 가 아님)
         return Math.round(value);
       case "floor":
       default:
         return Math.floor(value);
     }
   }
   ```

2. `interest.ts` 진입부 :

   ```ts
   const rounding = input.options.rounding ?? "floor";
   ```

`computeSegmentInterest` 는 raw 값만 계산하므로 변경 없음 — 반올림은
`calculateInterest` 가 segment / total 모두 적용한다.

### 9.3 매뉴얼 매핑

| 매뉴얼 표기 (Calculator.hwp) | `options.rounding` |
| ---------------------------- | ------------------ |
| 절사                         | `"floor"`          |
| 절상                         | `"ceil"`           |
| 사사오입                     | `"round"`          |

`Calculator.hwp` 의 추가 옵션(예: 10원 / 100원 단위 절사) 은 v2 에서 도입하지 않는다.
원 단위 끝수만 v2 범위. 더 큰 단위 절사가 실제 캡처에서 필요하다고 확인되면 v3 후보.

### 9.4 골든 / 단위 테스트 영향

- 기존 `case-001..007` 은 모두 `options.rounding` 을 명시하지 않으므로 default `"floor"`
  → totalInterest / segments[i].interest 그대로 통과.
- 외부 캡처(ejpc / Windows VM 결과) 기반 case-008+ 는 매뉴얼 끝수처리 옵션을 그대로
  골든의 `input.options.rounding` 으로 옮긴다. 매뉴얼 default(절사) 와 일치하면
  필드 생략, 다른 옵션을 캡처했다면 명시.
- `edge.test.ts` 의 "floor accumulation" 회귀는 default(`"floor"`) 동작 검증으로 유지.
  v2 에서 `"ceil"` / `"round"` 분기를 위한 별도 단위 테스트 1세트 추가 (각 모드에서
  segment.interest 합과 totalInterest 의 관계, mode 별 sign 검증).

### 9.5 마이그레이션 / 롤아웃 순서

1. W4 시작 시 `CalcOptions` 인터페이스에 `rounding?` 추가 + `applyRounding` 도입.
2. 기존 골든 회귀 — 변경 없이 통과해야 함 (PR 안에서 확인).
3. `INTEREST_FORMULAS.md §6` 본문을 v2 로 업데이트 (현재 §6 의 "v1" 표기 제거).
4. UI(B 세션) `OptionsPanel.tsx` 에 끝수 처리 라디오 3옵션 추가, default `"floor"`.
5. `.lcalc` 입출력은 단순 통과 — Rust 변경 없음. PDF/CSV 출력에는 적용된 끝수 옵션을
   푸터에 한 줄로 표기 (예: `끝수처리: 절사`).
