// AUTO-GENERATED. Do not edit by hand.
// Source: data/delivery/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:delivery

import type { DeliveryDataset } from "./delivery-dataset";

export const DEFAULT_DELIVERY_DATASET: DeliveryDataset = {
  "version": "1.4.0",
  "updatedAt": "2026-10-22",
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
    "currentEffectiveFrom": "2026-03-01",
    "currentRuleNumber": "재판예규 제1950호",
    "sourceUrl": "https://portal.scourt.go.kr/pgp/main.on?w2xPath=PGP1051M04&jisCntntsSrno=2026000031884&c=900&srchwd=%EC%9E%AC%EC%9D%BC%2087-4%20%EB%B3%84%ED%91%9C%201",
    "note": "사건구분별 송달 횟수 매트릭스는 본 재판예규 별표 1에 위임합니다. 본 데이터셋의 countMatrix는 재판예규 제1950호(2026-02-26 개정 / 2026-03-01 시행) 별표 1 본문을 직접 기준으로 삼았습니다."
  },
  "unitPriceHistory": [
    {
      "effectiveFrom": "2026-07-01",
      "unitPriceWon": 5640,
      "secondaryUnitPriceWon": 5420,
      "secondaryNote": "공탁 및 우표 사용 업무 별도 단가. 본 슬라이스의 별도 단가는 공고 원문을 확인하지 못해, 직전 4개 슬라이스에서 일반 단가와의 차액이 220원으로 일정한 점을 따라 같은 차액을 적용한 값입니다. 계산에는 쓰이지 않는 표시용 메타입니다.",
      "sourceRef": "1회 송달료 기준금액 인상 (2026-07-01 시행). 법제처 찾기쉬운 생활법령정보 '인지액 및 송달료' 및 대한법률구조공단 소송비용 자동계산기(본안·보전 양쪽) 고지 '2026. 7. 1. 송달료 5,640원으로 인상 되었습니다' 로 대조했습니다. 법원행정처 1차 공고문 원문은 확인하지 못했습니다.",
      "sourceUrl": "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?csmSeq=568&ccfNo=2&cciNo=4&cnpClsNo=3"
    },
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
        "countPerParty": 3,
        "provisionalStatusCountPerParty": 8
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 1. 민사 가압류·가처분사건(카합) 3회 / 임시의 지위를 정하는 가처분사건(카합) 8회, 신청인·상대방",
        "CourtCalcEx 내장 DB sd.csv KEY 12 3 / KEY 13 8",
        "easylaw.go.kr",
        "당사자수 = 신청인수 + 상대방수"
      ],
      "noteKo": "임시의 지위를 정하는 가처분은 1인당 8회. 가압류·가처분결정에 대한 이의·취소(집행취소는 제외) 사건도 별표 1 상 8회이나 본 데이터셋은 아직 그 신청을 별도로 다루지 않는다"
    },
    {
      "caseType": "provisionalMeasureSingle",
      "labelKo": "민사가압류·가처분 등 단독 (카단)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 3,
        "provisionalStatusCountPerParty": 8
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 1. 민사 가압류·가처분사건(카단) 3회 / 임시의 지위를 정하는 가처분사건(카단) 8회, 신청인·상대방",
        "CourtCalcEx 내장 DB sd.csv KEY 12 3 / KEY 13 8",
        "easylaw.go.kr",
        "당사자수 = 신청인수 + 상대방수"
      ],
      "noteKo": "임시의 지위를 정하는 가처분은 1인당 8회. 가압류·가처분결정에 대한 이의·취소(집행취소는 제외) 사건도 별표 1 상 8회이나 본 데이터셋은 아직 그 신청을 별도로 다루지 않는다"
    },
    {
      "caseType": "paymentOrder",
      "labelKo": "독촉사건 (지급명령, 차)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 6
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01): 독촉사건(차) 6회, 채권자·채무자",
        "portal.scourt.go.kr jisCntntsSrno=2026000031884"
      ]
    },
    {
      "caseType": "executionAssetDisclosure",
      "labelKo": "재산명시 (카명)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 상대방수"
      ]
    },
    {
      "caseType": "executionDebtorRegister",
      "labelKo": "채무불이행자명부 등재·말소 (카불)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 상대방수"
      ]
    },
    {
      "caseType": "executionAssetInquiry",
      "labelKo": "재산조회 (카조)",
      "formula": {
        "kind": "perPartyPlusExtra",
        "countPerParty": 2,
        "extraBasis": "inquiredInstitutions"
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수"
      ],
      "noteKo": "우편에 의하여 재산조회를 실시하는 조회대상 기관의 수를 가산"
    },
    {
      "caseType": "executionRealEstateAuction",
      "labelKo": "부동산등 경매 (타경)",
      "formula": {
        "kind": "partyOffsetTimesCount",
        "countPerParty": 10,
        "partyOffset": 3,
        "partyBasis": "stakeholders"
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청서상의 이해관계인수"
      ]
    },
    {
      "caseType": "executionClaimAttachment",
      "labelKo": "채권등 집행 (타채)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 2
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 채권자수 + 채무자수 + 제3채무자수"
      ],
      "noteKo": "송달을 요하지 아니한 경우는 제외"
    },
    {
      "caseType": "executionOther",
      "labelKo": "기타 집행 (타기)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 2
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 채권자수 + 채무자수 + 제3채무자수"
      ],
      "noteKo": "송달을 요하지 아니한 경우는 제외"
    },
    {
      "caseType": "rehabilitationIndividual",
      "labelKo": "개인회생 (개회)",
      "formula": {
        "kind": "baseCountPlusCreditorMultiple",
        "baseCount": 10,
        "creditorMultiple": 8
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "채권자수 별도 입력"
      ]
    },
    {
      "caseType": "bankruptcyIndividual",
      "labelKo": "개인파산 파산선고 (하단)",
      "formula": {
        "kind": "baseCountPlusCreditorMultiple",
        "baseCount": 10,
        "creditorMultiple": 4
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "채권자수 별도 입력"
      ]
    },
    {
      "caseType": "bankruptcyDischarge",
      "labelKo": "면책 (하면)",
      "formula": {
        "kind": "baseCountPlusCreditorMultiple",
        "baseCount": 10,
        "creditorMultiple": 3
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "채권자수 별도 입력"
      ]
    },
    {
      "caseType": "rehabilitationCorporate",
      "labelKo": "일반회생·법인회생·법인파산 (회합/회단)",
      "formula": {
        "kind": "baseCountPlusCreditorMultiple",
        "baseCount": 40,
        "creditorMultiple": 3
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "채권자수 별도 입력"
      ]
    },
    {
      "caseType": "insolvencyClaimDetermination",
      "labelKo": "채권조사확정재판 (회확)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 상대방수"
      ],
      "noteKo": "법인파산 사건의 채권조사확정재판은 상대방수만 계산"
    },
    {
      "caseType": "familyRuiPetition",
      "labelKo": "가사비송 라류 (느단)",
      "formula": {
        "kind": "range",
        "countMin": 6,
        "countMax": 10,
        "partyBasis": "appellantPlusOpponent"
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 청구인수"
      ]
    },
    {
      "caseType": "familyMaPetition",
      "labelKo": "가사비송 마류 (느합)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 12
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 상대방수"
      ]
    },
    {
      "caseType": "familyAppeal",
      "labelKo": "가사항소 (르)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 12
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피항소인수"
      ]
    },
    {
      "caseType": "familySupremeAppeal",
      "labelKo": "가사상고 (므)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 8
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피상고인수"
      ]
    },
    {
      "caseType": "familyMediation",
      "labelKo": "가사조정 (너)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 피신청인수"
      ]
    },
    {
      "caseType": "familyInterlocutoryAppeal",
      "labelKo": "가사항고·재항고 (브/스)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 6. 가사 가사항고사건(브) 5회 / 가사재항고사건(스) 5회, 항고인·재항고인·상대방",
        "당사자수 = (재)항고인수 + 상대방수"
      ],
      "noteKo": "별표 1 기준 가사항고(브)·가사재항고(스) 모두 5회. CourtCalcEx 내장 DB 는 브 3회로 적혀 있으나 별표 1 개정을 따라가지 못한 낡은 스냅샷이다"
    },
    {
      "caseType": "familyApplication",
      "labelKo": "가사신청 (즈단/즈합)",
      "formula": {
        "kind": "range",
        "countMin": 3,
        "countMax": 8,
        "partyBasis": "appellantPlusOpponent"
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 6. 가사 가사신청사건(즈합, 즈단, 즈기) 3회, 단 가압류·가처분에 대한 이의·취소(집행취소는 제외) 사건은 8회, 신청인·상대방",
        "CourtCalcEx 내장 DB sd.csv KEY 78 3 / KEY 79 8 (같은 부호의 두 행)",
        "당사자수 = 신청인수 + 피신청인수"
      ],
      "noteKo": "가압류·가처분에 대한 이의·취소(집행취소는 제외) 사건은 8회, 그 밖에는 3회"
    },
    {
      "caseType": "administrativeAppeal",
      "labelKo": "행정항소 (누)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 10
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피항소인수"
      ]
    },
    {
      "caseType": "administrativeSupremeAppeal",
      "labelKo": "행정상고 (두)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 8
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피상고인수"
      ]
    },
    {
      "caseType": "administrativeInterlocutoryAppeal",
      "labelKo": "행정항고·재항고 (루/무)",
      "formula": {
        "kind": "range",
        "countMin": 3,
        "countMax": 5,
        "partyBasis": "appellantPlusOpponent"
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 2. 행정 행정항고사건(루) 3회 / 행정재항고사건(무) 5회, 항고인·재항고인·상대방",
        "CourtCalcEx 내장 DB sd.csv KEY 55 '행정항고사건'(루) 3, KEY 56 '행정재항고사건'(무) 5",
        "당사자수 = (재)항고인수 + 상대방수"
      ],
      "noteKo": "행정항고(루) 3회, 행정재항고(무) 5회"
    },
    {
      "caseType": "administrativeApplication",
      "labelKo": "행정신청 (아)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 2
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 피신청인수"
      ]
    },
    {
      "caseType": "patentFirstInstance",
      "labelKo": "특허 1심 (허)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 10
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피고수"
      ],
      "noteKo": "피고가 지식재산처장인 경우 6회분 정액 (33,840원). 별표 1 5. 특허 절과 CourtCalcEx 내장 DB 어디에서도 확인되지 않았고 대법원 전자소송 소송비용계산 고지에서 온 서술이다"
    },
    {
      "caseType": "patentSupremeAppeal",
      "labelKo": "특허상고 (후)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 8
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 피상고인수"
      ],
      "noteKo": "피상고인이 지식재산처장인 경우 6회분 정액 (33,840원). 별표 1 5. 특허 절과 CourtCalcEx 내장 DB 어디에서도 확인되지 않았고 대법원 전자소송 소송비용계산 고지에서 온 서술이다"
    },
    {
      "caseType": "patentInterlocutoryAppeal",
      "labelKo": "특허재항고 (흐)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 원문, 법제처 국가법령정보 별표 서식파일 flSeq=162015279, 2026-08-27 확인: 5. 특허 특허재항고사건(흐) 5회, 재항고인·상대방",
        "CourtCalcEx 내장 DB sd.csv KEY 69 '특허재항고사건'(흐) 5",
        "당사자수 = 재항고인수 + 상대방수"
      ]
    },
    {
      "caseType": "patentApplication",
      "labelKo": "특허신청 (카허)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 5
      },
      "verifiedBy": [
        "재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 5. 특허: 특허신청사건(카허) 5회, 신청인·상대방. 법제처 국가법령정보 별표 서식파일 flSeq=162015279 원문, 2026-08-27 확인",
        "CourtCalcEx 내장 DB sd.csv KEY 71 '특허신청사건' VALUE 5 (PLUS 0 / MUL 0)",
        "당사자수 = 신청인수 + 상대방수"
      ],
      "noteKo": "위헌법률심판제청사건은 제외"
    },
    {
      "caseType": "fineObjection",
      "labelKo": "과태료 결정 이의신청 (과)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 3
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 검사수"
      ]
    },
    {
      "caseType": "nonContentious",
      "labelKo": "비송 (비단/비합, 과태료 제외)",
      "formula": {
        "kind": "simplePerParty",
        "countPerParty": 2
      },
      "verifiedBy": [
        "대법원 전자소송 소송비용계산 (ecfs.scourt.go.kr, PSP007P01.xml) 2026-08-27 확인",
        "당사자수 = 신청인수 + 사건본인수"
      ]
    }
  ],
  "codeTable": [
    {
      "category": "민사",
      "labelKo": "민사제1심합의사건(가합)",
      "codes": [
        "가합"
      ],
      "countText": "15회",
      "countPerParty": 15,
      "recipientsKo": "원고, 피고등",
      "caseType": "civilFirstInstanceCollegial"
    },
    {
      "category": "민사",
      "labelKo": "민사제1심단독사건(가단)",
      "codes": [
        "가단"
      ],
      "countText": "15회",
      "countPerParty": 15,
      "recipientsKo": "원고, 피고등",
      "caseType": "civilFirstInstanceSingle"
    },
    {
      "category": "민사",
      "labelKo": "민사소액사건(가소)",
      "codes": [
        "가소"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "원고, 피고등",
      "caseType": "civilSmallClaims"
    },
    {
      "category": "민사",
      "labelKo": "민사항소사건(나)",
      "codes": [
        "나"
      ],
      "countText": "12회",
      "countPerParty": 12,
      "recipientsKo": "항소인, 피항소인 등",
      "caseType": "civilAppeal"
    },
    {
      "category": "민사",
      "labelKo": "민사상고사건(다)",
      "codes": [
        "다"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "상고인, 피상고인",
      "caseType": "civilSupremeAppeal"
    },
    {
      "category": "민사",
      "labelKo": "민사항고사건(라)",
      "codes": [
        "라"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "항고인, 상대방",
      "caseType": "civilInterlocutoryAppeal"
    },
    {
      "category": "민사",
      "labelKo": "민사재항고사건(마)",
      "codes": [
        "마"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "재항고인, 상대방",
      "caseType": "civilInterlocutoryAppeal"
    },
    {
      "category": "민사",
      "labelKo": "민사특별항고사건(그)",
      "codes": [
        "그"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "특별항고인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "민사준항고사건(바)",
      "codes": [
        "바"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "항고인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "화해사건(자)",
      "codes": [
        "자"
      ],
      "countText": "4회",
      "countPerParty": 4,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "독촉사건(차)",
      "codes": [
        "차"
      ],
      "countText": "6회",
      "countPerParty": 6,
      "recipientsKo": "채권자, 채무자",
      "caseType": "paymentOrder"
    },
    {
      "category": "민사",
      "labelKo": "전자독촉사건(차전)",
      "codes": [
        "차전"
      ],
      "countText": "6회",
      "countPerParty": 6,
      "recipientsKo": "채권자, 채무자"
    },
    {
      "category": "민사",
      "labelKo": "가압류, 가처분사건(카합, 카단)",
      "codes": [
        "카합",
        "카단"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "임시의 지위를 정하는 가처분사건(카합, 카단)",
      "codes": [
        "카합",
        "카단"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "가압류, 가처분결정에 대한 이의, 취소(집행취소는 제외) 사건(카합, 카단)",
      "codes": [
        "카합",
        "카단"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "공시최고사건(카공)",
      "codes": [
        "카공"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인(신문광고 의뢰포함)"
    },
    {
      "category": "민사",
      "labelKo": "담보취소사건(카담)",
      "codes": [
        "카담"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "담보제공, 담보물변경, 담보권리행사최고사건(카담)",
      "codes": [
        "카담"
      ],
      "countText": "2회(단, 담보권리행사최고사건은 3회)",
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "재산명시등사건(카명)",
      "codes": [
        "카명"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방",
      "caseType": "executionAssetDisclosure"
    },
    {
      "category": "민사",
      "labelKo": "채무불이행자명부등재, 명부등재말소사건(카불)",
      "codes": [
        "카불"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "채권자, 채무자",
      "caseType": "executionDebtorRegister"
    },
    {
      "category": "민사",
      "labelKo": "임차권등기명령등사건(카임)",
      "codes": [
        "카임"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "강제집행정지사건(카정)",
      "codes": [
        "카정"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "판결(결정)경정사건(카경)",
      "codes": [
        "카경"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "제소명령사건(카소)",
      "codes": [
        "카소"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "재산조회(카조)",
      "codes": [
        "카조"
      ],
      "countText": "2회(단, 우편에 의하여 재산조회를 실시하는 조회대상 기관의 수를 가산한다)",
      "recipientsKo": "신청인",
      "caseType": "executionAssetInquiry"
    },
    {
      "category": "민사",
      "labelKo": "소송구조사건(카구)",
      "codes": [
        "카구"
      ],
      "countText": "신청인수×2회",
      "recipientsKo": "신청인 등"
    },
    {
      "category": "민사",
      "labelKo": "기타 민사신청사건(카기) (위헌법률심판제청사건은 제외)",
      "codes": [
        "카기"
      ],
      "countText": "2회(단, 의사표시의 공시송달, 법관․직원기피신청, 법원사무관등의 처분에 대한 이의사건은 신청인수×1회)",
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "민사",
      "labelKo": "소송비용액확정신청사건(카확)",
      "codes": [
        "카확"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "부동산등 경매사건(타경)",
      "codes": [
        "타경"
      ],
      "countText": "(신청서상의 이해관계인+3)×10회",
      "recipientsKo": "채권자, 채무자, 이해관계인 등",
      "caseType": "executionRealEstateAuction"
    },
    {
      "category": "민사",
      "labelKo": "채권등 집행사건(타채), 기타 집행사건(타기)",
      "codes": [
        "타채",
        "타기"
      ],
      "countText": "2회(단, 송달을 요하지 아니한 경우에는 제외)",
      "countPerParty": 2,
      "recipientsKo": "채권자, 채무자, 제3채무자"
    },
    {
      "category": "민사",
      "labelKo": "부동산인도명령사건(타인)",
      "codes": [
        "타인"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 피신청인"
    },
    {
      "category": "민사",
      "labelKo": "민사조정사건(머)",
      "codes": [
        "머"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 피신청인",
      "caseType": "civilMediation"
    },
    {
      "category": "민사",
      "labelKo": "비송사건(비합, 비단)(과태료사건은 제외)",
      "codes": [
        "비합",
        "비단"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 사건본인 등",
      "caseType": "nonContentious"
    },
    {
      "category": "민사",
      "labelKo": "과태료결정에 대한 이의신청사건(과)",
      "codes": [
        "과"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 검사",
      "caseType": "fineObjection"
    },
    {
      "category": "민사",
      "labelKo": "회생합의사건(회합)",
      "codes": [
        "회합"
      ],
      "countText": "40회 + (채권자수x3회)",
      "recipientsKo": "신청인 등",
      "caseType": "rehabilitationCorporate"
    },
    {
      "category": "민사",
      "labelKo": "회생단독사건(회단)",
      "codes": [
        "회단"
      ],
      "countText": "40회 + (채권자수x3회)",
      "recipientsKo": "신청인 등",
      "caseType": "rehabilitationCorporate"
    },
    {
      "category": "민사",
      "labelKo": "간이회생합의사건(간회합)",
      "codes": [
        "간회합"
      ],
      "countText": "40회 + (채권자수x3회)",
      "recipientsKo": "신청인 등"
    },
    {
      "category": "민사",
      "labelKo": "간이회생단독사건(간회단)",
      "codes": [
        "간회단"
      ],
      "countText": "40회 + (채권자수x3회)",
      "recipientsKo": "신청인 등"
    },
    {
      "category": "민사",
      "labelKo": "회생채권·회생담보권 조사확정사건(회확)",
      "codes": [
        "회확"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등",
      "caseType": "insolvencyClaimDetermination"
    },
    {
      "category": "민사",
      "labelKo": "회생 손해배상청구권 조사확정사건(회기)",
      "codes": [
        "회기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "회생 부인의 청구사건(회기)",
      "codes": [
        "회기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "파산합의사건(하합)",
      "codes": [
        "하합"
      ],
      "countText": "40회 + (채권자수x3회)",
      "recipientsKo": "신청인, 채무자 등"
    },
    {
      "category": "민사",
      "labelKo": "파산단독사건(하단)",
      "codes": [
        "하단"
      ],
      "countText": "10회 + (채권자수x4회)",
      "recipientsKo": "신청인, 채무자 등",
      "caseType": "bankruptcyIndividual"
    },
    {
      "category": "민사",
      "labelKo": "파산채권 조사확정사건(하확)",
      "codes": [
        "하확"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "파산 손해배상청구권 조사확정사건(하기)",
      "codes": [
        "하기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "파산 부인의 청구사건(하기)",
      "codes": [
        "하기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "면책사건(하면)",
      "codes": [
        "하면"
      ],
      "countText": "10회 + (채권자수×3회)",
      "recipientsKo": "신청인 등",
      "caseType": "bankruptcyDischarge"
    },
    {
      "category": "민사",
      "labelKo": "파산 면책취소사건(하기)",
      "codes": [
        "하기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 채무자 등"
    },
    {
      "category": "민사",
      "labelKo": "복권사건(하기)",
      "codes": [
        "하기"
      ],
      "countText": "10회 + (채권자수×3회)",
      "recipientsKo": "신청인, 채무자 등"
    },
    {
      "category": "민사",
      "labelKo": "개인회생사건(개회)",
      "codes": [
        "개회"
      ],
      "countText": "10회 + (채권자수×8회)",
      "recipientsKo": "신청인, 채권자 등",
      "caseType": "rehabilitationIndividual"
    },
    {
      "category": "민사",
      "labelKo": "개인회생채권 조사확정사건(개확)",
      "codes": [
        "개확"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "개인회생 부인의 청구사건(개기)",
      "codes": [
        "개기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방 등"
    },
    {
      "category": "민사",
      "labelKo": "개인회생 면책취소사건(개기)",
      "codes": [
        "개기"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 채무자 등"
    },
    {
      "category": "민사",
      "labelKo": "국제도산사건(국승, 국지)",
      "codes": [
        "국승",
        "국지"
      ],
      "countText": "4회",
      "countPerParty": 4,
      "recipientsKo": "신청인 등"
    },
    {
      "category": "민사",
      "labelKo": "선박,유류등책임제한사건(책)",
      "codes": [
        "책"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "신청인 등"
    },
    {
      "category": "민사",
      "labelKo": "민사공조사건(러)",
      "codes": [
        "러"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "당사자, 증인 등"
    },
    {
      "category": "행정",
      "labelKo": "행정제1심사건(구단, 구합)",
      "codes": [
        "구단",
        "구합"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "원고, 피고 등",
      "caseType": "administrativeFirstInstance"
    },
    {
      "category": "행정",
      "labelKo": "행정항소사건(누)",
      "codes": [
        "누"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "항소인, 피항소인 등",
      "caseType": "administrativeAppeal"
    },
    {
      "category": "행정",
      "labelKo": "행정상고사건(두)",
      "codes": [
        "두"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "상고인, 피상고인",
      "caseType": "administrativeSupremeAppeal"
    },
    {
      "category": "행정",
      "labelKo": "행정항고사건(루)",
      "codes": [
        "루"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "항고인, 상대방"
    },
    {
      "category": "행정",
      "labelKo": "행정재항고사건(무)",
      "codes": [
        "무"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "재항고인, 상대방"
    },
    {
      "category": "행정",
      "labelKo": "행정특별항고사건(부)",
      "codes": [
        "부"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "특별항고인, 상대방"
    },
    {
      "category": "행정",
      "labelKo": "행정준항고사건(사)",
      "codes": [
        "사"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "항고인, 상대방"
    },
    {
      "category": "행정",
      "labelKo": "행정신청사건(아) (위헌법률심판제청사건은 제외)",
      "codes": [
        "아"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 상대방",
      "caseType": "administrativeApplication"
    },
    {
      "category": "선거",
      "labelKo": "선거소송사건(수)",
      "codes": [
        "수"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "원고, 피고 등"
    },
    {
      "category": "선거",
      "labelKo": "선거상고사건(우)",
      "codes": [
        "우"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "상고인, 피상고인"
    },
    {
      "category": "선거",
      "labelKo": "선거항고(재항고, 준항고, 특별항고)사건(수흐)",
      "codes": [
        "수흐"
      ],
      "countText": "3회(단, 재항고사건은 5회)",
      "recipientsKo": "항고인, 상대방"
    },
    {
      "category": "선거",
      "labelKo": "선거신청사건(주)",
      "codes": [
        "주"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "특수",
      "labelKo": "특수소송사건(추)",
      "codes": [
        "추"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "원고, 피고 등"
    },
    {
      "category": "특수",
      "labelKo": "특수신청사건(쿠)",
      "codes": [
        "쿠"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "신청인, 상대방"
    },
    {
      "category": "특허",
      "labelKo": "특허제1심사건(허)",
      "codes": [
        "허"
      ],
      "countText": "10회",
      "countPerParty": 10,
      "recipientsKo": "원고, 피고 등",
      "caseType": "patentFirstInstance"
    },
    {
      "category": "특허",
      "labelKo": "특허상고사건(후)",
      "codes": [
        "후"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "상고인, 피상고인",
      "caseType": "patentSupremeAppeal"
    },
    {
      "category": "특허",
      "labelKo": "특허재항고사건(흐)",
      "codes": [
        "흐"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "재항고인, 상대방",
      "caseType": "patentInterlocutoryAppeal"
    },
    {
      "category": "특허",
      "labelKo": "특허특별(준)항고사건(히)",
      "codes": [
        "히"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "특별항고인, 상대방"
    },
    {
      "category": "특허",
      "labelKo": "특허신청사건(카허) (위헌법률심판제청사건은 제외)",
      "codes": [
        "카허"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 상대방",
      "caseType": "patentApplication"
    },
    {
      "category": "가사",
      "labelKo": "가사제1심소송사건(드합, 드단)",
      "codes": [
        "드합",
        "드단"
      ],
      "countText": "15회",
      "countPerParty": 15,
      "recipientsKo": "원고, 피고 등"
    },
    {
      "category": "가사",
      "labelKo": "가사항소사건(르)",
      "codes": [
        "르"
      ],
      "countText": "12회",
      "countPerParty": 12,
      "recipientsKo": "항소인, 피항소인 등",
      "caseType": "familyAppeal"
    },
    {
      "category": "가사",
      "labelKo": "가사상고사건(므)",
      "codes": [
        "므"
      ],
      "countText": "8회",
      "countPerParty": 8,
      "recipientsKo": "상고인, 피상고인",
      "caseType": "familySupremeAppeal"
    },
    {
      "category": "가사",
      "labelKo": "가사항고사건(브)",
      "codes": [
        "브"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "항고인, 상대방",
      "caseType": "familyInterlocutoryAppeal"
    },
    {
      "category": "가사",
      "labelKo": "가사재항고사건(스)",
      "codes": [
        "스"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "특별항고인, 상대방",
      "caseType": "familyInterlocutoryAppeal"
    },
    {
      "category": "가사",
      "labelKo": "가사특별항고사건(으)",
      "codes": [
        "으"
      ],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "특별항고인, 상대방"
    },
    {
      "category": "가사",
      "labelKo": "가사신청사건(즈합, 즈단, 즈기) (위헌법률심판제청사건은 제외)",
      "codes": [
        "즈합",
        "즈단",
        "즈기"
      ],
      "countText": "3회〔단, 가압류․가처분에 대한 이의, 취소(집행취소는 제외)사건은 8회〕",
      "recipientsKo": "신청인, 상대방",
      "caseType": "familyApplication"
    },
    {
      "category": "가사",
      "labelKo": "가사조정사건(너)",
      "codes": [
        "너"
      ],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "신청인, 피신청인",
      "caseType": "familyMediation"
    },
    {
      "category": "가사",
      "labelKo": "가사비송사건(느합, 느단)",
      "codes": [
        "느합",
        "느단"
      ],
      "countText": "라류 6회(단, 실종선고, 자의 종전의 성과 본의 계속사용허가, 자의 성과 본의 변경허가, 친양자 입양허가, 미성년자 입양허가 및 피성년후견인의 입양허가 청구사건, 친권자 지정 청구사건, 미성년후견에 관한 사건, 성년후견·한정후견·특정후견·임의후견에 관한 사건은 각 10회) / 마류 12회",
      "recipientsKo": "청구인 등"
    },
    {
      "category": "가사",
      "labelKo": "가사공조사건(츠)",
      "codes": [
        "츠"
      ],
      "countText": "2회",
      "countPerParty": 2,
      "recipientsKo": "당사자, 증인 등"
    },
    {
      "category": "가족관계등록",
      "labelKo": "개명사건(호명)",
      "codes": [
        "호명"
      ],
      "countText": "6회",
      "countPerParty": 6,
      "recipientsKo": "신청인"
    },
    {
      "category": "가족관계등록",
      "labelKo": "가족관계등록(제적)비송사건(호기)",
      "codes": [
        "호기"
      ],
      "countText": "6회",
      "countPerParty": 6,
      "recipientsKo": "신청인"
    },
    {
      "category": "가족관계등록",
      "labelKo": "협의이혼의사확인 신청사건(호협)",
      "codes": [
        "호협"
      ],
      "countText": "2회(단, 부부 중 일방이 재외국민이거나 수감자인 경우에 한함)",
      "recipientsKo": "신청인, 재외공관 또는 교도소(구치소)의 장"
    },
    {
      "category": "재심·준재심",
      "labelKo": "각종사건에 대한 재심, 준재심사건(재심 대상사건의 부호문자 앞에 “재”를 삽입)",
      "codes": [],
      "countText": "재심대상사건의 송달료납부기준에 의함",
      "recipientsKo": "원고, 피고 등"
    },
    {
      "category": "기일지정신청",
      "labelKo": "각종 사건에 대한 기일지정신청사건(민사소송법 제268조 제3항, 민사소송규칙 제67조)",
      "codes": [],
      "countText": "기일지정신청대상사건의 송달료납부기준에 의함",
      "recipientsKo": "원고, 피고 등"
    },
    {
      "category": "인신보호사건",
      "labelKo": "인신보호 제1심사건(납부당사자가 피수용자인 사건은 국고처리)",
      "codes": [],
      "countText": "5회",
      "countPerParty": 5,
      "recipientsKo": "구제청구자, 수용자"
    },
    {
      "category": "인신보호사건",
      "labelKo": "인신보호 항고사건(납부당사자가 피수용자인 사건은 국고처리)",
      "codes": [],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "항고인, 상대방"
    },
    {
      "category": "인신보호사건",
      "labelKo": "인신보호 재항고사건(납부당사자가 피수용자인 사건은 국고처리)",
      "codes": [],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "재항고인, 상대방"
    },
    {
      "category": "인신보호사건",
      "labelKo": "임시해제신청사건(납부당사자가 피수용자인 사건은 국고처리)",
      "codes": [],
      "countText": "3회",
      "countPerParty": 3,
      "recipientsKo": "신청인, 상대방"
    }
  ],
  "unverifiedMatrix": [],
  "historyNote": {
    "ruleChanges": [
      {
        "effectiveFrom": "2026-10-22",
        "ruleNumber": "(데이터셋 변경)",
        "summary": "codeTable 신설. 재일 87-4 별표 1(재판예규 제1950호) 94행 전부를 사건구분·부호·회수 원문·수송달자로 수록. 원문 회수가 '당사자 1인당 N회' 하나로 정해지는 행만 countPerParty 를 두고, 단서·가산·범위가 붙은 행은 countText 만 둔다. 재심·기일지정신청·인신보호 6행은 별표 1 에 부호가 없어 codes 가 비어 있다. caseType 은 countMatrix 의 같은 사건구분과 1:1 로 대응할 때만 붙인다."
      },
      {
        "effectiveFrom": "2026-08-27",
        "ruleNumber": "(데이터셋 변경)",
        "summary": "countMatrix 13종 → 41종 확장. 민사집행 6 · 도산 5 · 가사 7 · 행정 4 · 특허 4 · 과태료 1 · 비송 1 추가. 확장분의 1차 출처는 대법원 전자소송 소송비용계산(PSP007P01) 9개 소송유형 탭이고, 이후 41종 전부를 재일 87-4 별표 1 원문(flSeq=162015279)과 CourtCalcEx 내장 DB sd.csv 로 전수 대조했다. 그 대조에서 3건을 정정: 행정 (재)항고 부호 '부/수'(부는 행정특별항고, 수는 선거소송) → '루/무', 특허 (재)항고 부호 '히'(특별(준)항고 3회)에 붙어 있던 5회를 정본대로 '흐'(재항고 5회)로, 가사신청 회수 범위 3~5 → 3~8(별표 1 원칙 3회, 가압류·가처분 이의·취소 단서 8회). 이어서 3건 추가 정정: 가사 (재)항고(브/스) 범위 2~5 → 5회 정액(별표 1 은 브·스 모두 5회이고 min 2 는 sd 의 가사특별항고(으) 2회가 흘러든 값이었다), 보전처분(카합/카단) 3회 정액 → 범위 3~8 기본 3회(별표 1 이 같은 부호에 원칙 3회 · 임시의 지위를 정하는 가처분 8회 · 가압류가처분 이의취소 8회 세 행을 둔다), 특허 1심·상고의 지식재산처장 주석에 별표 1 미확인 사실 명기"
      },
      {
        "effectiveFrom": "2026-03-01",
        "ruleNumber": "재판예규 제1950호",
        "summary": "별표 1(적용대상사건 및 당사자 1인당 송달료납부기준) 개정. 본 데이터셋 countMatrix의 정본 출처 구간"
      },
      {
        "effectiveFrom": "2020-11-26",
        "ruleNumber": "대법원규칙 제2921호",
        "summary": "일부개정 (송달료규칙 본문 기준 슬라이스)"
      },
      {
        "effectiveFrom": "2012-12-03",
        "ruleNumber": "대법원규칙 제2432호",
        "summary": "일부개정 (직전 슬라이스)"
      }
    ],
    "unitPriceChangesCount": 5,
    "matrixDelegationAnchor": "재일 87-4 별표 1 (재판예규)",
    "roundingPolicyNote": "송달료 자체는 정수 산출 (회당 단가 × 횟수). 별도 floor/truncate 정책 부재. PR 5 분배 모듈 진입 시 나머지 처리 정책 분기."
  }
};
