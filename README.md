<p align="center">
  <img src="docs/assets/readme-hero.png" alt="LawCalc Korea 서비스 소개 이미지" width="900">
</p>

<h1 align="center">LawCalc Korea</h1>

<p align="center">
  <b>판결금 이자·지연손해금, 상속분, 소송비용, 변제충당, 손해배상을 로컬에서 계산하는 데스크톱 워크벤치</b><br>
  <sub>본질에 집중한 법률 계산 워크벤치 · 사건 정보는 외부로 전송하지 않습니다</sub>
</p>

<p align="center">
  <img alt="Latest release" src="https://img.shields.io/github/v/release/kyungseopk1m/lawcalc-kr?display_name=tag&label=release">
  <img alt="Tauri 2.x" src="https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri&logoColor=white">
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/License-AGPL--3.0-3DA639">
  <img alt="Platforms" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey">
</p>

<p align="center">
  <a href="https://github.com/kyungseopk1m/lawcalc-kr/releases/download/v0.5.0/LawCalc.Korea_0.5.0_universal.dmg"><img alt="macOS 다운로드" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  &nbsp;
  <a href="https://github.com/kyungseopk1m/lawcalc-kr/releases/download/v0.5.0/LawCalc.Korea_0.5.0_x64-setup.exe"><img alt="Windows 다운로드" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
</p>

> **면책 고지**
> 본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.
> 계산 근거와 독립성 명시: [docs/LEGAL_REFERENCES.md](docs/LEGAL_REFERENCES.md)

LawCalc Korea는 반복되는 법률 계산을 검산 가능한 형태로 정리하는 로컬 데스크톱 앱입니다. 현재 데스크톱 앱은 이자 / 상속 / 소송비용 / 변제충당 / 손해배상 5개 도메인을 한 화면 흐름에서 다루며, 원금·기간·이율, 상속인, 소가·당사자수, 채권 잔액·변제액, 노동력상실률·일실수입처럼 자주 바뀌는 입력값부터 결과표, 적용 근거, 저장·내보내기까지 로컬에서 처리합니다.

## 주요 기능

### 판결금 이자·지연손해금 계산

<p align="center">
  <img src="docs/assets/readme-interest.png" alt="판결금 이자 계산 화면" width="820">
</p>

원금, 계산 기간, 법정이율 프리셋, 직접 지정한 이율 구간을 조합해 계산합니다. 결과표에는 구간별 일수, 적용 이율, 계산 공식, 이자, 원리금 합계가 함께 표시됩니다.

### 상속분 간이 계산

<p align="center">
  <img src="docs/assets/readme-inheritance.png" alt="상속분 간이 계산 화면" width="820">
</p>

피상속인, 배우자, 1~4순위 상속인과 1차 대습상속인을 입력해 법정상속분을 계산합니다. 결과에는 약분 전/후 지분과 백분율을 함께 표시해 검산하기 쉽게 정리합니다.

현재 상속분 계산은 1991-01-01 이후 사망 케이스와 1차 대습상속까지만 지원합니다. 자세한 범위는 [docs/LEGAL_REFERENCES.md](docs/LEGAL_REFERENCES.md)의 “현재 상속 범위” 섹션을 확인해 주세요.

### 소송비용 계산

<p align="center">
  <img src="docs/assets/readme-litigation-cost.png" alt="소송비용 계산 화면" width="820">
</p>

인지대, 송달료, 변호사보수를 함께 계산하고 합계와 분배표를 확인합니다. 사건구분, 소가, 당사자수, 항소·상고 불복 범위, 전자소송, 지급명령·화해, 변호사보수 감액 옵션, 대한법률구조공단 기준, 접수일을 입력할 수 있습니다.

결과에는 각 항목의 금액과 한국어 산식, 데이터 버전, 대한법률구조공단 적용 경고, 균등 또는 소가비례 분배표가 함께 표시됩니다. 자세한 범위와 근거는 [docs/LEGAL_REFERENCES.md](docs/LEGAL_REFERENCES.md)의 “현재 소송비용 범위” 섹션을 확인해 주세요.

