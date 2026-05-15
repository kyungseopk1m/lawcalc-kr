cask "lawcalc-korea" do
  version "0.4.0"
  sha256 "REPLACE_WITH_RELEASE_DMG_SHA256"

  url "https://github.com/kyungseopk1m/lawcalc-kr/releases/download/v#{version}/LawCalc.Korea_#{version}_universal.dmg",
      verified: "github.com/kyungseopk1m/lawcalc-kr/"
  name "LawCalc Korea"
  desc "한국 법률 계산 데스크톱 워크벤치"
  homepage "https://github.com/kyungseopk1m/lawcalc-kr"

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "LawCalc Korea.app"

  caveats <<~EOS
    v#{version}은 Apple notarization을 아직 진행하지 않았습니다.
    처음 실행할 때 Gatekeeper 경고가 표시되면 Finder에서 Control-클릭 후 열기를 선택하거나
    시스템 설정 -> 개인정보 보호 및 보안에서 실행을 허용해 주세요.
  EOS

  zap trash: [
    "~/Library/Application Support/lawcalc-kr",
    "~/Library/Preferences/com.kyungseopk1m.lawcalc-kr.plist",
  ]
end
