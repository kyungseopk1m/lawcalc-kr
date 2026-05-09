# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [0.1.2] - 2026-05-09

### Fixed

- 내보내기 / 저장 / 불러오기 5개 버튼 (PDF / CSV / 클립보드 / `.lcalc` 저장 / `.lcalc` 불러오기) 클릭 시 저장 경로 dialog 가 닫힌 후 앱이 멈추던 결함을 수정했습니다. 4개 dialog command (`export_pdf` / `export_csv` / `save_lcalc` / `load_lcalc`) 가 sync `#[tauri::command]` 안에서 `blocking_save_file()` / `blocking_pick_file()` 을 호출해 macOS · Windows main thread deadlock 을 일으켰습니다. async 시그니처 + `tauri::async_runtime::spawn_blocking` 으로 워커 스레드 위임으로 정정했습니다.
- 빌드 산출물 파일명과 InfoDialog 가 `0.1.0` 으로 표기되던 결함을 수정했습니다. `tauri.conf.json` `version` / `Cargo.toml` `version` / `App.tsx` `APP_VERSION` 셋을 `0.1.2` 로 일괄 갱신했습니다.

## [0.1.1] - 2026-05-09

### Fixed

- macOS/Windows 데스크톱 앱이 시작 직후 panic 으로 즉시 종료되던 결함을 수정했습니다. `tauri.conf.json` 의 `plugins.dialog` / `plugins.clipboard-manager` 빈 객체가 Tauri 2.x deserialize 단계에서 실패해 v0.1.0 release artifact 가 실행 자체 불가했습니다. plugin 등록은 `lib.rs` 의 `.plugin(tauri_plugin_dialog::init())` / `.plugin(tauri_plugin_clipboard_manager::init())` 으로 이미 되어 있어, `tauri.conf.json` 의 `plugins` 섹션을 제거했습니다 (functional change 0).
- period 모드의 `segment.days` 가 `formula` 분자 일수 합과 어긋나던 비대칭을 정정했습니다. `addYears` 의 02-29 → 02-28 clip 케이스 등에서 결과 표 days 컬럼이 formula 와 일치하지 않아 사용자 검산 시 신뢰성 문제가 있었습니다. interest / totalInterest 계산 결과 변경 0 — days 정의만 재정의 (`packages/core-engine/src/interest.ts` `periodDaysSum` helper).

## [0.1.0] - 2026-05-09

### Added

- 판결금 이자·지연손해금 계산을 위한 첫 데스크톱 앱 구조를 추가했습니다.
- 원금, 기간, 법정이율 프리셋, 초일 산입, 윤년 처리 옵션을 받는 `@lawcalc-kr/core-engine` 계산 엔진을 구현했습니다.
- 민법 5%, 상법 6%, 소송촉진 등에 관한 특례법 이율 변경 이력을 `data/legal-rates/v1.json`으로 버전 관리합니다.
- 구간별 일수, 적용 이율, 계산 공식, 이자, 총액을 반환하는 결과 모델과 단위 테스트를 추가했습니다.
- 법원 공개 매뉴얼 예시를 포함한 골든 테스트 7건과 edge-case 회귀 테스트를 추가했습니다.
- 원 단위 끝수 처리 옵션을 추가했습니다. 절사, 절상, 사사오입을 지원하며 미지정 시 절사로 계산합니다.
- React/Vite/Tauri 기반 macOS·Windows 데스크톱 앱 shell과 결과 표시 UI를 추가했습니다.
- `.lcalc` JSON 저장·로드를 구현해 입력값, 옵션, 결과, 데이터 버전, 면책 고지를 로컬 파일로 재현할 수 있게 했습니다.
- 계산 결과를 PDF(A4, Pretendard 한글 폰트 임베드, 구간표·합계·면책 푸터 포함)와 CSV(UTF-8 BOM, Excel 한글 호환)로 내보내고 텍스트 요약을 클립보드에 복사하는 기능을 추가했습니다.
- GitHub Actions CI와 macOS/Windows Tauri draft release workflow를 추가했습니다.
- GNU Affero General Public License v3.0 (이상) 라이선스를 적용했습니다. 누구나 자유롭게 사용·수정·재배포할 수 있으며, 수정본을 네트워크 서비스로 제공하거나 재배포할 경우 동일 라이선스로 source code 공개가 강제됩니다.
- 다중 세션 개발 워크플로, 릴리스 체크리스트, 테스트 전략, 사용자 테스트 계획 문서를 추가했습니다.

### Changed

- README를 v0.1.0 공개 릴리스 기준으로 정리하고 macOS/Windows 설치 안내를 분리했습니다.
- CI와 release workflow를 Node.js 24 런타임 액션으로 업데이트했습니다.
- Vite/Vitest 경로의 moderate audit 항목을 제거하도록 lockfile을 갱신했습니다.

### Security

- `pnpm audit` 기준 알려진 취약점 0건 상태로 lockfile을 갱신했습니다.

### Compatibility

- 첫 공개 릴리스이므로 breaking change는 없습니다.
- `.lcalc` `schemaVersion: "1"` 파일은 v0.1.x 안에서 하위 호환을 유지합니다.

[Unreleased]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.2
[0.1.1]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.1
[0.1.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.0
