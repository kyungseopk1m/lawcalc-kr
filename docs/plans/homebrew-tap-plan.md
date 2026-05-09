# Homebrew Tap Plan (v0.2 후보)

v0.1.0 release 후 검증, 본 패스에서 plan 문서만. 코드 변경 0.

## 목표

macOS 사용자가 `.dmg` 수동 다운로드 없이 `brew install` 한 줄로 설치할 수 있도록 별도 tap 레포를 운영한다.

## 레포 구조

별도 GitHub 레포 `kyungseopk1m/homebrew-lawcalc-kr` (또는 `homebrew-tap`) 를 신규 생성한다.

```
homebrew-lawcalc-kr/
└── Casks/
    └── lawcalc-kr.rb       # macOS Cask formula
```

설치 명령:

```bash
brew tap kyungseopk1m/lawcalc-kr
brew install --cask lawcalc-kr
```

## Cask Formula 초안

```ruby
cask "lawcalc-kr" do
  version "0.1.0"
  sha256 "<universal-dmg-sha256>"

  url "https://github.com/kyungseopk1m/lawcalc-kr/releases/download/v#{version}/LawCalc.Korea_#{version}_universal.dmg"
  name "LawCalc Korea"
  desc "한국 판결금 이자·지연손해금 계산 워크벤치"
  homepage "https://github.com/kyungseopk1m/lawcalc-kr"

  app "LawCalc Korea.app"

  zap trash: [
    "~/Library/Application Support/lawcalc-kr",
    "~/Library/Preferences/com.kyungseopk1m.lawcalc-kr.plist",
  ]
end
```

### 체크 항목

- `url` 경로는 `tauri-apps/tauri-action` 가 생성하는 실제 artifact 이름과 일치해야 한다.  
  `tauri.conf.json → bundle.identifier / productName` 기준으로 결정된다.
- `sha256` 는 release 빌드 후 `shasum -a 256 <artifact.dmg>` 로 계산한다.
- universal binary (`--target universal-apple-darwin`) 를 단일 dmg 로 묶어야 arm64/x86_64 공통 설치 가능.
- Apple notarization 미완료 시 Cask 에 `caveat` 블록으로 Gatekeeper 우회 안내를 추가한다.

```ruby
  caveat <<~EOS
    v#{version}은 Apple notarization을 아직 진행하지 않았습니다.
    처음 실행할 때 Gatekeeper 경고가 표시되면 시스템 설정 → 개인정보 보호 및 보안에서 실행을 허용하세요.
  EOS
```

## 릴리스 연동 계획

v0.1.0 draft artifact 확인 후:

1. `homebrew-lawcalc-kr` 레포를 GitHub 에 생성 (Public, MIT 또는 BSD).
2. Cask formula 에 실제 `sha256` 와 `url` 채우기.
3. `brew audit --cask lawcalc-kr` 통과 확인.
4. README 설치 섹션에 `brew` 명령 추가.

자동화 (v0.2 이후 검토):

- `release.yml` 에 `update-homebrew-tap` job 을 추가해 tag push 시 formula `version` / `sha256` 를 자동 커밋.

## 의존성

- D-W5 release dry-run 으로 artifact URL 패턴 확정 후 formula url 확정 가능.
- Windows 배포는 Scoop manifest 별도 계획 필요 (본 문서 범위 외).

## 상태

📝 plan 문서 완료. v0.1.0 artifact 확정 후 실행.
