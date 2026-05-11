# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [0.3.2] - 2026-05-12

### Added

- `__APP_VERSION__` 빌드 타임 define 을 `vite.config.ts` 에 도입해 `apps/desktop/package.json` 의 `version` 을 React 4 surface (`App.tsx`, `LitigationCostCalculator.tsx`, `InheritanceCalculator.tsx`, `InfoDialog.tsx`) 의 단일 source 로 통합했습니다. 이제 버전 표기가 누락된 채로 release 가 출하될 수 없습니다.
- `pnpm bump-version <X.Y.Z>` 스크립트를 추가했습니다. `apps/desktop/package.json` / `tauri.conf.json` / `Cargo.toml` 의 버전을 일괄 갱신하고 `CHANGELOG.md` 의 `[Unreleased]` 섹션을 `[<X.Y.Z>] - <오늘 (KST)>` 로 격상하면서 비교 링크를 추가합니다.
- CI 에 `pnpm check:hardcoded-version` 게이트를 추가했습니다. `apps/desktop/src` 안의 `.ts` / `.tsx` 파일에 `"X.Y.Z"` 또는 `>vX.Y.Z<` 형태의 하드코딩된 버전 리터럴이 들어가면 빌드가 실패합니다. 테스트 fixture 파일은 의도된 리터럴을 보존하기 위해 제외됩니다.
- `useFormShortcuts` 공용 hook 을 추가했습니다. window-level keydown 리스너로 `Cmd/Ctrl+S` (저장), `Cmd/Ctrl+Enter` (계산), `Esc` (입력 필드 밖에서 초기화) 를 처리하며 각 view 에서 활성 탭의 핸들러만 wire 합니다.

### Changed

- 정보 다이얼로그의 "버전" 섹션이 `apps/desktop/package.json` 의 `version` 을 빌드 타임에 그대로 읽어 표시하도록 정리했습니다.

### Fixed

- 정보 다이얼로그가 `v0.2.5` 로 고정 표시되어 v0.2.5 이후 모든 릴리스에서 잘못된 버전이 출하되던 결함을 수정했습니다. 매 릴리스마다 단축키·다이얼로그·기타 React surface 에 누락된 버전 표기가 다시 발생하지 않도록 `__APP_VERSION__` 단일 source 로 통합하고 CI 검증을 강제합니다.
- `Cmd/Ctrl+S`, `Cmd/Ctrl+Enter`, `Esc` 키보드 단축키가 소송비용·상속분 탭과 빈 포커스 상태에서 작동하지 않던 결함을 수정했습니다. 기존에는 `App.tsx` 의 `onKeyDown` 이 이자 탭의 한 div 에만 wire 되어 있어 다른 탭이 활성이거나 포커스가 div 밖에 있을 때 키 이벤트가 전달되지 않았습니다. 새 `useFormShortcuts` hook 이 window 레벨 keydown 리스너로 동작하면서 활성 탭의 핸들러를 직접 호출합니다.

## [0.3.1] - 2026-05-12

### Added

- 「재일 87-4」 별표 1 (재판예규 제1950호, 시행 2026-03-01) 의 독촉사건(차) 행을 송달료 매트릭스에 정본 인용으로 추가했습니다. 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 ①항이 본안 사건에 한정되므로 독촉사건은 인지대·송달료만 계산하고 변호사보수는 0원으로 표시합니다. `data/delivery/v1.json` 의 `unverifiedMatrix` 가 비워지고 `countMatrix` 가 13건으로 확장되며, dataset 버전이 `delivery/v1.0.0` 에서 `delivery/v1.1.0` 으로 patch bump 됩니다.
- `computeLitigationCost` 가 변호사보수 산입 외 사건구분에 대해 lawyer-fee 결과를 zero-fill 로 합성하고 안내 산식을 노출합니다. 인지대·송달료는 정상 계산됩니다.

### Changed

- `DeliveryMatrixDelegation` 타입에 선택 필드 `currentEffectiveFrom` / `currentRuleNumber` 를 추가해 dataset 의 정본 슬라이스 시행일과 예규 번호를 타입 안전하게 보존합니다.

### Fixed

