// AUTO-GENERATED. Do not edit by hand.
// Source: data/life-expectancy/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/datasets-compensation sync:life-expectancy

import type { LifeExpectancyDataset } from "./life-expectancy";

export const DEFAULT_LIFE_EXPECTANCY_DATASET: LifeExpectancyDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-05-17",
  "source": "통계청 KOSIS 생명표 (2023년 사망률 기준, 2024-12 발표)",
  "sourceUrl": "https://www.korea.kr/briefing/policyBriefingView.do?newsId=156664008",
  "license": "KOSIS 자유 사용·재사용·재배포·상업적 활용 허용 (출처표시 + 왜곡 금지). 출처: 통계청 KOSIS 생명표 (https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B42).",
  "snapshotDate": "2024-12-04",
  "publicationYear": 2024,
  "mortalityBaseYear": 2023,
  "snapshotMethod": "통계청 보도자료(2023년 생명표 작성 결과) 본문에 직접 노출된 기준값 5개(0 / 40 / 60 / 65 / 80)만 담은 스냅샷입니다. 0~120세 1세 단위 전체 표는 KOSIS Open Data API 또는 SDMX 덤프로 별도 커밋에서 갱신할 예정입니다. 현재 조회는 기준값과 정확히 일치할 때만 값을 반환하며, 보간값은 사용하지 않습니다(entries 외 age = undefined). 트랙 A 엔진 연결 진입 전 원자료 갱신을 권장합니다.",
  "tables": {
    "male": [
      {
        "age": 0,
        "remainingYears": 80.6
      },
      {
        "age": 40,
        "remainingYears": 41.6
      },
      {
        "age": 60,
        "remainingYears": 23.4
      },
      {
        "age": 65,
        "remainingYears": 19.2
      },
      {
        "age": 80,
        "remainingYears": 8.3
      }
    ],
    "female": [
      {
        "age": 0,
        "remainingYears": 86.4
      },
      {
        "age": 40,
        "remainingYears": 47.2
      },
      {
        "age": 60,
        "remainingYears": 28.2
      },
      {
        "age": 65,
        "remainingYears": 23.6
      },
      {
        "age": 80,
        "remainingYears": 10.7
      }
    ]
  }
};
