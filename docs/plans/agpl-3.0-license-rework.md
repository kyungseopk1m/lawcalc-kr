# AGPL-3.0 License Rework Plan

본 문서는 lawcalc-kr 의 라이선스를 BUSL-1.1 + 2031-05-09 자동 Apache-2.0 전환에서 GNU Affero General Public License v3.0 (이상) 단일 영구 OSS 라이선스로 전환하는 작업의 계획이다. 실행은 A/B/C 세션과 함께 cross-cutting 단일 commit 으로 v0.1.0 release tag 직전에 수행한다.

## 배경

### 현 상태

- 라이선스: BUSL-1.1, Change Date 2031-05-09, Change License Apache 2.0
- 메타: `package.json`, `packages/core-engine/package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml` 모두 `BUSL-1.1`
- 라이선스 파일: `LICENSE` (BUSL-1.1 본문) + `LICENSE.future` (Apache 2.0 본문)
- GitHub Insights detection: `Unknown × 2` (Licensee gem 이 두 파일 모두 SPDX boilerplate fuzzy match 실패)
- 데스크톱 앱 InfoDialog: BUSL-1.1, 2031-05-09 → Apache-2.0 표기

### 동기 (사용자 직접 지시, 2026-05-09)

1. "탈취" 영구 차단: 누가 fork 해서 SaaS 호스팅하든 비공개 시스템에 통합하든 source 공개 + 동일 라이선스 강제
2. 정식 OSS: OSI approved 라이선스로 GitHub Insights 정상 detect, 검색 노출, contributor 환영
3. 미래 유료화 옵션 보존: 본인이 모든 코드의 copyright owner 이므로 후일 dual license (AGPL = OSS, commercial = 별도) 가능 (MongoDB / Grafana / Sentry 모델)
4. BUSL 5년 cycle 의 복잡성 제거 + 5년 후 풀려서 완전 자유화되는 부담 회피

### 비목표

- 코드 파일 헤더 `SPDX-License-Identifier: AGPL-3.0-or-later` 일괄 추가는 본 패스 범위 밖 (대량 변경, 별도 follow-up)
- `CONTRIBUTING.md` CLA / DCO 정책 작성은 dual licensing 시점 별도 패스
- Apache 2.0 본문 보존 안 함 (BSL 전환 메커니즘 자체가 폐기되므로)

## 목표

1. `LICENSE` 파일을 GNU AGPL-3.0 표준 본문으로 교체 → GitHub Licensee 가 `AGPL-3.0` 으로 정상 detect
2. `LICENSE.future` 삭제 (BSL 전환 본문, 더 이상 의미 없음)
3. 워크스페이스 메타 `license: "BUSL-1.1"` → `"AGPL-3.0-or-later"` 일괄 변경
4. README / CHANGELOG / 데스크톱 InfoDialog 라이선스 노출 모두 AGPL-3.0-or-later 로 정합

## 변경 대상 파일

영역 cross-cutting 이므로 D 가 일괄 변경 권한을 가지며 (License Hardening 2026-05-09 전례 동일), A / B / C 영역의 메타 파일도 본 패스에서 함께 변경한다. 각 세션은 본 plan 인지 후 메타 일괄 변경 권한을 D 에 위임한다고 본다.

### D 영역

- `LICENSE` — `https://www.gnu.org/licenses/agpl-3.0.txt` 표준 본문 그대로 교체 (CRLF → LF, prettier 포맷 영향 없음 — `.prettierignore` 또는 plain text 처리)
- `LICENSE.future` — `git rm` 으로 삭제
- `package.json` — `"license": "AGPL-3.0-or-later"`
- `README.md` — 한국어 라이선스 섹션 + English `### License` 단락 모두 갱신, BUSL/Change Date/LICENSE.future 언급 제거
- `CHANGELOG.md` — `[Unreleased]` 에 `### Changed` 항목 추가 (라이선스 전환 명시), `[0.1.0]` 섹션 안의 `BUSL-1.1 라이선스와 2031-05-09 ... 추가했습니다` 라인은 release 전이면 직접 정정, release 후면 Unreleased 만 사용
- `.github/workflows/release.yml` — `releaseBody` 면책 단락 직전 또는 직후에 라이선스 명시 한 줄 추가 검토 (선택)
- `.gitattributes` — 신규 또는 갱신, `LICENSE linguist-language=Text` 명시 (Licensee fuzzy match 보조)

### A 영역 메타 (D 일괄 변경 권한 행사)

- `packages/core-engine/package.json` — `license` 필드 `BUSL-1.1` → `AGPL-3.0-or-later`
- `packages/core-engine/README.md` — 하단 라이선스 표기 (`BUSL-1.1 → 2031-05-09 자동 Apache-2.0`) → `AGPL-3.0-or-later` 로 갱신

### B 영역 메타

- `apps/desktop/package.json` — `license` 필드 변경
- `apps/desktop/src/components/layout/InfoDialog.tsx` — 라이선스 표기 단락 갱신 (BUSL-1.1 / 2031-05-09 / Apache-2.0 모두 제거 후 AGPL-3.0-or-later 한 줄 + 본문 링크)

