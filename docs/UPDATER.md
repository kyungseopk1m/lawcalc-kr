# In-App Update Plan (v0.2 후보)

> **상태**: 계획 문서 — v0.1.0 릴리스 blocker 아님. 코드 변경 없음.
> **담당**: C (Rust/Tauri 셸) + D (CI/signing key 관리)

---

## 개요

`tauri-plugin-updater` v2를 통해 앱 내부에서 새 버전을 감지하고 자동 다운로드/재시작할 수 있게 한다.
사용자가 수동으로 GitHub Releases 페이지를 방문하지 않아도 "업데이트 사용 가능" 알림을 받고
원클릭으로 설치할 수 있다.

---

## 결정이 필요한 항목

### 1. Signing Key

Tauri updater는 릴리스 아티팩트(`.dmg`, `.msi`)를 Ed25519로 서명해야 한다.

```bash
# 로컬에서 key pair 생성 (D 세션 담당)
pnpm tauri signer generate -w ~/.tauri/lawcalc-kr.key
# → ~/.tauri/lawcalc-kr.key       (private, GitHub Secret으로 등록)
# → ~/.tauri/lawcalc-kr.key.pub   (public, tauri.conf.json에 기입)
```

- **private key**: GitHub repository secret `TAURI_SIGNING_PRIVATE_KEY`로 등록.
  release.yml에서 `tauri-action` 실행 시 env로 주입.
- **public key**: `tauri.conf.json` → `plugins.updater.pubkey`에 평문 포함 (공개 OK).
- **key 교체 정책**: key 유출 시 새 key로 전체 재빌드 후 릴리스. 구 버전 업데이터는
  새 서명을 검증하지 못하므로 사용자가 수동 재설치 필요. v0.2에서 key rotation 절차 별도 문서화.

### 2. Update Endpoint

#### 옵션 A — GitHub Releases 직접 (권장, v0.2 기본)

`tauri-action`이 릴리스 시 `latest.json`을 자동 생성해 GitHub Release 아티팩트에 포함한다.

```json
// tauri.conf.json (예정 구조)
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/kyungseopk1m/lawcalc-kr/releases/latest/download/latest.json"
      ],
      "pubkey": "<base64-encoded-public-key>"
    }
  }
}
```

- 별도 서버 불필요. GitHub CDN 가용성에 의존.
- `latest.json` 포맷은 tauri-action이 자동 생성(`tauri-apps/tauri-action` v0.6+).

#### 옵션 B — 별도 update 서버 (v0.3 후보)

트래픽 분석, A/B 릴리스, 점진적 rollout이 필요해지면 별도 프록시 서버 도입.
현재는 over-engineering이므로 보류.

### 3. 채널 전략

| 채널 | 태그 패턴 | 대상 |
|------|----------|------|
| stable | `v*.*.*` (e.g. `v0.2.0`) | 일반 사용자 |
| (미정) beta | `v*.*.*-beta.*` | 향후 검토 |

v0.2에서는 stable 단일 채널만 운영.

---

## C 세션 구현 계획 (v0.2 라운드)

### Cargo.toml 추가

```toml
[dependencies]
tauri-plugin-updater = "2"
```

### lib.rs 등록

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

### capabilities/default.json 추가

```json
"updater:allow-check",
"updater:allow-download-and-install"
```

### 업데이트 체크 로직

앱 시작 시 백그라운드에서 체크 → 새 버전 있으면 B 세션이 구현한 토스트/모달로 알림.
Tauri command 예시:

```rust
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<String>, Error> {
    let updater = app.updater()?;
    match updater.check().await? {
        Some(update) => Ok(Some(update.version.to_string())),
        None => Ok(None),
    }
}
```

IPC 시그니처 (A·B와 합의 필요):

```typescript
// ipc.ts
export async function checkUpdate(): Promise<string | null>
export async function installUpdate(): Promise<void>
```

---

## D 세션 구현 계획 (v0.2 라운드)

- `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret 등록
- `release.yml`에 signing env 주입 및 `latest.json` artifact 업로드 확인
- key.pub를 `tauri.conf.json`에 커밋 (public 값이므로 안전)

---

## 검토 항목 (착수 전 체크)

- [ ] `tauri-plugin-updater` 2.x API 안정성 확인 (tauri-apps/plugins-workspace)
- [ ] `latest.json` 포맷이 tauri-action v0.6.2 출력과 일치하는지 검증
- [ ] macOS Gatekeeper: 서명된 `.dmg`와 updater 서명이 공존 가능한지 확인
- [ ] Windows SmartScreen: `.msi` 자동 업데이트 시 UAC 프롬프트 여부
- [ ] 네트워크 오류 / 서버 다운 시 업데이터가 앱 시작을 block하지 않는지

---

## 관련 파일 (v0.2 변경 예정)

| 파일 | 변경 주체 |
|------|----------|
| `apps/desktop/src-tauri/Cargo.toml` | C |
| `apps/desktop/src-tauri/src/lib.rs` | C |
| `apps/desktop/src-tauri/src/commands/updater.rs` | C (신규) |
| `apps/desktop/src-tauri/capabilities/default.json` | C |
| `apps/desktop/src-tauri/tauri.conf.json` | C + D |
| `apps/desktop/src/lib/ipc.ts` | C (시그니처) |
| `.github/workflows/release.yml` | D |
| `docs/RELEASE.md` | D |
