# 아키텍처

lawcalc-kr 는 한국 법률 계산을 위한 로컬 우선(local-first) 데스크톱 애플리케이션입니다. 현재 버전은 판결금 이자, 지연손해금, 상속분 간이 계산, 소송비용 산정을 다룹니다.

## 원칙

- 모든 사건 데이터는 사용자 기기 안에만 둡니다.
- 계산 단계를 감사 가능하게(auditable) 유지합니다 — 입력값, 중간 행, 산식 또는 지분, 합계, 데이터 버전이 항상 보여야 합니다.
- 법령·도메인 데이터는 UI 텍스트로 하드코딩하지 않고 버전 관리되는 source data 로 다룹니다.
- 계산 엔진은 순수 TypeScript 로 유지해 Tauri 와 독립적으로 테스트할 수 있게 합니다.
- Tauri 명령은 파일 IO, PDF·export, 네이티브 다이얼로그, 데스크톱 패키징 같은 좁은 영역에만 둡니다.

## 워크스페이스 구조

```text
lawcalc-kr/
├── apps/
│   └── desktop/          # React + Vite + Tauri 데스크톱 앱
├── packages/
│   └── core-engine/      # 순수 TypeScript 계산 엔진
├── data/
│   └── legal-rates/      # 버전 관리되는 법정이율 데이터셋
├── tests/
│   └── golden/           # 법원 프로그램 결과 비교 케이스
└── docs/
```

위 디렉터리는 구현 세션별로 소유자가 다릅니다. D 영역이 저장소 인프라, lockfile, CI, 릴리스 워크플로, changelog, README, 최상위 docs 를 담당합니다.

## 데이터 흐름

1. 데스크톱 UI 가 도메인별 입력과 노트를 수집합니다.
2. `packages/core-engine` 이 입력을 검증하고 순수 TypeScript 도메인 엔진을 실행합니다.
3. 엔진은 계산 트레이스, 합계 또는 지분, 면책 고지, 데이터 버전을 포함한 구조화 결과를 반환합니다.
4. UI 가 결과 표와 법령 출처를 렌더링합니다.
5. Tauri 명령이 로컬 저장/불러오기, CSV/PDF export, 네이티브 다이얼로그를 처리합니다.

## 현재 통합 표면

- `@lawcalc-kr/core-engine` 은 이자 관련 타입/함수 (`InterestInput`, `InterestResult`, `calculateInterest`) 와 상속 관련 타입/함수 (`InheritanceInput`, `InheritanceResult`, `calculateInheritance`) 를 공개합니다.
- `apps/desktop` 은 React 19 + Vite 셸이며, 이자 / 상속 / 소송비용 계산기 뷰가 각각 분리되어 있습니다.
- `apps/desktop/src/lib/ipc.ts` 가 UI 동작을 Tauri 명령으로 매핑합니다 — 이자/상속/소송비용 PDF·CSV export, `.lcalc` 저장/불러오기, 클립보드 복사.
- Rust 명령은 의도적으로 좁게 유지합니다. 로컬 파일 IO, 네이티브 다이얼로그, PDF·export 백엔드, 클립보드 통합에 집중하고 도메인 계산 정책은 두지 않습니다.

## 모듈 책임

