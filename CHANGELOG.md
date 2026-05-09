# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

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
- GitHub Actions CI와 macOS/Windows Tauri draft release workflow를 추가했습니다.
- BUSL-1.1 라이선스와 2031-05-09 Apache-2.0 자동 전환 고지를 추가했습니다.
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

[Unreleased]: https://github.com/kyungseopk1m/lawcalc-kr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kyungseopk1m/lawcalc-kr/releases/tag/v0.1.0
