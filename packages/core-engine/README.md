# @lawcalc-kr/core-engine

판결금·지연손해금 이자 계산을 위한 순수 TypeScript 엔진. lawcalc-kr 데스크톱 앱의 계산 모듈을
독립 패키지로 분리해, UI나 Tauri 셸 없이도 단위 테스트와 골든 테스트로 검증할 수 있게 한다.

> **상태 (2026-05-09)**: W1 스캐폴딩 — 타입 정의와 stub만 노출, 모든 계산 함수는 W2에서 구현된다.

## 설치 (워크스페이스)

```bash
# 모노레포 루트에서
pnpm install
```

본 패키지는 사설 워크스페이스 패키지이며 npm에 별도 배포되지 않는다 (배포 가능한 구조로
유지하지만, MVP 동안은 lawcalc-kr 데스크톱 앱에서만 사용).

## 공개 API (예정)

```ts
import {
  calculateInterest,
  type CalcOptions,
  type InterestInput,
  type InterestResult,
} from "@lawcalc-kr/core-engine";

const input: InterestInput = {
  principal: 10_000_000,
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  legalRatePreset: "civil", // 민법 제379조 (5%)
  options: {
    mode: "period",
    leapYear: "actual",
    includeFirstDay: false,
  },
};

const result: InterestResult = calculateInterest(input);
```

## 디렉토리

```
packages/core-engine/
├── src/
│   ├── types.ts          # 공개 타입
│   ├── days.ts           # 일수 계산 (stub)
│   ├── segments.ts       # 구간 분해 (stub)
│   ├── legal-rates.ts    # 법정이율 데이터 로더 (stub)
│   ├── interest.ts       # 메인 엔트리 (stub)
│   └── index.ts
├── tests/
│   ├── smoke.test.ts     # 패키지 surface 검증
│   ├── golden.test.ts    # 법원 프로그램 골든 테스트 (W2)
│   └── golden/           # case-XXX.json (W2)
├── tsconfig.json         # lint/dev (noEmit)
├── tsconfig.build.json   # dist 생성
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

## 출처 / 참고

- 근거: 대법원 손해배상 등 계산프로그램 매뉴얼 (Interest.hwp / Calculator.hwp)
- 공식 사이트: http://ejpc.scourt.go.kr/
- 적용 조항: 민법 제379조 / 상법 제54조 / 소송촉진 등에 관한 특례법 제3조

본 엔진은 법원 공식 프로그램과 무관한 독립 구현이며, 매뉴얼 본문이나 MSI 내부 리소스를
포함하지 않는다. 골든 테스트는 결과(JSON)만 비교한다.

## 라이선스

Business Source License 1.1 → 2031-05-09 자동 Apache-2.0 전환. 루트 `LICENSE` 참조.