### C 영역 메타

- `apps/desktop/src-tauri/Cargo.toml` — `license` 필드 `BUSL-1.1` → `AGPL-3.0-or-later`
- `apps/desktop/src-tauri/src/commands/result_view.rs` — `DISCLAIMER_KO` 상수에 라이선스 언급 있는지 grep 후 정합 (현재는 면책만, 라이선스 노출 0이면 미터치)
- `apps/desktop/src-tauri/src/commands/pdf.rs` / `csv.rs` 푸터의 라이선스 표기 점검 (현재 면책만 출력으로 추정)

## 마이그레이션 절차

### Phase 1 — 사전 협의 (이번 plan 작성 시점)

- 본 plan 문서 main 반영 (D-W7 plan-only commit)
- A / B / C 세션 작업자가 plan 인지 후 메타 일괄 변경 권한 D 에 위임 확인
- 실행 commit 은 v0.1.0 tag 발급 시점과 align (tag 직전 단일 cross-cutting commit 으로 처리)

### Phase 2 — 워크트리 격리 + 일괄 변경 (실행 시점)

1. D 워크트리에서 `git fetch origin main` + `git rebase origin/main` (clean tree 확인)
2. 변경 파일 일괄 stage:
   - LICENSE 본문 `curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE`
   - `git rm LICENSE.future`
   - 메타 파일 4개 license 필드 변경
   - README / CHANGELOG / packages/core-engine/README / apps/desktop InfoDialog 갱신
3. `git status --short` 로 staged set 만 확인 (다른 세션 untracked 미터치)

### Phase 3 — 검증

- `pnpm install --frozen-lockfile` (lockfile 영향 없음 예상)
- `pnpm exec prettier --check` (LICENSE 는 `.prettierignore` 또는 plain text 무시)
- `pnpm lint` / `pnpm test` (7 files / 91 passed) / `pnpm test:golden` (1 file / 9 passed) / `pnpm build`
- 의존성 라이선스 호환성:
  - `pnpm licenses list` 로 npm deps 점검 (MIT / Apache-2.0 / BSD 다수 → AGPL outbound 호환)
  - Rust deps: `cargo install cargo-license && cargo license` 또는 `cargo about`
  - GPL-incompatible (예: `GPL-2.0-only` lib 단독, OpenSSL legacy) 발견 시 별도 mitigation 필요
- 데스크톱 앱 build (`pnpm tauri:build`) 까지 통과 확인 (선택, 시간 여유 시)

### Phase 4 — commit / push / tag align

- 단일 commit: `chore: relicense to AGPL-3.0-or-later (was BUSL-1.1)`
- 메시지 본문에 동기 + Apache 본문 폐기 + dual licensing 옵션 보존 명시
- main 직접 push (lawcalc-kr 정책)
- v0.1.0 tag 발급 직전 마지막 hardening commit 으로 묶음
- push 후 GitHub Insights 페이지 새로고침 → `AGPL-3.0` detect 확인

## README 라이선스 섹션 제안 본문

### 한국어 (`README.md` `## 라이선스`)

```markdown
## 라이선스

이 프로젝트는 GNU Affero General Public License v3.0 (이상)으로 배포됩니다. 누구나 자유롭게 사용·수정·재배포할 수 있으며, 수정본을 네트워크 서비스로 제공하거나 재배포할 경우 동일 라이선스로 source code 를 공개해야 합니다. 자세한 내용은 [LICENSE](LICENSE) 를 확인하세요.

상업적 사용을 위해 별도 라이선스가 필요한 경우 Licensor (kyungseopk1m) 에게 문의해 주세요.
```

### English (`README.md` `### License`)

```markdown
### License

Distributed under the GNU Affero General Public License v3.0 or later. You are free to use, modify, and redistribute the software, but any modified version made available to users over a network or redistributed as a derivative work must be released under the same license with source code available. See [LICENSE](LICENSE) for the full text.

For commercial licensing inquiries, please contact the Licensor (kyungseopk1m).
```

## CHANGELOG 항목 제안

### `[Unreleased]` 신규 항목

```markdown
## [Unreleased]

### Changed

- 라이선스를 BUSL-1.1 + 2031-05-09 자동 Apache-2.0 전환에서 GNU Affero General Public License v3.0 (이상) 단일 영구 라이선스로 전환했습니다. 누구나 자유롭게 사용·수정·재배포할 수 있으며, 수정본을 네트워크 서비스 또는 재배포로 제공할 경우 동일 라이선스로 source code 공개가 강제됩니다.
- BUSL 전환 메커니즘 본문(`LICENSE.future`) 을 제거했습니다.
- 데스크톱 앱 InfoDialog 의 라이선스 표기를 AGPL-3.0-or-later 로 갱신했습니다.
- 워크스페이스 메타데이터(`package.json` / `packages/core-engine/package.json` / `apps/desktop/package.json` / `apps/desktop/src-tauri/Cargo.toml`) 의 `license` 필드를 일괄 갱신했습니다.
```