- 소송비용 입력 카드의 `소가`, `항소·상고 불복 범위`, `KLAC 약정보수액` 입력에서 천 단위 구분 기호(콤마)가 표시되지 않던 결함을 수정했습니다. 이자 탭 `PrincipalInput` 과 동일한 `Intl.NumberFormat("ko-KR")` display + 입력 시 콤마 strip 패턴을 적용해 자릿수 검토를 쉽게 했습니다. parsing 동작은 기존과 동일합니다.
- 소송비용 입력의 `사건구분 — 독촉사건 (지급명령) (차)` 옵션을 변호사보수 산입 외 라는 이유로 선택 자체가 막혀 인지대·송달료 계산까지 차단되던 결함을 수정했습니다. 옵션을 활성화하고, 선택 시 변호사보수 옵션 카드를 비활성화하면서 결과의 변호사보수만 0원으로 표시합니다. 인지대·송달료는 정상 계산됩니다.
- 독촉사건 등 변호사보수 산입 외 사건구분의 `.lcalc` 파일을 다시 불러올 때 `validateLawyerFeeInput` 의 도메인 검증이 던지는 오류로 로드가 실패하던 round-trip 결함을 수정했습니다. `lcalc-validation` 이 도메인 적용 여부를 먼저 확인하고 산입 외 사건구분에서는 변호사보수 검증을 건너뛰도록 정리했습니다.
- 변호사보수 옵션을 켠 상태에서 사건구분만 독촉사건 등 산입 외 케이스로 전환할 때 `discounts` 와 `klacAgreedFeeWon` 값이 그대로 payload 에 잔존해 round-trip 시 검증 충돌과 dirty-state noise 를 일으키던 결함을 수정했습니다. 입력 useMemo 가 산입 외 사건구분에서는 두 필드를 자동으로 빈 값으로 정규화합니다.

## [0.3.0] - 2026-05-11

### Added

- 소송비용 통합 계산 탭을 추가했습니다. 인지대, 송달료, 변호사보수 engine 을 한 화면에서 호출하고 합계, 한국어 산식, dataset version, KLAC warning, 면책 고지, 균등/소가비례 분배표를 표시합니다. 계산 결과는 PDF, CSV, 클립보드, `.lcalc` 로 내보낼 수 있습니다.
- 소송비용 분배 모듈을 추가했습니다. `divideEqually(totalWon, partyCount)` 와 `divideProportionally(totalWon, partyValuesWon)` 은 원 단위 정수 검증 후 floor 배정 + 잔여원 선순위 배정 정책을 사용합니다.
- `computeLitigationCost(input, deps?)` 통합 engine 을 추가했습니다. `computeStampDuty` / `computeDeliveryFee` / `computeLawyerFee` 를 같은 `computedAt` 으로 호출하고 `dataVersions["stamp-duty" | "delivery" | "lawyer-fee"]`, `STANDARD_DISCLAIMER`, 선택 분배표를 포함한 `LitigationCostResult` 를 반환합니다.
- `.lcalc` v3 envelope 에 `litigation-cost@1` capability 를 추가했습니다. 소송비용 파일은 세 sub-domain dataVersion 을 envelope-level 로 저장하고 renderer/Rust shell 모두 면책 고지를 강제합니다.
- `docs/LEGAL_REFERENCES.md` 에 소송비용 v0.3.0 근거를 추가했습니다. 「민사소송 등 인지법」, 「송달료규칙」, 「재일 87-4」 별표 1, 「변호사보수의 소송비용 산입에 관한 규칙」, 「사건별 부호문자의 부여에 관한 예규」, 대법원 2017마6274 / 2021마7301, KLAC 보수 기준을 현재 지원 범위와 연결했습니다.
- 변호사보수 (`lawyer-fee`) 엔진과 데이터셋을 도입했습니다. 「변호사보수의 소송비용 산입에 관한 규칙」 별표 8 구간 (300만/2,000만/5,000만/1억/1.5억/2억/5억 + 5억 초과) · 제3조 ②항 (가압류·가처분 ×0.5, 변론·심문기일 시 ×1.0) · 제5조 (무변론·자백·이행권고결정 ×0.5) · 제6조 (재량 감액 무한 / 증액 ×1.5 cap) 와 KLAC (대한법률구조공단 ×0.42) 을 wire-up 했습니다. 데이터셋은 `data/lawyer-fee/v1.json` 을 single source 로 사용하고 `loadLawyerFeeDataset` / `lawyerFeeDatasetVersionTag` / `getLawyerFeeBracket` / `computeLawyerFee(input, deps?)` 를 공개하며, 누적 (compound) 적용 + clamp [0.0, 1.5] (제6조 ②항 cap) 와 KLAC 적용 사건 범위 비차단 경고를 포함합니다. 항소심·상고심은 제3조 ①·③항 정합 `perInstanceIndependent` 패턴 — caller 가 불복 범위를 `caseValue` 로 명시 입력합니다.
- 송달료 (`delivery`) 엔진과 데이터셋을 도입했습니다. 「송달료규칙」 (대법원규칙 제2921호) 의 회당 단가 + 「송달료규칙의 시행에 따른 업무처리요령 (재일 87-4)」 별표 1 의 사건구분별 송달 횟수 매트릭스를 wire-up 했으며, 시기별 단가 4 슬라이스 (2019-05-01 / 2020-07-01 / 2021-09-01 / 2025-06-01) 와 사건구분 12 종 verified 매트릭스 + 지급명령 unverified entry 를 보존합니다. 데이터셋은 `data/delivery/v1.json` 을 single source 로 사용하고 `loadDeliveryDataset` / `deliveryDatasetVersionTag` / `getDeliveryCount` / `getDeliveryUnitPriceAt` / `computeDeliveryFee(input, deps?)` 를 공개하며, `filingDate` 기준 시기별 단가 lookup 과 입력 override 모두 지원합니다.
- 인지대 (`stamp-duty`) 엔진과 데이터셋을 도입했습니다. 「민사소송 등 인지법」 제2조 (4 구간 누진표 + 1,000원 floor + 100원 절사) · 제3조 (항소 ×1.5 / 상고 ×2.0) · 제7조 (지급명령 ×0.1 / 화해 ×0.2) · 제16조 (전자소송 ×0.9) 를 wire-up 했으며, 재심 (제8조) 은 심급별 동일 산식으로 처리합니다. 데이터셋은 `data/stamp-duty/v1.json` 을 single source 로 사용하고 `loadStampDutyDataset` / `stampDutyVersionTag` / `getStampDutyBracket` / `applyStampDutyRounding` / `computeStampDuty(input, deps?)` 를 공개하며, deps 를 통한 외부 데이터셋 주입으로 시기별 슬라이스 확장과 결정성을 보장합니다.
- 소송비용 산정 도메인 (`litigation-cost`) 의 입력·결과 타입과 검증기를 도입했습니다. 인지대·송달료·변호사보수 3 sub-domain 의 input/result 인터페이스, 사건구분 13 종 enum (민사·가사·행정·보전·지급명령), 변호사보수 감액 옵션 5 variant (`LawyerFeeDiscount`), 감액 누적 적용 helper (`applyLawyerFeeDiscounts`, ×1.5 상한 clamp), KLAC 적용 사건 범위 비차단 경고 (`validateKlacDiscountScope`) 가 포함되며 도메인별 한국어 prefix RangeError 검증기를 제공합니다.