### 변제충당 계산

<p align="center">
  <img src="docs/assets/readme-appropriation.png" alt="변제충당 계산 화면" width="820">
</p>

여러 채권의 비용·이자·원본 잔액과 변제액을 입력해 지정충당 또는 법정충당 순서로 차감합니다. 결과에는 채권별 비용·이자·원본 차감액, 잔액, 데이터 버전, 계산 시각을 함께 표시합니다.

### 손해배상 계산

<p align="center">
  <img src="docs/assets/readme-compensation.png" alt="손해배상 계산 화면" width="820">
</p>

자동차 사고 부상 범위를 먼저 지원합니다. 생년월일·사고일자·치료종료일, 영구/한시 노동력상실률, 직종 자동입력 또는 일당 직접 입력, 위자료, 과실비율, 비율/전액 공제를 입력하면 10단계 계산 흐름으로 일실수입 구간, 호프만 240 한도 적용, 과실상계·공제 후 최종 합계를 표시합니다. 결과에는 `compensation@1` 기능 ID, `labor-rates` / `life-expectancy` / `hoffman` / `leibniz` 데이터셋 식별자, 대한건설협회 시중노임 스냅샷 경과 안내, 면책 고지를 함께 표시합니다.

| 데이터셋                            | 출처와 처리                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `labor-rates/v1.0.0`                | 대한건설협회 시중노임 단가. 프로젝트 라이선스 검토에서 허용된 방식으로 번들하며, 앱은 직종 자동입력과 일당 직접 입력을 항상 함께 제공합니다. |
| `life-expectancy/v1.0.0`            | 통계청 KOSIS 생명표. KOSIS 이용 안내상 자유 이용·재사용·재배포 가능 범위로 확인하고 출처표시·왜곡 금지 원칙을 따릅니다.                      |
| `hoffman/v1.0.0` / `leibniz/v1.0.0` | 할인율 5% 기준 정적 수학표입니다. 호프만 표는 월 단위 단리연금현가율과 240 한도 정보를 포함합니다.                                           |

### 공통 워크플로

<p align="center">
  <img src="docs/assets/readme-info-dialog.png" alt="정보 다이얼로그 화면" width="520">
</p>

- **법정이율 데이터셋** — 민법 5%, 상법 6%, 소송촉진 등에 관한 특례법 이율 변경 이력을 버전 관리합니다.
- **계산 옵션** — 초일 산입 여부, 윤년 처리, 원 단위 절사·절상·반올림을 선택할 수 있습니다.
- **로컬 저장 (`.lcalc`)** — 입력값, 옵션, 결과, 데이터 버전을 한 파일로 저장해 같은 계산을 다시 열 수 있습니다.
- **내보내기** — PDF, CSV, 클립보드 텍스트로 계산 결과를 정리합니다.

## 다운로드

