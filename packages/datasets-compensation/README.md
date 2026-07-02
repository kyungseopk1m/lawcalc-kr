# @lawcalc-kr/datasets-compensation

손해배상 도메인이 사용하는 데이터셋 로더 모음.

## 제공 데이터셋

- `hoffman` — 호프만 단리연금현가율 표 (월 단위, 연 5%, 240 한도)
- `leibniz` — 라이프니츠 복리연금현가율 표
- `labor-rates` — 대한건설협회 시중노임 직종별 단가
- `life-expectancy` — 통계청 KOSIS 생명표
- `computeStaleBadge` — 외부 데이터셋 스냅샷 경과 등급 (6개월 이하 neutral / 6~12개월 amber / 12개월 초과 red)

## 데이터 관리

- 모든 데이터셋의 단일 출처는 저장소 루트 `data/<dataset-id>/v<N>.json` 이다. `scripts/sync-<id>.mjs` 가 빌드 타임에 `src/<id>.dataset.generated.ts` 로 인라인하며, `prebuild` / `pretest` 훅이 `pnpm sync:datasets` 를 자동 실행한다.
- 데이터셋을 갱신할 때는 JSON 의 `source` / `sourceUrl` / `license` / `snapshotDate` / `snapshotMethod` 메타데이터를 함께 갱신한다.

## 의존성

외부 의존 없음 (순수 TypeScript). core-engine 과의 순환 의존을 피하기 위해 `IsoDate` 타입은 자체 정의한다.
