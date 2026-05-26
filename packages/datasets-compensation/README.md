# @lawcalc-kr/datasets-compensation

손해배상 (compensation) 도메인이 사용하는 dataset loader 모음. v0.5 자×부상 정원 = 4 dataset + 1 staleness utility.

## 책임 범위

- `hoffman` — 호프만 단리연금현가율 표 (월 단위, 5%/년, 240 cap)
- `leibniz` — 라이프니츠 복리연금현가율 표
- `labor-rates` — 노임실태조사 직종별 평균임금 (CAK 발표)
- `life-expectancy` — 한국인 기대여명표 (KOSIS / 통계청)
- `stale-badge` — 외부 dataset 의 staleness UI 등급 계산 (`≤ 6m` neutral / `6~12m` amber / `> 12m` red)

## 정합

- 모든 dataset 의 단일 source = repo-root `data/<dataset-id>/v<N>.json`. `scripts/sync-<id>.mjs` 가 빌드 타임에 `src/<id>.dataset.generated.ts` 로 inline.
- `prebuild` / `pretest` 가 `pnpm sync:datasets` 자동 트리거.
- `IsoDate` 타입은 본 패키지에서 자체 정의 (`type IsoDate = string`). core-engine 의존 0.

## 외부 의존

- 없음 (pure TypeScript). v0.5.2 monorepo split 정원에서 core-engine 역방향 의존을 끊기 위한 결정.

## 도메인 확장

v0.6+ 의 자×사망 / 산재 / 기타손해 도메인이 추가 dataset (예: 산재 평균임금, 노동능력상실표 v2) 을 도입할 때 본 패키지에 sub-loader 로 흡수. dataset 자체 격상 (예: hoffman 표 갱신) 은 `data/<id>/v<N>.json` 의 N 증가 + sync script 재실행 정원.
