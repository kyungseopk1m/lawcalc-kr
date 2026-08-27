// AUTO-GENERATED. Do not edit by hand.
// Source: data/delivery/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:delivery

import type { DeliveryDataset } from "./delivery-dataset";

export const DEFAULT_DELIVERY_DATASET: DeliveryDataset = {
  "version": "1.3.0",
  "updatedAt": "2026-08-27",
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
  "unverifiedMatrix": [],
  "historyNote": {
    "ruleChanges": [
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
