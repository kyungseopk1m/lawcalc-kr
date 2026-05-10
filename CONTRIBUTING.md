# Contributing to lawcalc-kr

이 프로젝트에 시간을 내어 주셔서 감사합니다. lawcalc-kr 는 공개 법령과 공식 매뉴얼만을 근거로 재구현한 데스크톱 법률 계산 워크벤치이며, 법원 공식 프로그램의 클론·포팅이 **아닙니다**. 기여 시에도 이 포지셔닝을 함께 지켜 주세요.

## 개발 환경

| 도구    | 버전               |
| ------- | ------------------ |
| Node.js | 24 (`.nvmrc` 참조) |
| pnpm    | 10                 |
| Rust    | stable             |

```bash
pnpm install
pnpm tauri:dev      # 데스크톱 앱 개발 모드
pnpm tauri:build    # 릴리스 패키징 (.dmg / .msi)
```

## 테스트 정책

PR 전에 다음이 통과해야 합니다.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:golden
```

테스트는 다음 4 계층으로 구성됩니다.

- **단위 테스트** — 날짜 정규화, 일수 계산, 구간 분할, 끝수 처리, 공식 출력.
- **픽스처 테스트** — 알려진 수기 예제와 엣지 케이스를 구조화한 JSON 입력.
- **골든 테스트** — 공식 자료를 근거로 독립 산정한 출력과 비교 (반올림 정책 포함 정확 일치).
- **데스크톱 스모크** — Tauri command 와이어링, save/load, 내보내기 흐름.

### 골든 케이스 작성 규칙

각 케이스는 다음을 포함해야 합니다 — 원금, 시작·종료일, 이율 구간 또는 프리셋, 초일 산입·윤년 옵션, 기대 구간 일수와 이자, **출처 주석** (어떤 공식 자료에서 어떻게 산출했는지), 데이터 버전.

리버스엔지니어링·MSI 디컴파일·공식 자산 복사·매뉴얼 본문 발췌 재배포는 어떤 골든 케이스에도 허용되지 않습니다. 작성 중인 케이스는 `_wip/` 디렉토리에 두면 CI 에서 자동으로 제외됩니다.

### `.lcalc` 호환성

저장/로드 테스트는 다음을 보장해야 합니다.

- 현재 스키마 파일이 mutation 없이 로드된다.
- 알 수 없는 필드는 가능한 한 round-trip 으로 보존된다.
- `schemaVersion`, `dataVersion`, `input` 누락 시 사용자에게 명확한 에러를 표시한다.
- 결과의 `dataVersion` 이 파일 수준 `dataVersion` 과 일치한다.

## 데이터 버전 관리

법정이율 데이터셋은 `data/legal-rates/v{N}.json` 으로 관리합니다. 결과 객체에는 항상 `dataVersion` 을 기록해 동일 입력의 재현성을 보장합니다. 데이터 변경은 새 버전 파일 + CHANGELOG 에 사용자 영향 1~2 줄을 함께 기록해 주세요.

## 커밋·PR

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …) 를 따릅니다.
- 한 PR 한 책임. 데이터 변경, 계산 정책 변경, UI 변경은 분리합니다.
- README, CHANGELOG, 앱 화면이 같은 기능 범위를 말해야 합니다.
- 면책 고지·법령 인용 톤은 모든 출력 (UI, PDF, CSV, `.lcalc`) 에서 일관되게 유지합니다.

## 릴리스 절차 (메인테이너용)

릴리스는 GitHub Actions 의 `release.yml` 이 `tauri-apps/tauri-action` 으로 자동 생성합니다.

1. 작업 트리가 깨끗한지 확인 — 활성 stash 0, untracked 0.
2. CI 동등 검증을 로컬에서 1회 — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, `pnpm build`.
3. CHANGELOG 의 해당 버전 섹션이 한국어 사용자 노트로 — core 엔진 변경, 데스크톱 UI 변경, `.lcalc`·CSV·PDF·클립보드 변경, 법정이율 데이터 변경, 스키마/계산 정책 호환성 변경 — 채워졌는지.
4. README 의 데모 자산이 placeholder 가 아닌 실제 자산인지.
5. v0.2+ 미완성 기능은 UI 에서 비활성화되었거나 "차후 버전" 으로 표시되었는지.
6. 태그 발급 (`git tag vMAJOR.MINOR.PATCH` → `git push origin <tag>`).
7. GitHub draft release 가 생성되면 macOS 와 Windows artifact 를 직접 받아 한 번씩 실행해 dialog/save/load/export 다섯 동작을 확인합니다 (publish 직전 게이트).
8. 면책 고지가 화면과 출력 양쪽에 노출되는지 확인 후 publish.

## 인앱 업데이터 (계획)

`tauri-plugin-updater` 기반의 자동 업데이트는 v0.2+ 단계 후보입니다. 본문 작성 시점에는 사용자가 GitHub Releases 에서 직접 새 버전을 받아 설치합니다. 도입이 결정되면 signing key·`latest.json` 엔드포인트·채널 정책이 함께 명세됩니다.

## 사용자 테스트 / 피드백

v0.1.x 단계는 소규모 사용자 (변호사·법무 실무자) 의 피드백 루프에 최적화되어 있습니다. 보고 채널은 GitHub Issues 입니다. 다음 항목이 포함되면 빠르게 분류할 수 있습니다.

- OS / 버전, 설치 결과 (정상 / 경고 후 진행 / 차단).
- 입력 시나리오 — 원금·시작일·종료일·이율 프리셋·옵션.
- 결과 신뢰도 — 공식·근거가 명확한가 / 모호한가 / 잘못되었는가.
- `.lcalc` 저장·로드 결과.
- 혼동되는 라벨, 누락된 법률 용어.
- 심각도 — 릴리스 차단 / 패치 후보 / 차후 버전 개선.

## 보안·개인정보

- 사건 정보는 외부 서버로 전송하지 않습니다. 네트워크 호출이 새로 추가되는 변경은 **명시적인 리뷰** 가 필요합니다.
- 의존성 추가는 라이선스 양립성 (AGPL-3.0-or-later 호환) 을 함께 검토해 주세요.
- 보안 결함은 공개 Issue 가 아닌 메인테이너 이메일로 비공개 보고를 부탁드립니다.

## 코드 행동 규범

서로의 시간과 전문성을 존중해 주세요. 법률 도메인 특성상 표현의 정확성과 신중함이 코드 품질만큼 중요합니다.