### `[0.1.0]` 섹션 (release 직전이면 정정)

기존:

```
- BUSL-1.1 라이선스와 2031-05-09 Apache-2.0 자동 전환 고지를 추가했습니다.
```

⇒ 정정:

```
- GNU Affero General Public License v3.0 (이상) 라이선스를 적용했습니다.
```

`[0.1.0]` 가 이미 외부 release 후 동결됐으면 위 정정은 생략하고 `[Unreleased]` 만 사용한다.

## InfoDialog 라이선스 표기 제안 (B 영역, 본 patch 에서 함께 갱신)

기존:

```
BUSL-1.1, 2031-05-09 → Apache-2.0
```

⇒ 갱신:

```
GNU Affero General Public License v3.0 (이상). 자세한 내용은 LICENSE 파일 참조.
```

## 리스크 / Mitigation

### 리스크 1 — 의존성 라이선스 호환성

AGPL 은 strong copyleft 이라 inbound dependency 가 AGPL outbound 와 호환되어야 한다. 일반적인 npm / cargo 의 MIT / Apache-2.0 / BSD / ISC / Unlicense 는 outbound 호환. GPL-2.0-only 단독 dep 또는 일부 OpenSSL legacy 본문이 inbound 라면 충돌 가능.

- Mitigation: Phase 3 에서 `pnpm licenses list` + `cargo license` 수동 점검. 충돌 dep 발견 시 (a) 대체 lib 검토 (b) 본 plan 보류 (c) BSL 유지 fallback.

### 리스크 2 — 변호사 사용성 부담 해석

AGPL 의 "network use" 의무가 변호사 본인 사무소 사용을 막는다고 오해할 수 있다. 실제로 stand-alone 데스크톱 앱으로 사용하는 한 의무 발동 0 (internal use). 누가 lawcalc-kr 엔진을 자기 case management 비공개 system 에 import 해서 다중 사용자에게 네트워크로 제공할 때만 AGPL 의무 발동.

- Mitigation: README "사용 예시 / 의무 발동 조건" 단락으로 명확히 가이드.

### 리스크 3 — Open Core 자산과의 분리

미래 유료화 자산 (AI 판결문 분석, 다중 사건 일괄, 프리미엄 템플릿 등) 은 본 OSS 레포 외부에 별도 private 레포 + commercial license 로 두어야 한다. 본 레포 안에 두면 AGPL 적용으로 source 공개 강제됨.

- Mitigation: `License Hardening` 메모와 동일 정책 유지. 본 plan 으로 Open Core 분리 정책 변경 0.

### 리스크 4 — 외부 contributor copyright 분배

미래 dual license 를 위해서는 외부 contribution 의 copyright 분배 명확화 (CLA 또는 DCO + 별도 동의) 가 필요하다. 본 patch 에서는 다루지 않는다.

- Mitigation: v0.2 cycle 에서 `CONTRIBUTING.md` + DCO 또는 CLA 별도 패스.

### 리스크 5 — Pre-existing distribution

v0.1.0 release 전 라이선스 변경이라 외부 redistribution 0 (lawcalc-kr 정책 시점부터 main 만 push). v0.1.0 release artifact (`*.dmg` / `*.app.tar.gz` / `*.msi` / `*.exe`) 는 dryrun draft 만 존재.

- Mitigation: 신규 v0.1.0 release tag 발급 전 메타 / LICENSE 모두 통일.

## 롤백 절차

### main 반영 후 외부 release 발급 전

- 단일 revert: `git revert <license-rework-sha>`
- LICENSE 본문 BSL 1.1 복원
- 메타 일괄 `BUSL-1.1` 복구
- README / CHANGELOG / InfoDialog 원복

### 외부 release 후

AGPL → BSL 1.1 backward 변경은 사실상 불가 (AGPL 으로 받은 사용자 권리 보존). 따라서 한 방향 이동.

- forward-only 정정 commit 만 가능
- 라이선스 명확화 또는 dual license 추가 형태로 미래 우회

## 타임라인

- 2026-05-09: 본 plan 작성 (D-W7 plan-only commit, 코드 변경 0)
- 다음 W (또는 v0.1.0 release tag 직전): A / B / C 세션 합류 후 cross-cutting 단일 commit 실행
- v0.2 cycle: `CONTRIBUTING.md` / DCO 또는 CLA / SPDX-License-Identifier 헤더 일괄 추가

## 참고 자료

- GNU AGPL-3.0 공식 본문: https://www.gnu.org/licenses/agpl-3.0.txt
- SPDX identifier: `AGPL-3.0-or-later`
- AGPL 채택 사례: MongoDB (2018-2020) / Mastodon / Nextcloud / Grafana (이전) / GhostScript
- GitHub Licensee documentation: https://github.com/licensee/licensee
- Open Source Initiative AGPL 페이지: https://opensource.org/license/agpl-v3
- Tauri / React / Rust 의존성 라이선스 호환성: 통상 MIT / Apache-2.0 / BSD 다수, AGPL outbound 호환
