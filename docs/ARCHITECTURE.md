# 아키텍처

lawcalc-kr는 한국 법률 계산을 로컬에서 다루는 데스크톱 앱입니다. 현재 버전은 판결금 이자·지연손해금, 상속분 간이 계산, 소송비용 산정, 변제충당, 손해배상(자동차·산재, 부상·사망 및 기타손해) 다섯 금액 도메인과 기간 계산·불변기한 두 날짜 도메인, 그리고 도구 탭(송달 효력·상소기간, 미결구금일수, 계산기, 여명표·노임표, 민사·형사서류 안내, 관할법원 찾기, 우편번호)을 다룹니다.

## 원칙

- 사건 데이터는 내 컴퓨터 밖으로 나가지 않습니다.
- 계산 단계를 검산할 수 있게 유지합니다. 입력값, 중간 행, 산식 또는 지분, 합계, 데이터 버전이 항상 보여야 합니다.
- 법령·도메인 데이터는 UI 텍스트로 하드코딩하지 않고 버전 관리되는 원본 데이터로 다룹니다.
- 계산 엔진은 순수 TypeScript로 유지해 Tauri와 독립적으로 테스트할 수 있게 합니다.
- Tauri 명령은 파일 IO, PDF·export, 네이티브 다이얼로그, 데스크톱 패키징 같은 좁은 영역에만 둡니다.

## 워크스페이스 구조

```text
lawcalc-kr/
├── apps/
│   └── desktop/                  # React + Vite + Tauri 데스크톱 앱
├── packages/
│   ├── core-engine/              # 이자·상속·소송비용·변제충당·기간·불변기한 엔진, 도구 모듈 + 공통 유틸
│   ├── compensation/             # 손해배상 엔진 (부상·사망·산재·기타손해)
│   └── datasets-compensation/    # 손해배상 데이터셋 로더 + stale-badge 유틸
├── data/                         # 버전 관리되는 데이터셋 단일 출처 (아래 데이터셋 절)
├── scripts/
└── docs/
```

손해배상 도메인은 v0.5.2에서 `@lawcalc-kr/compensation`과 `@lawcalc-kr/datasets-compensation` 두 패키지로 분리했습니다. `@lawcalc-kr/core-engine`은 나머지 도메인과 도구 모듈, 공통 유틸(`STANDARD_DISCLAIMER`, `addYears`, `IsoDate` 등)을 보유합니다.

## 데이터 흐름

1. 데스크톱 UI가 도메인별 입력과 노트를 수집합니다.
2. core-engine 또는 compensation 패키지가 입력을 검증하고 순수 TypeScript 도메인 엔진을 실행합니다.
3. 엔진은 계산 트레이스, 합계 또는 지분, 면책 고지, 데이터 버전을 포함한 구조화 결과를 반환합니다.
4. UI가 결과 표와 법령 출처를 렌더링합니다.
5. Tauri 명령이 로컬 저장/불러오기, CSV/PDF export, 네이티브 다이얼로그를 처리합니다.

## 현재 구성

- `@lawcalc-kr/core-engine`은 이자·상속·소송비용·변제충당의 입력/결과 타입과 계산 함수(`calculateInterest`, `calculateInheritance`, `computeLitigationCost`, `computeAppropriation`)를 공개합니다. 같은 패키지의 모듈은 다음과 같습니다.
  - `inheritance/old-law.ts`: 1960-01-01부터 1990-12-31까지 사망한 사건의 구법(제정 민법, 1977년 개정 민법) 상속분.
  - `litigation-cost/`: 인지대·송달료·변호사보수 외에 부동산 소가(`compute-case-value.ts`), 청구변경 인지액(`compute-claim-amendment.ts`), 소송비용확정(`compute-cost-assessment.ts`).
  - `appropriation/`: 여러 번 변제, 이자제한법 최고이자율(`interest-limits` 데이터셋), 선이자 공제, 상계충당, 제479조 다수 채무 충당 순서.
  - `period/`·`deadline/`: 기간 계산, 법정기한, 공휴일 판정(`holidays.ts`), 송달 효력·상소기간(`period/service-effect.ts`).
  - `detention.ts`(미결구금일수), `calculator.ts`(분수 정확 계산기), `filings/`(민사·형사서류 인지액 표), `jurisdiction/`(관할법원), `postal/`(우편번호 요약).
