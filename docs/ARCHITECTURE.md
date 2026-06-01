# 아키텍처

lawcalc-kr 는 한국 법률 계산을 위한 로컬 우선(local-first) 데스크톱 애플리케이션입니다. 현재 버전은 판결금 이자·지연손해금, 상속분 간이 계산, 소송비용 산정, 변제충당, 손해배상(자동차·부상) 다섯 도메인을 다룹니다.

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
│   └── desktop/                  # React + Vite + Tauri 데스크톱 앱
├── packages/
│   ├── core-engine/              # 이자·상속·소송비용·변제충당 엔진 + 공통 유틸
│   ├── compensation/             # 손해배상(자×부상) 엔진
│   └── datasets-compensation/    # 손해배상 데이터셋 로더 + stale-badge 유틸
├── data/                         # 버전 관리되는 데이터셋 단일 출처 (legal-rates 등)
├── scripts/
└── docs/
```

손해배상 도메인은 v0.5.2 에서 `@lawcalc-kr/compensation` 과 `@lawcalc-kr/datasets-compensation` 두 패키지로 분리했습니다. `@lawcalc-kr/core-engine` 은 나머지 네 도메인과 공통 유틸(`STANDARD_DISCLAIMER`, `addYears`, `IsoDate` 등)을 보유합니다.

## 데이터 흐름

1. 데스크톱 UI 가 도메인별 입력과 노트를 수집합니다.
2. core-engine 또는 compensation 패키지가 입력을 검증하고 순수 TypeScript 도메인 엔진을 실행합니다.
3. 엔진은 계산 트레이스, 합계 또는 지분, 면책 고지, 데이터 버전을 포함한 구조화 결과를 반환합니다.
4. UI 가 결과 표와 법령 출처를 렌더링합니다.
5. Tauri 명령이 로컬 저장/불러오기, CSV/PDF export, 네이티브 다이얼로그를 처리합니다.

## 현재 통합 표면

- `@lawcalc-kr/core-engine` 은 이자·상속·소송비용·변제충당의 입력/결과 타입과 계산 함수(`calculateInterest`, `calculateInheritance`, `computeLitigationCost`, `computeAppropriation`)를 공개합니다.
- `@lawcalc-kr/compensation` 은 손해배상 엔진(`computeCompensation`)을, `@lawcalc-kr/datasets-compensation` 은 데이터셋 로더 4종과 `computeStaleBadge` 를 공개합니다.
- `apps/desktop` 은 React 19 + Vite 셸이며, 다섯 도메인 계산기 뷰가 각각 분리되어 있습니다.
- `apps/desktop/src/lib/ipc.ts` 가 UI 동작을 Tauri 명령으로 매핑합니다 — 도메인별 PDF·CSV export, `.lcalc` 저장/불러오기, 클립보드 복사.
- Rust 명령은 의도적으로 좁게 유지합니다. 로컬 파일 IO, 네이티브 다이얼로그, PDF·export 백엔드, 클립보드 통합에 집중하고 도메인 계산 정책은 두지 않습니다.

## 모듈 책임

| 모듈                             | 담당                                                                                     | 담당하지 않음                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/core-engine`           | 이자·상속·소송비용·변제충당 입력 검증, 계산 규칙, 결과 합계/지분, 산식, 데이터 버전 출력 | 브라우저 상태, 파일 다이얼로그, PDF 렌더링, 네이티브 클립보드 |
| `packages/compensation`          | 손해배상(자×부상) 일실수입·호프만 한도·과실상계·공제 계산                                | UI 상태, 파일 IO, 데이터셋 원본 보관                          |
| `packages/datasets-compensation` | 손해배상 데이터셋 로딩, 버전 태그, 스냅샷 경과 배지 계산                                 | 도메인 계산 정책, UI 포매팅                                   |
| `apps/desktop/src`               | 폼 상태, 결과 표시, 접근성, 사용자가 트리거하는 export 동작                              | Tauri 명령 외부의 파일시스템 쓰기, 계산 규칙 중복 구현        |
| `apps/desktop/src-tauri`         | 로컬 파일 IO, 네이티브 다이얼로그, export 백엔드, 클립보드 통합, 패키징 메타데이터       | 도메인 계산 정책, UI 전용 포매팅                              |
| `data/`                          | 버전 관리된 데이터셋 source data 와 출처 인용                                            | 런타임 사용자 사건 데이터                                     |

