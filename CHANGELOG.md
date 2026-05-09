# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [0.2.1] - 2026-05-10

### Added

- `pnpm build:icons` 스크립트를 추가했습니다. `apps/desktop/src-tauri/icons/icon-source.png` (1254×1254 raster master) 한 장에서 macOS / Windows / Linux 의 PNG 8개 size (16/32/64/128/128@2x/256/512/1024) + `icon.icns` (iconutil 10 multi-res) + `icon.ico` (6 multi-res) + 인앱 Header 마운트용 `apps/desktop/src/assets/brand/lc-mark.png` (128×128) 를 일괄 생성합니다.

### Changed

- 앱 아이콘과 Header 브랜드 마크를 `Lc` 모노그램 (deep navy `#0D1B2A` + 흰색 L + 골드 C `#D4AF37` + amber baseline) 디자인으로 교체했습니다. 기존 Pillow placeholder (~19KB total) 와 lucide `Scale` 아이콘 (저울 emblem — 법원 공식 프로그램 클론 회피 정책 위반) 을 모두 제거하고 시안 raster 한 장에서 9-platform 자산을 일괄 생성합니다. `globals.css` `@theme` 에 `--color-brand-navy` / `--color-brand-gold` 토큰을 추가했습니다.
- InfoDialog 와 README 첫 단락에 `소개 / 본질에 집중한 법률 계산 워크벤치` 카피를 추가해 브랜드 정체성 일관성을 회복했습니다.

## [0.2.0] - 2026-05-10

### Added

- 상속분 간이 계산 탭을 추가했습니다. `Inheritance.hwp` 매뉴얼을 근거로 한 8 골든 케이스 + 단위 테스트가 포함됩니다.
- `.lcalc` 파일 형식을 v2 envelope (`{ schemaVersion: "2", kind: "interest" | "inheritance", payload }`) 로 확장하고, v1 (interest 단일) 파일을 자동으로 v2 로 변환하는 마이그레이션 registry 를 추가했습니다.
- 면책 고지 단일 source (`STANDARD_DISCLAIMER` from `@lawcalc-kr/core-engine`) 를 도입해 화면 / PDF / CSV / 클립보드 / `.lcalc` 5 surface 에 동일 문구를 적용합니다.
- 법정이율 dataset 주입 API 를 추가했습니다. `calculateInterest(input, { dataset })` 형태로 호출할 수 있으며, 기본 dataset 은 codegen 으로 `data/legal-rates/v1.json` 단일 출처에서 생성됩니다.
- CI 에 `prettier --check` + `tsc --noEmit` 게이트를 추가했습니다.
- CI에 Rust formatting / Clippy 게이트를 추가했습니다. `apps/desktop/src-tauri`에서 `cargo fmt --all -- --check`와 `cargo clippy --all-targets -- -D warnings`를 실행합니다.
- v0.1.x 개선 백로그를 `docs/plans/v0.1.x-improvement-backlog.md`로 정리했습니다.

### Changed

- CSV 내보내기에 formula injection 방어를 적용했습니다. `=`, `+`, `-`, `@`, `\t`, `\r`, `\x00` 으로 시작하는 셀 앞에 single-quote prefix 를 붙입니다.
- `.lcalc` 파일 크기 1 MiB 상한 + 비고(`note`) 10,000 자 상한을 추가해 비정상 입력을 차단합니다.
- 릴리스 dry-run 체크리스트에 C-W7/C-W8 post-mortem 기반 실제 `.app`/`.msi` 실행, 5개 export/save/load 버튼 sanity, case-001 `49,863` 결과 확인을 추가했습니다.
- GitHub Release 본문에 AGPL-3.0-or-later 라이선스 고지를 추가했습니다.

### Fixed

- toast 오류 메시지에서 macOS/Linux/Windows 절대 경로 + 사용자 계정명 + 패닉 스택 프레임을 redact 하도록 `apps/desktop/src-tauri/src/error.rs` 에 `sanitize_for_user` 헬퍼를 도입하고, IPC 명령의 영문 prefix (`dialog task`) 를 한국어 prefix (`파일 대화 상자 작업 실패`) 로 일관 적용했습니다.
- 윤년 02-29 시작 + 비윤년 1년 후 만기 케이스의 풀 1년 cycle 정의를 민법 159·160조 통설로 정정했습니다. 변호사 답변(A안) 채택. 예: `[2024-02-29, 2025-02-28]` 은 정확히 1년 만료로 처리되며 (민법 160조 3항 "최종의 월에 해당일이 없는 때 그 월의 말일") 이자 = `1,000,000 × 5% = 50,000` 입니다 (이전 50,136 → 50,000). `addYears` 가 02-29 → 02-28 로 clip 한 결과 자체를 cycle 만료일로 인정하고 다음 cursor 를 03-01 로 잡는 `periodCycleEnd` 헬퍼를 도입했습니다 (`packages/core-engine/src/interest.ts`). 회귀 fixture `case-009` (정확 1년) + `case-010` (1년 + 15일 partial) 신규. 정책 단일 출처: `docs/INTEREST_FORMULAS.md` §4.1 + `docs/LEGAL_REFERENCES.md`.
- 소수 이율(`12.345%` 등) 다구간 누적 시 부동소수점 결과가 흔들리지 않도록 `tests/edge.test.ts` 에 회귀 2건을 고정했습니다 (TIER-A #7).
- `.lcalc` 로드 시 `legalRatePreset` 누락 또는 잘못된 custom rate 를 조용히 5%로 대체하지 않고 사용자에게 오류를 표시하도록 정리했습니다.
- 입력 오류가 있는 상태에서 `.lcalc` 저장을 막고, 중복 액션 실행 중 재진입을 차단했습니다.

### Documentation

- `mode="totalDays"` + `leapYear="actual"` 가 1년 초과 구간에서 분모를 단일 (365 또는 366) 로 확정하는 한계를 `docs/INTEREST_FORMULAS.md` §3 caveat 으로 명시하고, 정확 비례 계산이 필요한 경우 `mode="period"` 사용을 권장합니다 (TIER-A #3 docs caveat).

### Compatibility

- `.lcalc` v1 (`schemaVersion: "1"`) 파일은 불러올 때 v2 envelope 로 자동 마이그레이션됩니다.
- v0.2.x 에서 저장한 v2 envelope 파일은 v0.1.x 앱에서 열리지 않습니다.

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

[Unreleased]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.1
[0.2.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.0
[0.1.2]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.2
[0.1.1]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.1
[0.1.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.0
