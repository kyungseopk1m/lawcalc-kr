# Source Materials

이 문서는 공개 저장소에서 참조하는 자료와 보관 정책을 정리합니다. 공식 매뉴얼 본문, 설치 파일, 디컴파일 산출물은 코드 레포에 포함하지 않습니다.

## 보관 정책

- 공개 코드 레포에는 독립적으로 작성한 설명, 출처명, URL, 데이터셋 메타데이터, 계산 입력·기대 출력만 둡니다.
- HWP 매뉴얼과 변환 캐시는 for-claude 내부 `.reference/` 또는 `~/Downloads/reference/` 같은 비공개 경로에서만 참조합니다.
- MSI, EXE, 설치 파일, 추출 리소스, 디컴파일 산출물은 코드 레포 0바이트 원칙을 유지합니다.

## 데이터셋 출처

| 데이터셋              | 경로                           | 출처                                    | 갱신 절차                                                                                                                                                                                        |
| --------------------- | ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 대한건설협회 시중노임 | `data/labor-rates/v1.json`     | 대한건설협회 건설업 임금실태조사 보고서 | 새 적용일 발표가 나오면 PDF/공식 게시판을 확인하고 슬라이스를 누적합니다. 이후 `pnpm sync:datasets` 또는 `pnpm --filter @lawcalc-kr/core-engine sync:labor-rates` 로 생성 데이터셋을 갱신합니다. |
| KOSIS 생명표          | `data/life-expectancy/v1.json` | 통계청 KOSIS 생명표                     | 통계청/KOSIS 최신 생명표 발표를 확인하고 기준값 또는 전체 표 스냅샷을 갱신합니다. 이후 `pnpm sync:datasets` 또는 `pnpm --filter @lawcalc-kr/core-engine sync:life-expectancy` 를 실행합니다.     |
| 호프만                | `data/hoffman/v1.json`         | 할인율 5% 월 단위 단리연금현가율 수학표 | 공식이 바뀌지 않는 정적 데이터셋입니다. 표 생성 로직 변경 시 `pnpm sync:datasets` 또는 `pnpm --filter @lawcalc-kr/core-engine sync:hoffman` 으로 재생성합니다.                                   |
| 라이프니츠            | `data/leibniz/v1.json`         | 할인율 5% 월 단위 복리현가율 수학표     | 공식이 바뀌지 않는 정적 데이터셋입니다. 표 생성 로직 변경 시 `pnpm sync:datasets` 또는 `pnpm --filter @lawcalc-kr/core-engine sync:leibniz` 로 재생성합니다.                                     |

## 손해배상 데이터셋 절차

1. 원자료는 비공개 reference 경로에서 확인합니다. 공개 저장소에는 원문 본문을 복사하지 않습니다.
2. `data/<dataset>/v1.json` 의 `source`, `sourceUrl`, `license`, `snapshotDate`, `snapshotMethod` 를 먼저 갱신합니다.
3. 대한건설협회 시중노임은 기존 슬라이스를 삭제하지 않고 새 적용일 슬라이스를 뒤에 누적합니다. 앱은 계산 기준일에 가장 가까운 과거 슬라이스를 선택합니다.
4. KOSIS 생명표는 스냅샷 연도와 발표일을 명시합니다. 기준값 스냅샷과 전체 표 스냅샷의 범위를 `snapshotMethod` 에 분명히 적습니다.
5. 동기화 스크립트를 실행해 `packages/core-engine/src/compensation/datasets/*.dataset.generated.ts` 를 갱신합니다.
6. 데이터셋 로더 테스트, 도메인 계산 테스트, 골든 테스트를 함께 확인합니다.

## README 스크린샷

README 스크린샷은 `scripts/capture-screens.mjs` 로 재캡처합니다. 스크립트는 `@lawcalc-kr/desktop` vite dev 서버를 `127.0.0.1:1420` strictPort로 띄우고 headless Chrome에서 이자 / 상속 / 소송비용 / 변제충당 / 손해배상 5개 탭과 정보 다이얼로그를 저장합니다.
