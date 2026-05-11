// AUTO-GENERATED. Do not edit by hand.
// Source: data/delivery/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:delivery

import type { DeliveryDataset } from "./delivery-dataset";

export const DEFAULT_DELIVERY_DATASET: DeliveryDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-05-11",
  "sourceLaw": {
    "name": "송달료규칙",
    "lsId": "223133",
    "currentEffectiveFrom": "2020-11-26",
    "currentRuleNumber": "대법원규칙 제2921호",
    "sourceUrl": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=223133"
  },
  "matrixDelegation": {
    "name": "송달료규칙의 시행에 따른 업무처리요령",
    "alias": "재일 87-4",
    "sourceUrl": "https://glaw.scourt.go.kr/wsjo/gchick/sjo330.do?contId=3203547",
    "note": "사건구분별 송달 횟수 매트릭스는 본 재판예규 별표 1 에 위임"
  },
  "unitPriceHistory": [
    {
      "effectiveFrom": "2025-06-01",
      "unitPriceWon": 5500,
      "secondaryUnitPriceWon": 5280,
      "secondaryNote": "공탁 및 우표 사용 업무 별도 단가",
      "sourceRef": "대법원규칙 개정 제2025-24호 + 등기 수수료 인상",
      "sourceUrl": "https://www.scourt.go.kr/portal/news/NewsViewAction.work?seqnum=2588"
    },
    {
      "effectiveFrom": "2021-09-01",
      "unitPriceWon": 5200,
      "secondaryUnitPriceWon": 4980,
      "secondaryNote": "공탁 및 우표 사용 업무 별도 단가",
      "sourceRef": "과학기술정보통신부 고시 제2021-52호 + 송달료규칙 시행에 따른 업무처리요령 별표 1",
      "sourceUrl": "https://www.koreanbar.or.kr/pages/news/view.asp?seq=11477"
    },
    {
      "effectiveFrom": "2020-07-01",
      "unitPriceWon": 5100,
      "secondaryUnitPriceWon": 4880,
      "secondaryNote": "공탁 및 우표 사용 업무 별도 단가",
      "sourceRef": "국내통상 우편요금 + 회송우편료 인상에 따른 업무처리요령 별표 1 개정",
      "sourceUrl": "https://korea.legal"
    },
    {
      "effectiveFrom": "2019-05-01",
      "unitPriceWon": 4800,
      "secondaryUnitPriceWon": 4580,
      "secondaryNote": "공탁 및 우표 사용 업무 별도 단가",
      "sourceRef": "국내통상 우편요금 인상에 따른 업무처리요령 별표 1 개정",
      "sourceUrl": "https://www.lawtimes.co.kr/news/152830"
    }
  ],
  "countMatrix": [
    {
      "caseType": "civilFirstInstanceCollegial",
      "labelKo": "민사 제1심 합의 (가합)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 15
      },
      "verifiedBy": [
        "easylaw.go.kr",
        "korea.legal"
      ]
    },
    {
      "caseType": "civilFirstInstanceSingle",
      "labelKo": "민사 제1심 단독 (가단)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 15
      },
      "verifiedBy": [
        "easylaw.go.kr",
        "korea.legal"
      ]
    },
    {
      "caseType": "civilSmallClaims",
      "labelKo": "민사 소액 (가소)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 10
      },
      "verifiedBy": [
        "easylaw.go.kr",
        "korea.legal"
      ]
    },
    {
      "caseType": "civilAppeal",
      "labelKo": "민사 항소 (나)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 12
      },
      "verifiedBy": [
        "easylaw.go.kr",
        "korea.legal"
      ]
    },
    {
      "caseType": "civilSupremeAppeal",
      "labelKo": "민사 상고 (다)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 8
      },
      "verifiedBy": [
        "easylaw.go.kr",
        "korea.legal"
      ]
    },
    {
      "caseType": "civilInterlocutoryAppeal",
      "labelKo": "민사 (재)항고 (라/마)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "easylaw.go.kr"
      ]
    },
    {
      "caseType": "civilMediation",
      "labelKo": "민사조정 (머)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "easylaw.go.kr"
      ]
    },
    {
      "caseType": "familyFirstInstanceCollegial",
      "labelKo": "가사 제1심 합의 (드합)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 15
      },
      "verifiedBy": [
        "korea.legal"
      ]
    },
    {
      "caseType": "familyFirstInstanceSingle",
      "labelKo": "가사 제1심 단독 (드단)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 15
      },
      "verifiedBy": [
        "korea.legal"
      ]
    },
    {
      "caseType": "administrativeFirstInstance",
      "labelKo": "행정 제1심 (구)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 10
      },
      "verifiedBy": [
        "korea.legal"
      ]
    },
    {
      "caseType": "provisionalMeasureCollegial",
      "labelKo": "민사가압류·가처분 등 합의 (카합)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 3
      },
      "verifiedBy": [
        "easylaw.go.kr"
      ]
    },
    {
      "caseType": "provisionalMeasureSingle",
      "labelKo": "민사가압류·가처분 등 단독 (카단)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 3
      },
      "verifiedBy": [
        "easylaw.go.kr"
      ]
    }
  ],
  "unverifiedMatrix": [
    {
      "caseType": "paymentOrder",
      "labelKo": "독촉사건 (지급명령, 차)",
      "draftFormula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verificationPending": "재일 87-4 별표 1 본문 직접 확보 (glaw.scourt.go.kr contId=3203547) 대기 — v0.3.1 patch 영역. 실무상 신청서·각하·이의신청 등으로 3~5회 추정."
    }
  ],
  "historyNote": {
    "ruleChanges": [
      {
        "effectiveFrom": "2020-11-26",
        "ruleNumber": "대법원규칙 제2921호",
        "summary": "일부개정 (본 dataset 기준 슬라이스)"
      },
      {
        "effectiveFrom": "2012-12-03",
        "ruleNumber": "대법원규칙 제2432호",
        "summary": "일부개정 (직전 슬라이스)"
      }
    ],
    "unitPriceChangesCount": 4,
    "matrixDelegationAnchor": "재일 87-4 별표 1 (재판예규)",
    "roundingPolicyNote": "송달료 자체는 정수 산출 (회당 단가 × 횟수). 별도 floor/truncate 정책 부재. PR 5 분배 모듈 진입 시 나머지 처리 정책 분기."
  }
};
