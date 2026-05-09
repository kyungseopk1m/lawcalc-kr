# lawcalc-kr — 한국 법률 계산 워크벤치

> **본질에 집중한 법률 계산 워크벤치.**
> 불필요한 장식을 덜어내고 계산의 본질을 상징하는 모노그램과 단 하나의 기준선으로 신뢰감과 전문성을 표현했습니다.

## 판결금 이자 계산기 (맥/윈도우)

lawcalc-kr는 판결금 이자, 지연손해금 계산, 손해배상 이자 산정을 검토하기 위한 로컬 데스크톱 법률 계산기입니다. 민감한 사건 정보를 외부 서버로 보내지 않고, macOS와 Windows에서 같은 입력·같은 법정이율 데이터·같은 계산 근거를 확인하는 것을 목표로 합니다.

> **면책 고지**
>
> 이 도구의 계산 결과는 검토용이며 법률 자문이 아닙니다. 사건별 특수성은 변호사 등 전문가 확인이 필요합니다.
> 자세한 출처 / 무관성 명시: [docs/LEGAL_REFERENCES.md](docs/LEGAL_REFERENCES.md)

## 데모

![판결금 이자 계산기 데모](docs/assets/판결금-이자-계산기-demo.gif)

## v0.1.0 기능

| 구분                   | 제공 범위                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| 판결금·지연손해금 계산 | 원금·시작일·종료일·이자율 구간을 입력받아, 초일 산입과 윤년 처리 옵션을 반영해 계산              |
| 법정이율 프리셋        | 민법 5%, 상법 6%, 소송촉진 등에 관한 특례법 이율 변경 이력 반영                                  |
| 끝수 처리              | 원 단위 절사·절상·사사오입 옵션 지원 (미지정 시 절사)                                            |
| 계산 근거 표시         | 구간별 일수·이율·공식·이자·총액을 함께 표시                                                      |
| 로컬 저장              | `.lcalc` JSON 파일로 입력값·옵션·결과·데이터 버전을 함께 저장·로드                               |
| 내보내기               | PDF(A4, 한글 Pretendard 폰트 임베드), CSV(UTF-8 BOM, Excel 한글 호환), 클립보드 텍스트 복사 지원 |

## 설치

### macOS

1. GitHub Releases에서 macOS용 `.dmg` 또는 `.app.tar.gz` 자산을 내려받습니다.
2. 앱을 Applications 폴더로 옮긴 뒤 실행합니다.
3. v0.1.0은 Apple Notarization 을 아직 진행하지 않았습니다. Gatekeeper 경고가 뜨면 Finder 에서 앱을 Control-클릭 후 `열기` 를 선택하거나, **시스템 설정 → 개인정보 보호 및 보안** 메뉴에서 실행을 허용해 주세요.

### Windows

1. GitHub Releases에서 Windows용 `.msi` 설치 파일을 내려받습니다.
2. 설치 마법사를 따라 설치합니다.
3. Windows SmartScreen 경고가 표시되면 게시자 미확인 상태임을 확인한 뒤, 내부 테스트 용도로 실행할지 직접 판단해 주세요.

## .lcalc 파일

`.lcalc`는 입력값, 계산 옵션, 적용 법정이율 데이터 버전, 결과, 면책 고지를 함께 저장하는 재현용 JSON 파일입니다. 사건 정보는 외부 서버로 전송하지 않고 로컬 파일로만 저장합니다.

v0.1.x 는 `schemaVersion: "1"` 파일의 하위 호환을 유지합니다. 새 버전에서 필드가 추가되더라도 기존 파일은 그대로 읽을 수 있어야 합니다. 저장된 `dataVersion` 은 계산 재현성을 판단하는 기준입니다.

## 개발

요구사항:

- Node.js 24
- pnpm 10
- Rust stable

```bash
pnpm install
pnpm lint
pnpm test
pnpm test:golden
pnpm build
```

데스크톱 앱 실행과 패키징:

```bash
pnpm tauri:dev
pnpm tauri:build
```

## 문서

- [아키텍처](docs/ARCHITECTURE.md)
- [법령 및 공식 자료 참조](docs/LEGAL_REFERENCES.md)
- [면책 정책](docs/DISCLAIMER.md)
- [테스트 전략](docs/TESTING.md)
- [개발 워크플로](docs/DEV_WORKFLOW.md)
- [릴리스 체크리스트](docs/RELEASE.md)
- [첫 사용자 테스트 계획](docs/USER_TEST_PLAN.md)

## Acknowledgments

이 프로젝트는 2007년 광주지방법원 정경현 부장판사님이 업무용 계산프로그램(VK.EXE)을 일반 공개하면서 시작된 흐름 위에 있습니다. 법률 계산 도구를 모두에게 열어 주신 그 결정에 깊은 경의를 표합니다.

This project stands on the shoulders of Hon. Jung Kyungheon (J., Gwangju District Court), whose 2007 public release of the VK.EXE court calculation utility first made these calculations accessible to everyone.

## 라이선스

이 프로젝트는 GNU Affero General Public License v3.0 (이상)으로 배포됩니다. 누구나 자유롭게 사용·수정·재배포할 수 있으며, 수정본을 네트워크 서비스로 제공하거나 재배포할 경우 동일 라이선스로 source code를 공개해야 합니다. 자세한 내용은 [LICENSE](LICENSE)를 확인하세요.

상업 라이선스가 필요한 경우 Licensor (kyungseopk1m) 에게 문의해 주세요.

> **사용 예시 / 의무 발동 조건**
>
> - 변호사·법무팀이 본인 사무소·기업 내부에서 stand-alone 데스크톱 앱으로 사용 → AGPL 의무 발동 0 (internal use).
> - 본 코드를 자체 SaaS·웹·다중 사용자 시스템에 통합해 외부에 제공 → 동일 라이선스로 source 공개 강제.

## English

lawcalc-kr is a Korean legal calculation desktop workbench for reviewing judgment interest and statutory delay damages. The project is independent of Korean court software and does not use court logos, screens, or reverse-engineered program internals.

The v0.1.0 release focuses on local-only interest calculation, transparent formulas, versioned legal-rate data, and reproducible `.lcalc` files on macOS and Windows.

### License

Distributed under the GNU Affero General Public License v3.0 or later. You are free to use, modify, and redistribute the software. Any modified version made available to users over a network — or redistributed as a derivative work — must be released under the same license with source code available. See [LICENSE](LICENSE) for the full text.

For commercial licensing inquiries, please contact the Licensor (kyungseopk1m).
