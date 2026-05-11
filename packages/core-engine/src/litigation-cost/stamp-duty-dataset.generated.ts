// AUTO-GENERATED. Do not edit by hand.
// Source: data/stamp-duty/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:stamp-duty

import type { StampDutyDataset } from "./stamp-duty-dataset";

export const DEFAULT_STAMP_DUTY_DATASET: StampDutyDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-05-11",
  "sourceLaw": {
    "name": "민사소송 등 인지법",
    "lsId": "001195",
    "currentEffectiveFrom": "2025-03-01",
    "currentLawNumber": "법률 제20003호",
    "sourceUrl": "https://law.go.kr/lsInfoP.do?lsiSeq=165498"
  },
  "roundingPolicy": {
    "floorMinimumWon": 1000,
    "truncateBelowWon": 100,
    "sourceArticle": "제2조 ②항",
    "note": "산출 1,000원 미만은 1,000원으로 하고, 1,000원 이상이면 100원 미만은 절사."
  },
  "brackets": [
    {
      "name": "1구간 (1천만원 미만)",
      "sortOrder": 1,
      "scopeStart": 0,
      "scopeEnd": 10000000,
      "baseAmount": 0,
      "rate": 0.005,
      "rateText": "1만분의 50"
    },
    {
      "name": "2구간 (1천만원 이상 1억원 미만)",
      "sortOrder": 2,
      "scopeStart": 10000000,
      "scopeEnd": 100000000,
      "baseAmount": 5000,
      "rate": 0.0045,
      "rateText": "1만분의 45 + 5천원"
    },
    {
      "name": "3구간 (1억원 이상 10억원 미만)",
      "sortOrder": 3,
      "scopeStart": 100000000,
      "scopeEnd": 1000000000,
      "baseAmount": 55000,
      "rate": 0.004,
      "rateText": "1만분의 40 + 5만5천원"
    },
    {
      "name": "4구간 (10억원 이상)",
      "sortOrder": 4,
      "scopeStart": 1000000000,
      "scopeEnd": null,
      "baseAmount": 555000,
      "rate": 0.0035,
      "rateText": "1만분의 35 + 55만5천원"
    }
  ],
  "appealsMultipliers": {
    "firstInstance": 1,
    "appeal": 1.5,
    "supreme": 2,
    "sourceArticle": "제3조"
  },
  "specialProcedures": {
    "paymentOrder": {
      "multiplier": 0.1,
      "rateText": "10분의 1",
      "sourceArticle": "제7조 ②항"
    },
    "settlement": {
      "multiplier": 0.2,
      "rateText": "5분의 1",
      "sourceArticle": "제7조 ①항"
    }
  },
  "electronicFilingDiscount": {
    "multiplier": 0.9,
    "rateText": "10분의 9",
    "sourceArticle": "제16조",
    "effectiveFrom": "2011-10-19",
    "sourceLawNumber": "법률 제10860호 (2011-07-18 공포)"
  },
  "historyNote": {
    "bracketTableStableSince": "1997-12-13 (확인 가능 최초 시점, 법률 제5428호 시행 시점부터 현행과 동일)",
    "paymentOrderChangedAt": "2002-07-01 (1/2 → 1/10, 법률 제6628호)",
    "electronicFilingIntroducedAt": "2011-10-19 (법률 제10860호 제16조 신설)",
    "refundIntroducedAt": "2004-02-01 (법률 제7081호 제14조 신설)"
  }
};