릴리스 자산은 [GitHub Releases](https://github.com/kyungseopk1m/lawcalc-kr/releases/latest) 에서 받을 수 있습니다.

### macOS

1. 일반 사용자는 `.dmg` 설치 파일을 내려받아 앱을 Applications 폴더로 옮긴 뒤 실행합니다.
2. 현재는 Apple Notarization 을 진행하지 않아 Gatekeeper 경고가 표시될 수 있습니다.
   - Finder 에서 앱을 **Control-클릭 → 열기** 를 한 번 선택하거나
   - **시스템 설정 → 개인정보 보호 및 보안** 에서 실행을 허용해 주세요.

### Windows

1. 일반 사용자는 `setup.exe` 설치 파일을 내려받아 설치 마법사를 따릅니다.
   - 기관/관리자 배포가 필요한 경우 `.msi` 설치 파일을 사용할 수 있습니다.
2. Windows SmartScreen 이 "게시자 확인 안 됨" 으로 표시될 수 있습니다. 본인이 직접 받은 파일임을 확인한 뒤 **추가 정보 → 실행** 으로 진행합니다.

`latest.json`, `.sig`, `.app.tar.gz` 파일은 인앱 자동업데이트 검증용 자산이므로 일반 사용자가 직접 내려받을 필요는 없습니다.

## `.lcalc` 파일

`.lcalc` 는 입력값·계산 옵션·적용 데이터 버전·결과·면책 고지를 한 데 묶어 저장하는 재현용 JSON 파일입니다. 사건 정보는 외부 서버로 전송하지 않고 로컬 파일로만 저장됩니다.

현재 저장 형식은 `schemaVersion: "3"` 저장 형식입니다. `kind` 값으로 `interest`, `inheritance`, `litigation-cost`, `appropriation`, `compensation` 계산 유형을 구분하고, `envelopeFeatures`와 `dataVersions`로 파일 호환성과 데이터셋 버전을 빠르게 확인합니다. v0.1.x/v0.2.x 파일은 불러올 때 v3로 자동 마이그레이션됩니다.

## 개발

요구사항: Node.js 24 · pnpm 10 · Rust stable.

```bash
pnpm install
pnpm tauri:dev      # 데스크톱 앱 개발 모드
pnpm tauri:build    # 릴리스 패키징 (.dmg / .msi)
pnpm test           # 단위·통합 테스트
pnpm test:golden    # 골든 케이스 회귀 테스트
pnpm lint           # ESLint + Prettier
node scripts/capture-screens.mjs  # README 스크린샷 자동 재캡처
```

기여 절차·릴리스 워크플로·테스트 정책은 [`CONTRIBUTING.md`](CONTRIBUTING.md) 를 참고해 주세요. 버그 신고와 기능 제안은 [Issues](https://github.com/kyungseopk1m/lawcalc-kr/issues) 에서 받습니다.

## 헌사 / Acknowledgments

이 프로젝트는 2007년 광주지방법원 정경현 부장판사님이 업무용 계산프로그램(VK.EXE)을 일반 공개하면서 시작된 흐름 위에 있습니다. 법률 계산 도구를 모두에게 열어 주신 그 결정에 깊은 경의를 표합니다.

This project stands on the shoulders of Hon. Jung Kyungheon (J., Gwangju District Court), whose 2007 public release of the VK.EXE court calculation utility first made these calculations accessible to everyone.

## 라이선스

이 프로젝트는 GNU Affero General Public License v3.0 (이상)으로 배포됩니다. 누구나 자유롭게 사용·수정·재배포할 수 있으며, 수정본을 네트워크 서비스로 제공하거나 재배포할 경우 동일 라이선스로 소스 코드를 공개해야 합니다. 자세한 내용은 [LICENSE](LICENSE) 를 확인하세요.

상업 라이선스가 필요한 경우 Licensor (kyungseopk1m) 에게 문의해 주세요.

> **사용 예시 / 의무 발동 조건**
>
> - 변호사·법무팀이 본인 사무소·기업 내부에서 독립 실행형 데스크톱 앱으로 사용 → AGPL 의무 발동 0 (내부 사용).
> - 본 코드를 자체 SaaS·웹·다중 사용자 시스템에 통합해 외부에 제공 → 동일 라이선스로 소스 공개 강제.

## English

LawCalc Korea is a Korean legal calculation desktop workbench for reviewing judgment interest, statutory delay damages, simplified inheritance shares, litigation costs, payment appropriation, and the first auto/injury compensation slice.

The current release focuses on local-only interest, inheritance, litigation-cost, appropriation, and compensation calculations, transparent result traces, versioned data, and reproducible `.lcalc` files on macOS and Windows.

Distributed under the GNU Affero General Public License v3.0 or later. Any modified version made available to users over a network — or redistributed as a derivative work — must be released under the same license with source code available. See [LICENSE](LICENSE) for the full text. For commercial licensing inquiries, please contact the Licensor (kyungseopk1m).
