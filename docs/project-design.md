# Project Design

lawcalc-kr 는 한국 법률 계산을 로컬에서 검토할 수 있게 하는 데스크톱 워크벤치입니다. 이 문서는 공개 README보다 조금 더 구현 중심으로 도메인 경계와 release train을 정리합니다.

## 1. Product Surface

현재 데스크톱 앱은 이자 / 상속 / 소송비용 / 변제충당 / 손해배상 5개 도메인을 탭으로 제공합니다. 각 도메인은 입력, 계산 결과, 데이터 버전, 저장·내보내기 흐름을 같은 UX 원칙으로 공유합니다.

## 2. Local-First Contract

사건 입력값은 사용자 기기 안에서만 처리합니다. `.lcalc` 파일, PDF, CSV, 클립보드 출력은 모두 로컬 액션이며 서버 전송을 요구하지 않습니다.

## 3. Engine Boundary

도메인 계산은 `packages/core-engine` 의 순수 TypeScript 함수가 담당합니다. React/Tauri 레이어는 폼 상태, 파일 IO, export, 네이티브 대화상자만 담당합니다.

## 4. Data Versioning

법령·실무·수학표 데이터는 `data/<dataset>/v<N>.json` 을 single source로 두고, sync 스크립트가 generated TypeScript dataset으로 변환합니다. 결과 객체와 `.lcalc` envelope에는 사용한 dataset 식별자를 포함합니다.

## 5. `.lcalc` Capability

저장 파일은 `schemaVersion: "3"` envelope를 사용합니다. capability는 `interest@1`, `inheritance@1`, `litigation-cost@1`, `appropriation@1`, `compensation@1` 처럼 도메인별로 명시합니다.

## 6. Disclaimer Surface

면책 고지는 `packages/core-engine/src/disclaimers.ts` 의 `STANDARD_DISCLAIMER` 를 단일 source로 사용합니다. 신규 출력 surface는 이 문자열을 직접 복제하지 않고 결과나 export 흐름을 통해 전달합니다.

## 7. Public Artifact Policy

공개 저장소에는 공식 매뉴얼 본문, 설치 파일, 디컴파일 산출물, 사적인 동기 설명을 포함하지 않습니다. 공개 문서는 출처명, URL, 독립적으로 작성한 설명, 계산 입력·기대 출력만 보존합니다.

## 8. Compensation Roadmap

v0.5.0 은 손해배상 도메인의 첫 public slice로 `compensation@1` 을 도입합니다. 범위는 자동차 사고 부상 단일 slice이며, 기초사항, 노동력상실률, 일실수입, 위자료, 과실상계, 공제, 호프만 240 cap, dataset stale badge까지 포함합니다.

| Release | Scope               | Capability       | Notes                                                                                                                              |
| ------- | ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| v0.5.0  | 자×부상 first slice | `compensation@1` | CAK 시중노임, KOSIS 생명표, 호프만, 라이프니츠 dataset 4종을 결과에 동봉합니다.                                                    |
| v0.6.0  | 자×사망             | `compensation@2` | 생계비 1/3, 장례비, 상속지분 분배가 추가됩니다. inheritance 1991-01-01 제약 해소 또는 release notes 한정 명시가 hard prereq입니다. |
| v0.7.0  | 산재                | `compensation@3` | 장해급여·유족급여 공제 분기를 추가합니다.                                                                                          |
| v0.8.0  | 기타손해            | `compensation@4` | 개호비, 치료비, 보조구 등 별도 손해 항목을 추가합니다.                                                                             |

v0.5.0 에서는 monorepo split을 적용하지 않습니다. `packages/core-engine/src/compensation/` 안에 구현을 유지하고, 실제 패키지 분리는 v0.6+ cycle에서 별도 계획으로 다룹니다.