- `@lawcalc-kr/compensation`은 손해배상 엔진(`computeCompensation`)과 조정안·판결 이유 형식 문단(`mediation/`)을, `@lawcalc-kr/datasets-compensation`은 데이터셋 로더 4종과 `computeStaleBadge`를 공개합니다.
- `apps/desktop`은 React 19 + Vite 셸이며, 도메인 계산기 뷰와 도구 탭의 하위 뷰가 각각 분리되어 있습니다.
- `apps/desktop/src/lib/ipc.ts`가 UI 동작을 Tauri 명령으로 매핑합니다. 도메인별 PDF·CSV·HWPX export, `.lcalc` 저장/불러오기, 클립보드 복사(텍스트와 표 HTML)입니다.
- Rust 명령의 역할은 좁게 한정합니다. 로컬 파일 IO, 네이티브 다이얼로그, PDF·export 백엔드, 클립보드 통합에 집중하고 도메인 계산 정책은 두지 않습니다.

## 모듈 책임

| 모듈                             | 담당                                                                                     | 담당하지 않음                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/core-engine`           | 손해배상 외 도메인과 도구의 입력 검증, 계산 규칙, 결과 합계/지분, 산식, 데이터 버전 출력 | 브라우저 상태, 파일 다이얼로그, PDF 렌더링, 네이티브 클립보드 |
| `packages/compensation`          | 손해배상(부상·사망·산재·기타손해) 일실수입·호프만 한도·과실상계·공제 계산                | UI 상태, 파일 IO, 데이터셋 원본 보관                          |
| `packages/datasets-compensation` | 손해배상 데이터셋 로딩, 버전 태그, 스냅샷 경과 배지 계산                                 | 도메인 계산 정책, UI 포매팅                                   |
| `apps/desktop/src`               | 폼 상태, 결과 표시, 접근성, 사용자가 트리거하는 export 동작                              | Tauri 명령 외부의 파일시스템 쓰기, 계산 규칙 중복 구현        |
| `apps/desktop/src-tauri`         | 로컬 파일 IO, 네이티브 다이얼로그, export 백엔드, 클립보드 통합, 패키징 메타데이터       | 도메인 계산 정책, UI 전용 포매팅                              |
| `data/`                          | 버전 관리된 데이터셋 source data와 출처 인용                                             | 런타임 사용자 사건 데이터                                     |

UI는 표시용으로 숫자·날짜를 포매팅할 수 있지만, 계산에 영향을 주는 반올림과 일수 선택은 반드시 엔진 결과에서 가져와야 합니다. 이렇게 해야 PDF/CSV/클립보드 출력이 화면 표와 항상 일치합니다.

## 데이터셋

모든 데이터셋의 단일 출처는 `data/<id>/v<N>.json`이고, 빌드 때 `pnpm sync:datasets`가 각 패키지의 `*.generated.ts`로 옮깁니다. 출처·라이선스 판단·스냅샷 일자는 각 JSON의 메타 필드에 있습니다.

| 데이터셋                 | 버전          | 출처                                                                                                         | 라이선스 메모                                                             |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `legal-rates`            | 1.0.1         | 민법·상법·소송촉진 등에 관한 특례법 이율 연혁                                                                | 법령(저작권법 제7조 제1호)                                                |
| `interest-limits`        | 1.0.1         | 「이자제한법 제2조제1항의 최고이자율에 관한 규정」 연혁 4개 판. 변제충당의 최고이자율에 씁니다               | 법령(저작권법 제7조 제1호)                                                |
| `stamp-duty`             | 1.3.0         | 「민사소송 등 인지법」·인지규칙·민사조정규칙                                                                 | 법령                                                                      |
| `delivery`               | 1.4.0         | 송달료규칙, 「송달료규칙의 시행에 따른 업무처리요령」 별표 1(사건구분 41종, 사건부호표 94행)                 | 법령·재판예규                                                             |
| `lawyer-fee`             | 1.3.0         | 「변호사보수의 소송비용 산입에 관한 규칙」 연혁 7개 판(대법원규칙 제758호부터 제2936호까지)                  | 법령                                                                      |
| `case-value`             | 1.0.0         | 「민사소송 등 인지규칙」 제10조·제12조·제13조                                                                | 법령                                                                      |
| `holidays`               | 1.0.0         | 한국천문연구원 특일정보(공공데이터포털), 「관공서의 공휴일에 관한 규정」                                     | 이용허락범위 제한 없음                                                    |
| `deadlines`              | 1.1.0         | 민사소송법 등 9개 절차법의 기한 조문                                                                         | 법령                                                                      |
| `court-filings-civil`    | 1.0.1         | 「민사접수서류에 붙일 인지액 및 그 편철방법 등에 관한 예규」(재민 91-1, 재판예규 제1916호) 별표 362행        | 저작권법 제7조 제2호로 봄(재판예규를 훈령에 준하는 것으로 보는 것은 해석) |
| `court-filings-criminal` | 1.0.0         | 「형사소송서류의 전산입력 및 편철방법에 대한 예규」(재형 2003-11, 재판예규 제1968-17호) 별표 1~7, 148행      | 같음                                                                      |
| `court-jurisdiction`     | 1.0.0         | 「각급 법원의 설치와 관할구역에 관한 법률」 별표 3·7·10, 시행일자별 본문                                     | 법령. 가정법원(별표 5)은 담지 않음                                        |
| `postal-codes`           | 1.1.0         | 우정사업본부 우편번호 고시파일 "지역별 주소 DB"(2026-10-08 기준)를 시·도, 시·군·구, 읍·면·동, 리 단위로 요약 | 공공데이터포털 이용허락범위 제한 없음. 건물 단위 자료는 싣지 않음         |
| `labor-rates`            | 1.1.0         | 대한건설협회 건설업 임금실태조사 보고서(1991~2026년 70개 반기)                                               | 명시적 재배포 라이선스 미게시, 지정통계. 출처 명시, 직접 입력 병행        |
| `life-expectancy`        | 1.1.0         | 통계청 KOSIS 생명표(1991~2023년 사망률 기준)                                                                 | KOSIS 자유 이용(출처표시·왜곡 금지)                                       |
| `hoffman` / `leibniz`    | 1.1.0 / 1.0.0 | 할인율 연 5% 단리·복리 현가 공식                                                                             | 수학 공식·표(사실의 표시)                                                 |

## `.lcalc` 파일 형식

`.lcalc` 파일은 계산을 그대로 다시 열 수 있게 로컬에 저장하는 JSON 문서입니다. 현재 스키마는 `schemaVersion: "3"` envelope 이며 다음을 포함해야 합니다.

- `schemaVersion`, `kind`, 도메인별 `payload`
- envelope 레벨의 `envelopeFeatures` (`"{domain}@{engineMajor}"` 형식 capability id 배열)과 `dataVersions` (도메인 키별 데이터셋 버전)
- `payload.appVersion`, `payload.createdAt`
- 공개 엔진 타입과 일치하는 `payload.input`과 `payload.result`
- 선택적 `note`
- 계산과 함께 표시·export 된 면책 고지 본문

이 포맷은 네트워크 없이 파일을 읽고 씁니다. 하위 호환 reader는 가능하면 알 수 없는 필드를 보존합니다.

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

- reader에 마이그레이션 로직이 필요할 때만 `schemaVersion`을 올립니다.
- envelope 레벨 `dataVersions`가 source of truth 이며, 승격된 파일에 누락 시 임의로 추정하지 않습니다.
- `note`는 가능한 범위에서 보존합니다.
- 파싱 가능한 도메인 `payload.input`이 없는 파일은 거부합니다.
- 알 수 없는 capability id가 `envelopeFeatures`에 포함된 파일은 reader가 즉시 거부합니다 (fast-reject). 이전 버전 앱은 이 경로로 업데이트 안내를 띄웁니다.
- 파일을 열면 저장된 `payload.result`를 그대로 보여 주지 않고 현재 엔진으로 다시 계산하며, 저장 당시 결과와 다르면 두 값을 함께 알립니다.

현재 reader가 받는 capability와 writer가 올리는 조건은 다음과 같습니다. writer는 새 입력 키를 쓴 경우에만 높은 번호를 붙여, 그 키를 모르는 이전 앱이 다른 금액을 내지 않게 합니다.

| capability                | 새로 담는 입력                                                           |
| ------------------------- | ------------------------------------------------------------------------ |
| `interest@1`              | 이자                                                                     |
| `inheritance@2`           | 상속포기·대습 원인                                                       |
| `inheritance@3`           | 상속재산 금액                                                            |
| `inheritance@4`           | 1991년 전 사망의 구법 입력(성별·동일가적·호주상속인·처/남편)             |
| `litigation-cost@2`       | 간주 소가·전체 소가·원신청서 인지액                                      |
| `appropriation@2`         | 변제일                                                                   |
| `appropriation@3`         | 여러 번 변제·상계·이자·이자제한법                                        |
| `compensation@1`~`@5`     | 부상·사망·산재·기타손해와 이전 버전 입력 (읽기만, 저장 때 `@6`으로 올림) |
| `compensation@6`          | 새 저장 전부(절사 기본 켜짐, 기대여명, 일실퇴직금, 원고별 귀속 등)       |
| `period@2` / `deadline@2` | 2008-03-22 당시 계속 중인 사건 표시                                      |
| `period@3` / `deadline@3` | 사용자 지정 공휴일                                                       |
| `case@1`                  | 사건 파일(위 계산을 함께 담음)                                           |

- v0.1.x의 이자 전용 `schemaVersion: "1"` 파일은 로드 시 v2의 `kind: "interest"` envelope로 마이그레이션되고, 이어서 v3 envelope (`envelopeFeatures: ["interest@1"]`, `dataVersions.interest` hoist)으로 추가 마이그레이션됩니다.

## PDF 엔진

PDF export는 [`printpdf`](https://crates.io/crates/printpdf) 0.7을 사용합니다. `typst-as-library` 나 HTML-to-PDF 경로 대신 이 라이브러리를 선택한 이유는 보고서가 단일 페이지 표 형식이기 때문입니다. typst 컴파일러는 우리가 쓰지 않을 레이아웃 기능 때문에 데스크톱 바이너리를 수십 MB 부풀리고, Chromium 기반 파이프라인은 로컬에서 도는 앱에 런타임 의존성을 더합니다. `printpdf`는 순수 Rust 이며, 안정적인 수동 레이아웃 API와 임베드된 TrueType 폰트 + subset을 지원합니다. Pretendard Regular (SIL OFL 1.1)는 `apps/desktop/src-tauri/assets/fonts/Pretendard-Regular.ttf`로 함께 배포되며 `include_bytes!`로 임베드되어 호스트 폰트 캐시에 의존하지 않고 한글 글리프가 렌더링됩니다. OFL 본문은 바이너리 옆에 `Pretendard-OFL.txt`로 보존됩니다. exporter는 제목, 요약 블록, 구간 표, 선택적 노트, 그리고 면책 고지 / `dataVersion` / `computedAt`이 포함된 footer를 작성합니다. 모두 화면에 표시되는 것과 동일한 필드입니다.

## 비목표

- 본 프로젝트는 법원이 배포한 어떤 실행파일의 클론이나 포팅이 아닙니다.
- 공식 설치 파일에 대한 역공학, 디컴파일, 패치, 리소스 추출은 허용하지 않습니다.
- 공식 매뉴얼과 설치 파일은 본 저장소에 재배포하지 않습니다.
