// AUTO-GENERATED. Do not edit by hand.
// Source: data/stamp-duty/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:stamp-duty

import type { StampDutyDataset } from "./stamp-duty-dataset";

export const DEFAULT_STAMP_DUTY_DATASET: StampDutyDataset = {
  "version": "1.2.0",
  "updatedAt": "2026-08-18",
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
    "sourceArticle": "제2조 제2항",
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
      "sourceArticle": "제7조 제2항"
    },
    "settlement": {
      "multiplier": 0.2,
      "rateText": "5분의 1",
      "sourceArticle": "제7조 제1항"
    },
    "mediation": {
      "multiplier": 0.1,
      "rateText": "10분의 1",
      "sourceArticle": "민사조정규칙 제3조 제1항"
    },
    "deemedCaseValues": {
      "standardWon": 50000000,
      "highTierWon": 100000000,
      "sourceArticle": "민사소송 등 인지규칙 제18조의2",
      "sourceText": "재산권상의 소로서 그 소가를 산출할 수 없는 것과 비재산권을 목적으로 하는 소송의 소가는 5천만 원으로 한다. 다만, 제15조제1항 내지 제3항, 제15조의2, 제17조의2, 제18조에 정한 소송의 소가는 1억 원으로 한다.",
      "highTierNote": "회사관계소송·단체소송·특허소송·무체재산권 소송 등 규칙 제15조 제1항부터 제3항까지·제15조의2·제17조의2·제18조에 정한 소송"
    },
    "interlocutoryAppeal": {
      "flatWon": 2000,
      "rateText": "2천원 정액",
      "sourceArticle": "제11조 제2항",
      "underlyingMultiplier": 2,
      "underlyingRateText": "해당 신청서 인지액의 2배",
      "underlyingSourceArticle": "제11조 제1항"
    }
  },
  "provisionalMeasures": {
    "general": {
      "flatWon": 10000,
      "rateText": "정액 1만원",
      "sourceArticle": "제9조 제2항 전단"
    },
    "provisionalStatus": {
      "ratioToMainStampDuty": 0.5,
      "capWon": 500000,
      "rateText": "본안 인지액의 2분의 1 (상한 50만원)",
      "sourceArticle": "제9조 제2항 후단"
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
  },
  "claimAmendment": {
    "sourceArticle": "제5조",
    "sourceText": "제5조(청구변경신청서) 청구변경신청서에는 심급에 따라 다음 각 호에 해당하는 금액의 인지를 붙여야 한다. 1. 제1심의 경우에는 변경 후의 청구에 관한 제2조에 따른 금액에서 변경 전의 청구에 관한 인지액을 뺀 금액 2. 항소심의 경우에는 변경 후의 청구에 관한 제2조에 따른 금액의 1.5배에서 변경 전의 청구에 관한 인지액을 뺀 금액",
    "afterMultipliers": {
      "firstInstance": 1,
      "appeal": 1.5
    },
    "beforeMultiplier": 1,
    "note": "대법원 전자소송 소송비용계산이 민사·가사·행정 세 탭에서 동일하게 고지한 산식이다. 제1심 = (변경 후 인지액 - 변경 전 인지액) x 0.9, 제2심 = (변경 후 인지액 x 1.5 - 변경 전 인지액) x 0.9. 심급 배수를 변경 후 항에만 곱하고 변경 전 항에는 곱하지 않는 것이 고지 원문 그대로이며, 제5조 각 호가 배수를 '변경 후의 청구에 관한 제2조에 따른 금액'에만 붙이고 뺄 항은 '변경 전의 청구에 관한 인지액'으로 둔 구조와 맞는다. 뺄 항이 심급 배수와 무관한 '변경 전의 청구에 관한 인지액'이므로, 변경 전 실제 납부액이 소가 역산값과 다르면 beforeStampDutyWon 으로 직접 넣는다.",
    "electronicDiscountPolicy": "각 항을 종이소송 기준으로 먼저 계산하고, 차액에 전자소송 감액을 한 번만 곱한다. 항마다 0.9 를 곱해 빼면 안 된다.",
    "sourceRef": "조문 원문은 법제처 국가법령정보 「민사소송 등 인지법」(법령ID 001195, 2009-05-08 전문개정, 2025-03-01 시행) 제5조, 2026-08-27 확인. 산식은 대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 민사·가사·행정 탭 고지"
  }
};