UI 는 표시용으로 숫자·날짜를 포매팅할 수 있지만, 계산에 영향을 주는 반올림과 일수 선택은 반드시 엔진 결과에서 가져와야 합니다. 이를 통해 PDF/CSV/클립보드 출력이 화면 표와 동일하게 정렬됩니다.

## `.lcalc` 파일 형식

`.lcalc` 파일은 재현 가능한 로컬 저장을 위한 JSON 문서입니다. 현재 스키마는 `schemaVersion: "3"` envelope 이며 다음을 포함해야 합니다.

- `schemaVersion`, `kind`, 도메인별 `payload`
- envelope 레벨의 `envelopeFeatures` (`"{domain}@{engineMajor}"` 형식 capability id 배열) 과 `dataVersions` (도메인 키별 데이터셋 버전)
- `payload.appVersion`, `payload.createdAt`
- 공개 엔진 타입과 일치하는 `payload.input` 과 `payload.result`
- 선택적 `note`
- 계산과 함께 표시·export 된 면책 고지 본문

포맷은 로컬 우선이며 네트워크 접근을 요구하지 않습니다. 하위 호환 reader 는 가능하면 알 수 없는 필드를 보존합니다.

예시:

```json
{
  "schemaVersion": "3",
  "kind": "interest",
  "envelopeFeatures": ["interest@1"],
  "dataVersions": { "interest": "legal-rates/v1.0.0" },
  "payload": {
    "appVersion": "0.5.2",
    "createdAt": "2026-05-26T12:34:56+09:00",
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
- envelope 레벨 `dataVersions` 가 source of truth 이며, 승격된 파일에 누락 시 임의로 추정하지 않습니다.
- `note` 는 가능한 범위에서 보존합니다.
- 파싱 가능한 도메인 `payload.input` 이 없는 파일은 거부합니다.
- 알 수 없는 capability id 가 `envelopeFeatures` 에 포함된 파일은 reader 가 즉시 거부합니다 (fast-reject).
- v0.1.x 의 이자 전용 `schemaVersion: "1"` 파일은 로드 시 v2 의 `kind: "interest"` envelope 로 마이그레이션되고, 이어서 v3 envelope (`envelopeFeatures: ["interest@1"]`, `dataVersions.interest` hoist) 으로 추가 마이그레이션됩니다.

## PDF 엔진

PDF export 는 [`printpdf`](https://crates.io/crates/printpdf) 0.7 을 사용합니다. `typst-as-library` 나 HTML-to-PDF 경로 대신 이 라이브러리를 선택한 이유는 보고서가 단일 페이지 표 형식이기 때문입니다 — typst 컴파일러는 우리가 쓰지 않을 레이아웃 기능 때문에 데스크톱 바이너리를 수십 MB 부풀리고, Chromium 기반 파이프라인은 로컬 우선 앱에 런타임 의존성을 추가합니다. `printpdf` 는 순수 Rust 이며, 안정적인 수동 레이아웃 API 와 임베드된 TrueType 폰트 + subset 을 지원합니다. Pretendard Regular (SIL OFL 1.1) 는 `apps/desktop/src-tauri/assets/fonts/Pretendard-Regular.ttf` 로 함께 배포되며 `include_bytes!` 로 임베드되어 호스트 폰트 캐시에 의존하지 않고 한글 글리프가 렌더링됩니다. OFL 본문은 바이너리 옆에 `Pretendard-OFL.txt` 로 보존됩니다. exporter 는 제목, 요약 블록, 구간 표, 선택적 노트, 그리고 면책 고지 / `dataVersion` / `computedAt` 이 포함된 footer 를 작성합니다 — 모두 화면에 표시되는 것과 동일한 필드입니다.

## 비목표

- 본 프로젝트는 법원이 배포한 어떤 실행파일의 클론이나 포팅이 아닙니다.
- 공식 설치 파일에 대한 역공학, 디컴파일, 패치, 리소스 추출은 허용하지 않습니다.
- 공식 매뉴얼과 설치 파일은 본 저장소에 재배포하지 않습니다.