### Changed

- `.lcalc` 파일 형식을 v3 envelope 로 갱신했습니다. v0.3.0 부터 도메인 추가 시 `schemaVersion` bump 없이 reader 호환성을 확장할 수 있도록 `envelopeFeatures` capability 메타와 `dataVersions` 데이터 슬라이스 맵을 envelope-level 로 도입했습니다. v1 / v2 로 저장된 기존 파일은 reader 의 마이그레이션 체인을 거쳐 자동으로 v3 형식으로 변환됩니다.

## [0.2.5] - 2026-05-10

### Added

- 설정 다이얼로그를 추가하고 화면 모드 설정을 지원합니다. `시스템`, `라이트`, `다크` 중 선택할 수 있으며 선택값은 로컬에 저장됩니다.

### Changed

- 다크 모드에서 결과 합계(원리금 합계 카드 / 합계 행), 상속 결과 disclaimer, 입력 에러·계산 에러·작업 결과 토스트의 색상을 어두운 톤으로 정합했습니다. 기존에는 light 전용 amber/emerald/red 50 단계 색만 사용해 다크 배경에서 가독성이 떨어졌습니다.
- 설정·정보 다이얼로그에 키보드 접근성 개선을 추가했습니다. 화면 모드 라디오 그룹에 화살표 키 (←/→/↑/↓·Home·End) 이동을 지원하고, 두 다이얼로그 모두 Tab/Shift+Tab focus trap 과 닫을 때 트리거 버튼으로 focus 복원을 적용합니다.

### Removed

- 화면 상단의 고정 disclaimer bar (`DisclaimerBar` 컴포넌트) 를 제거했습니다. 동일 면책 문구가 이미 정보 다이얼로그 (`InfoDialog`) 와 결과 카드, PDF/CSV/`.lcalc`/클립보드 export 5종 모두에 노출되고 있어 상단 고정 표시가 중복이라는 판단입니다. 결과·export 측 disclaimer 는 그대로 유지합니다.

### Fixed

- Tailwind v4 의 `dark:` 변종이 클래스 기반 다크 토글에 반응하지 않던 결함을 수정했습니다. `globals.css` 에 `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` 선언을 추가해 `ThemeContext` 가 `documentElement` 에 박는 `data-theme="dark"` 와 Tailwind `dark:*` utility 발화를 정합했습니다. 이전에는 `prefers-color-scheme` 미디어 쿼리만 보고 있어 사용자가 설정에서 "다크" 를 선택해도 일부 컴포넌트(업데이트 다이얼로그 등) 가 라이트 외형을 유지하던 결함이 있었습니다.

