# lawcalc-kr — 한국 법률 계산 워크벤치 (맥/윈도우)

## 판결금·지연손해금 이자 계산기 (Tauri + React + Rust)

lawcalc-kr는 판결금 이자, 지연손해금 계산, 손해배상 이자 산정을 투명하게 검토하기 위한 데스크톱 법률 계산 워크벤치입니다. 이자 계산기 MVP부터 시작해, 맥 법률 계산기와 Windows 법률 계산기 모두에서 동일한 계산 결과와 근거를 확인할 수 있도록 만드는 것을 목표로 합니다.

> **면책 고지**
>
> 이 도구의 계산 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인 필요합니다.
> lawcalc-kr는 법원 공식 프로그램과 무관한 독립 오픈소스 프로젝트입니다.

## 목표

- 판결금·지연손해금 이자를 구간별로 계산하고 적용 공식과 근거를 함께 표시
- 민법, 상법, 소송촉진 등에 관한 특례법 등 법정이율 데이터를 버전으로 관리
- 입력값과 계산 결과를 재현 가능한 `.lcalc` 파일, CSV, PDF 리포트로 내보내기
- 민감한 사건 정보를 외부 서버로 보내지 않는 100% 로컬 데스크톱 앱 제공
- macOS와 Windows에서 사용할 수 있는 한국 법률 계산 도구 제공

## 현재 상태

초기 W1 인프라 셋업 단계입니다. 계산 엔진, 데스크톱 UI, Tauri 백엔드는 후속 세션에서 순차 구현합니다.

## 기술 스택

- Desktop: Tauri 2.x
- Frontend: React 19, TypeScript 5.9, Vite, Tailwind CSS 4
- Backend: Rust 2021
- Package manager: pnpm 10 workspace
- Test: Vitest, golden test
- CI/Release: GitHub Actions, tauri-action

## 개발

요구사항:

- Node.js 22 LTS
- pnpm 10
- Rust 1.92 이상

```bash
pnpm install
pnpm lint
pnpm test
pnpm test:golden
pnpm build
```

데스크톱 앱 패키지가 추가된 뒤에는 다음 명령을 사용합니다.

```bash
pnpm tauri:dev
pnpm tauri:build
```

## 문서

- [아키텍처](docs/ARCHITECTURE.md)
- [법령 및 공식 자료 참조](docs/LEGAL_REFERENCES.md)
- [면책 정책](docs/DISCLAIMER.md)
- [테스트 전략](docs/TESTING.md)

## 라이선스

이 프로젝트는 Business Source License 1.1로 배포되며, 2031-05-09에 Apache License 2.0으로 전환됩니다. 자세한 내용은 [LICENSE](LICENSE)와 [LICENSE.future](LICENSE.future)를 확인하세요.

## English

lawcalc-kr is a Korean legal calculation desktop workbench for reviewing judgment interest and statutory delay damages. The project is independent from Korean court software and does not use court logos, screens, or reverse-engineered program internals.

The MVP focuses on interest calculation with transparent formulas, legal references, reproducible data versions, and local-only processing on macOS and Windows.
