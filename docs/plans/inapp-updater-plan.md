# 인앱 업데이트 Plan (v0.2 후보)

C 세션과 협업. 본 패스 코드 변경 0.

## 목표

사용자가 앱 내에서 새 버전 릴리스를 감지하고, 클릭 한 번으로 업데이트를 내려받아 재시작하도록 한다.

## 사용 라이브러리

`tauri-plugin-updater` (공식 Tauri v2 플러그인)

```toml
# apps/desktop/src-tauri/Cargo.toml
[dependencies]
tauri-plugin-updater = "2"
```

## 아키텍처 개요

```
GitHub Releases (latest.json endpoint)
        │
        ▼
tauri-plugin-updater (앱 시작 시 또는 수동 트리거)
        │  감지
        ▼
UpdateDialog (React, B 영역)
        │  confirm
        ▼
updater.downloadAndInstall()  →  재시작
```

## 구현 단계

### 1. signing key 생성 (D + C 협업)

```bash
pnpm tauri signer generate -w ~/.tauri/lawcalc-kr.key
```

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 를 GitHub Actions secret 으로 등록.
- 공개 키는 `tauri.conf.json → plugins.updater.pubkey` 에 커밋.

### 2. tauri.conf.json 설정 (C 영역)

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<BASE64_PUBLIC_KEY>",
      "endpoints": [
        "https://github.com/kyungseopk1m/lawcalc-kr/releases/latest/download/latest.json"
      ],
      "dialog": false
    }
  }
}
```

`"dialog": false` 로 설정해 커스텀 React UI 에서 업데이트 흐름을 제어한다.

### 3. release.yml 수정 (D 영역)

`tauri-apps/tauri-action` 는 tag push 시 `latest.json` artifact 를 자동 생성하고 각 플랫폼 바이너리에 `.sig` 서명 파일을 첨부한다.

추가할 env:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

### 4. Rust lib.rs 플러그인 등록 (C 영역)

```rust
tauri_plugin_updater::Builder::new().build()
```

### 5. 업데이트 UI (B 영역)

- 앱 시작 시 백그라운드에서 버전 확인.
- 새 버전 감지 시 toast 또는 modal 로 사용자에게 고지.
- 사용자 confirm → `update.downloadAndInstall()` → 재시작.

## 보안 고려사항

- 서명 키는 GitHub Actions secret 에만 보관. 로컬 파일에 커밋 금지.
- `endpoints` 는 HTTPS GitHub Releases 전용.
- `latest.json` 은 `tauri-action` 가 자동 생성 — 수동 편집하면 서명 불일치 발생.

## 롤아웃 순서

1. D: signing key 생성 + GitHub secret 등록 + release.yml 에 env 추가.
2. C: Cargo.toml + lib.rs + tauri.conf.json 업데이트.
3. B: UpdateDialog 컴포넌트 구현.
4. D: dry-run tag push 로 `.sig` 첨부 + `latest.json` 생성 확인.
5. 전체: 이전 버전 앱에서 새 태그 감지 E2E 검증.

## 상태

📝 plan 문서 완료. v0.1.0 release 안정 확인 후 v0.2 사이클에서 실행.