| 모듈                     | 담당                                                                                                     | 담당하지 않음                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/core-engine`   | 입력 검증, 일수 계산 규칙, 이율 구간 분해, 상속 지분 분배, 결과 합계/지분, 산식 문자열, 데이터 버전 출력 | 브라우저 상태, 파일 다이얼로그, PDF 렌더링, 네이티브 클립보드 |
| `apps/desktop/src`       | 폼 상태, 결과 표시, 접근성, 사용자가 트리거하는 export 동작                                              | Tauri 명령 외부의 파일시스템 쓰기, 계산 규칙 중복 구현        |
| `apps/desktop/src-tauri` | 로컬 파일 IO, 네이티브 다이얼로그, export 백엔드, 클립보드 통합, 패키징 메타데이터                       | 법정이율 계산 정책, UI 전용 포매팅                            |
| `data/legal-rates`       | 버전 관리된 법정이율 source data 와 출처 인용                                                            | 런타임 사용자 사건 데이터                                     |
| `docs` / CI              | 운영 계약, 릴리스 체크리스트, lockfile 및 워크플로 가드레일                                              | A/B/C 영역이 소유하는 기능 구현 세부                          |

UI 는 표시용으로 숫자·날짜를 포매팅할 수 있지만, 계산에 영향을 주는 반올림과 일수 선택은 반드시 엔진 결과에서 가져와야 합니다. 이를 통해 PDF/CSV/클립보드 출력이 화면 표와 동일하게 정렬됩니다.

## `.lcalc` 파일 형식

`.lcalc` 파일은 재현 가능한 로컬 저장을 위한 JSON 문서입니다. 스키마는 다음을 포함해야 합니다.

- `schemaVersion`, `kind`, 도메인별 `payload`
- `payload.appVersion`, `payload.dataVersion`, `payload.createdAt`
- core-engine 공개 타입과 일치하는 `payload.input` 과 `payload.result`
- 선택적 `note`
- 계산과 함께 표시·export 된 면책 고지 본문

포맷은 로컬 우선이며 네트워크 접근을 요구하지 않습니다. 하위 호환 reader 는 가능하면 알 수 없는 필드를 보존합니다.

예시:

```json
{
  "schemaVersion": "2",
  "kind": "interest",
  "payload": {
    "appVersion": "0.2.5",
    "dataVersion": "legal-rates/v1.0.0",
    "createdAt": "2026-05-10T12:34:56+09:00",
    "input": {
      "principal": 10000000,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "legalRatePreset": "civil",
      "options": {
        "mode": "period",
        "leapYear": "fixed365",
        "includeFirstDay": false,
        "rounding": "floor"
      }
    },
    "options": {
      "mode": "period",
      "leapYear": "fixed365",
      "includeFirstDay": false,
      "rounding": "floor"
    },
    "result": {
      "principal": 10000000,
      "segments": [],
      "totalInterest": 0,
      "grandTotal": 10000000,
      "dataVersion": "legal-rates/v1.0.0"
    },
    "note": "optional user note",
    "disclaimer": "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다."
  }
}
```

호환성 규칙:

- reader 에 마이그레이션 로직이 필요할 때만 `schemaVersion` 을 올립니다.
- 승격된 파일에 `dataVersion` 누락 시 임의로 추정하지 않습니다.
- `note` 는 가능한 범위에서 보존합니다.
- 파싱 가능한 도메인 `payload.input` 이 없는 파일은 거부합니다.
- v0.1.x 의 이자 전용 `schemaVersion: "1"` 파일은 로드 시 v2 의 `kind: "interest"` envelope 로 마이그레이션합니다.

## PDF 엔진

PDF export 는 [`printpdf`](https://crates.io/crates/printpdf) 0.7 을 사용합니다. `typst-as-library` 나 HTML-to-PDF 경로 대신 이 라이브러리를 선택한 이유는 보고서가 단일 페이지 표 형식이기 때문입니다 — typst 컴파일러는 우리가 쓰지 않을 레이아웃 기능 때문에 데스크톱 바이너리를 수십 MB 부풀리고, Chromium 기반 파이프라인은 로컬 우선 앱에 런타임 의존성을 추가합니다. `printpdf` 는 순수 Rust 이며, 안정적인 수동 레이아웃 API 와 임베드된 TrueType 폰트 + subset 을 지원합니다. Pretendard Regular (SIL OFL 1.1) 는 `apps/desktop/src-tauri/assets/fonts/Pretendard-Regular.ttf` 로 함께 배포되며 `include_bytes!` 로 임베드되어 호스트 폰트 캐시에 의존하지 않고 한글 글리프가 렌더링됩니다. OFL 본문은 바이너리 옆에 `Pretendard-OFL.txt` 로 보존됩니다. exporter 는 제목, 요약 블록, 구간 표, 선택적 노트, 그리고 면책 고지 / `dataVersion` / `computedAt` 이 포함된 footer 를 작성합니다 — 모두 화면에 표시되는 것과 동일한 필드입니다.

## 비목표

- 본 프로젝트는 법원이 배포한 어떤 실행파일의 클론이나 포팅이 아닙니다.
- 공식 설치 파일에 대한 역공학, 디컴파일, 패치, 리소스 추출은 허용하지 않습니다.
- 공식 매뉴얼과 설치 파일은 본 저장소에 재배포하지 않습니다.