## [0.2.4] - 2026-05-10

### Fixed

- 자동업데이트 파이프라인을 정상화했습니다. v0.2.2/v0.2.3 까지는 `tauri.conf.json` `bundle` 섹션의 `createUpdaterArtifacts` 옵션이 누락돼 GitHub Release 에 `.sig` 시그니처와 `latest.json` 매니페스트가 첨부되지 않았고, 그 결과 `tauri-plugin-updater` 의 `check()` 호출이 silently no-op 으로 끝나 업데이트 알림이 뜨지 않았습니다. v0.2.4 부터는 빌드 시 minisign 서명된 updater artifact 가 생성되어 release 에 함께 업로드됩니다.

## [0.2.3] - 2026-05-10

### Changed

- 앱 아이콘과 인앱 브랜드 마크 (`lc-mark.png`) 를 정제했습니다. 외곽 흰 halo 를 제거해 macOS Dock / Windows 작업 표시줄에서 다른 앱과 톤이 어긋나지 않도록 정리하고, 다른 앱 대비 커 보이던 optical size 를 축소했습니다. LC 모노그램 (deep navy + 흰색 L + 골드 C + amber baseline) 정체성은 그대로 유지합니다.
- v0.2.3 patch 릴리스를 위해 데스크톱 앱 버전 표기와 Tauri 패키징 버전을 동기화했습니다.

## [0.2.2] - 2026-05-10

### Added

- 인앱 자동업데이트를 추가했습니다. `tauri-plugin-updater` 기반으로 앱 시작 시 새 버전을 확인하고, hop 차용 state machine UI 로 사용 가능 알림 → 다운로드 진행률 → 설치 완료 → 재시작 흐름을 제공합니다.
- `.lcalc` 미저장 변경사항 dirty guard 를 업데이트 재시작 단계에 연결했습니다. 저장하지 않은 변경사항이 있으면 재시작 버튼을 비활성화하고 저장 후 진행하도록 안내합니다.
- `interest-limits/v1` dataset 을 추가했습니다. 이자제한법 제한이율 변경 이력 4개 구간(30% / 25% / 24% / 20%)을 버전 관리 데이터로 포함합니다.

### Changed

- interest 엔진의 accrual / format / rounding 공통 로직을 내부 shared helper 로 추출했습니다. 사용자-facing 계산 결과 변경은 없습니다.
- v0.2.2 patch 릴리스를 위해 데스크톱 앱 버전 표기와 Tauri 패키징 버전을 동기화했습니다.

## [0.2.1] - 2026-05-10

### Added

- `pnpm build:icons` 스크립트를 추가했습니다. `apps/desktop/src-tauri/icons/icon-source.png` (1254×1254 raster master) 한 장에서 macOS / Windows / Linux 의 PNG 8개 size (16/32/64/128/128@2x/256/512/1024) + `icon.icns` (iconutil 10 multi-res) + `icon.ico` (6 multi-res) + 인앱 Header 마운트용 `apps/desktop/src/assets/brand/lc-mark.png` (128×128) 를 일괄 생성합니다.

### Changed

- 앱 아이콘과 Header 브랜드 마크를 `Lc` 모노그램 (deep navy `#0D1B2A` + 흰색 L + 골드 C `#D4AF37` + amber baseline) 디자인으로 교체했습니다. 기존 Pillow placeholder (~19KB total) 와 lucide `Scale` 아이콘 (저울 emblem — 법원 공식 프로그램 클론 회피 정책 위반) 을 모두 제거하고 시안 raster 한 장에서 9-platform 자산을 일괄 생성합니다. `globals.css` `@theme` 에 `--color-brand-navy` / `--color-brand-gold` 토큰을 추가했습니다.
- InfoDialog 와 README 첫 단락에 `소개 / 본질에 집중한 법률 계산 워크벤치` 카피를 추가해 브랜드 정체성 일관성을 회복했습니다.

## [0.2.0] - 2026-05-10

### Added

- 상속분 간이 계산 탭을 추가했습니다. 외부 reference 매뉴얼 (private) 을 근거로 한 8 골든 케이스 + 단위 테스트가 포함됩니다.
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

[Unreleased]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.5
[0.2.4]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.4
[0.2.3]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.3
[0.2.2]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.2
[0.2.1]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.1
[0.2.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.2.0
[0.1.2]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.2
[0.1.1]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.1
[0.1.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.0
