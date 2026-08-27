// AUTO-GENERATED. Do not edit by hand.
// Source: data/case-value/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:case-value

import type { CaseValueDataset } from "./case-value-dataset";

export const DEFAULT_CASE_VALUE_DATASET: CaseValueDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-08-27",
  "sourceLaw": {
    "name": "민사소송 등 인지규칙",
    "lsId": "005771",
    "currentEffectiveFrom": "2023-10-19",
    "currentRuleNumber": "대법원규칙 제3103호",
    "sourceUrl": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=254623",
    "sourceRef": "「민사소송 등 인지규칙」 제10조(물건에 대한 권리의 가액)·제12조(통상의 소)·제13조(등기·등록 등 절차에 관한 소). 법제처 법령ID 005771 현행 원문 2026-08-27 대조. 대법원 전자소송 부동산가액 및 소가계산기 소의 종류 표(PSP009P02.xml) 대조"
  },
  "note": "기준 가액에 소의 종류별 계수를 곱해 소가를 구한다. 기준 가액이 무엇인지는 항목마다 다르며 `objectLabelKo` 에 적었다. 소유권·인도명도·등기 항목은 목적물 가액(토지는 개별공시지가 × 면적, 건물은 시가표준액), 지역권 항목은 승역지 가액, 상린관계는 부담을 받는 이웃 토지 부분의 가액, 경계확정은 다툼이 있는 범위의 토지부분 가액이다. 담보물권·전세권 항목(`securedClaimLimited`)은 목적물 가액을 한도로 한 피담보채권액(근저당권은 채권최고액) 또는 전세금액이 권리 가액이므로 그 금액을 따로 입력해야 한다. 가액 산정 자체는 본 데이터셋 범위 밖이며 사용자가 입력한다. 공유지분을 목적물로 하는 경우 지분 비율을 먼저 곱한 가액을 넣는다.",
  "roundingPolicy": {
    "mode": "floor",
    "unitWon": 1,
    "note": "소가는 원 단위로 절사한다. 계수가 유리수라 부동소수 곱셈을 피하려고 정수 분자·분모로 보관한다."
  },
  "claimKinds": [
    {
      "id": "ownershipConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "소유권의 확인",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "sourceArticle": "제12조 제1호·제10조 제1항"
    },
    {
      "id": "possessionConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "점유권의 확인",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제12조 제1호·제10조 제2항"
    },
    {
      "id": "superficiesOrLeaseConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "지상권·임차권의 확인",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제12조 제1호·제10조 제3항"
    },
    {
      "id": "easementConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "지역권의 확인",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제12조 제1호·제10조 제4항"
    },
    {
      "id": "securityRightConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "담보물권의 확인",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "securedClaimLimited": true,
      "sourceArticle": "제12조 제1호·제10조 제5항"
    },
    {
      "id": "jeonseConfirmation",
      "groupKo": "확인의 소",
      "labelKo": "전세권(채권적 전세권 포함)의 확인",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "securedClaimLimited": true,
      "sourceArticle": "제12조 제1호·제10조 제6항"
    },
    {
      "id": "deliveryByOwnership",
      "groupKo": "물건의 인도·명도·방해제거를 구하는 소",
      "labelKo": "소유권에 기한 경우",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제12조 제5호 가목"
    },
    {
      "id": "deliveryByLimitedRight",
      "groupKo": "물건의 인도·명도·방해제거를 구하는 소",
      "labelKo": "지상권·전세권·임차권·담보물권에 기한 경우 또는 그 계약의 해지·해제·기간만료를 원인으로 하는 경우 (대부분의 건물명도)",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제12조 제5호 나목"
    },
    {
      "id": "deliveryByPossession",
      "groupKo": "물건의 인도·명도·방해제거를 구하는 소",
      "labelKo": "점유권에 기한 경우",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제12조 제5호 다목"
    },
    {
      "id": "adjacentRelation",
      "groupKo": "그 밖의 통상의 소",
      "labelKo": "상린관계상의 청구",
      "objectLabelKo": "부담을 받는 이웃 토지 부분의 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제12조 제6호"
    },
    {
      "id": "coOwnershipPartition",
      "groupKo": "그 밖의 통상의 소",
      "labelKo": "공유물분할청구의 소 (원고 공유지분은 아래 공유지분란에 넣습니다)",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제12조 제7호"
    },
    {
      "id": "boundaryDetermination",
      "groupKo": "그 밖의 통상의 소",
      "labelKo": "경계확정의 소",
      "objectLabelKo": "다툼이 있는 범위의 토지부분의 가액",
      "numerator": 1,
      "denominator": 1,
      "sourceArticle": "제12조 제8호"
    },
    {
      "id": "ownershipTransferRegistration",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "소유권이전등기",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "sourceArticle": "제13조 제1항 제1호"
    },
    {
      "id": "trueNameRestorationTransfer",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "진정명의회복을 원인으로 하는 소유권이전등기",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제4호 나목 준용 (등기원인 무효를 이유로 한 소유권말소등기에 준한다)"
    },
    {
      "id": "limitedRightSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "제한물권의 설정·이전등기 - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제2호 가목"
    },
    {
      "id": "limitedRightSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "제한물권의 설정·이전등기 - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제2호 나목"
    },
    {
      "id": "limitedRightEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "제한물권의 설정·이전등기 - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제13조 제1항 제2호 다목"
    },
    {
      "id": "provisionalRegOwnership",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기 또는 그에 기한 본등기 - 소유권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제3호·제1호"
    },
    {
      "id": "provisionalRegSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기 또는 그에 기한 본등기 - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 4,
      "sourceArticle": "제13조 제1항 제3호·제2호 가목"
    },
    {
      "id": "provisionalRegSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기 또는 그에 기한 본등기 - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제3호·제2호 나목"
    },
    {
      "id": "provisionalRegEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기 또는 그에 기한 본등기 - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 6,
      "sourceArticle": "제13조 제1항 제3호·제2호 다목"
    },
    {
      "id": "cancellationTerminationOwnership",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (설정계약·양도계약의 해지·해제) - 소유권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "sourceArticle": "제13조 제1항 제4호 가목·제1호"
    },
    {
      "id": "cancellationTerminationSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (설정계약·양도계약의 해지·해제) - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제4호 가목·제2호 가목"
    },
    {
      "id": "cancellationTerminationSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (설정계약·양도계약의 해지·해제) - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 1,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제4호 가목·제2호 나목"
    },
    {
      "id": "cancellationTerminationEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (설정계약·양도계약의 해지·해제) - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 3,
      "sourceArticle": "제13조 제1항 제4호 가목·제2호 다목"
    },
    {
      "id": "cancellationVoidOwnership",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (등기원인의 무효·취소) - 소유권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제4호 나목·제1호"
    },
    {
      "id": "cancellationVoidSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (등기원인의 무효·취소) - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 4,
      "sourceArticle": "제13조 제1항 제4호 나목·제2호 가목"
    },
    {
      "id": "cancellationVoidSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (등기원인의 무효·취소) - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제4호 나목·제2호 나목"
    },
    {
      "id": "cancellationVoidEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "말소·말소회복등기 (등기원인의 무효·취소) - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 6,
      "sourceArticle": "제13조 제1항 제4호 나목·제2호 다목"
    },
    {
      "id": "provisionalCancelTerminationOwnership",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (해지·해제) - 소유권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "sourceArticle": "제13조 제1항 제4호 가목·제3호·제1호"
    },
    {
      "id": "provisionalCancelTerminationSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (해지·해제) - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 4,
      "sourceArticle": "제13조 제1항 제4호 가목·제3호·제2호 가목"
    },
    {
      "id": "provisionalCancelTerminationSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (해지·해제) - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 2,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제4호 가목·제3호·제2호 나목"
    },
    {
      "id": "provisionalCancelTerminationEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (해지·해제) - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 6,
      "sourceArticle": "제13조 제1항 제4호 가목·제3호·제2호 다목"
    },
    {
      "id": "provisionalCancelVoidOwnership",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (등기원인의 무효·취소) - 소유권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 4,
      "sourceArticle": "제13조 제1항 제4호 나목·제3호·제1호"
    },
    {
      "id": "provisionalCancelVoidSuperficies",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (등기원인의 무효·취소) - 지상권·임차권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 8,
      "sourceArticle": "제13조 제1항 제4호 나목·제3호·제2호 가목"
    },
    {
      "id": "provisionalCancelVoidSecurity",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (등기원인의 무효·취소) - 담보물권·전세권",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 4,
      "securedClaimLimited": true,
      "sourceArticle": "제13조 제1항 제4호 나목·제3호·제2호 나목"
    },
    {
      "id": "provisionalCancelVoidEasement",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "가등기의 말소·말소회복등기 (등기원인의 무효·취소) - 지역권",
      "objectLabelKo": "승역지 가액",
      "numerator": 1,
      "denominator": 12,
      "sourceArticle": "제13조 제1항 제4호 나목·제3호·제2호 다목"
    },
    {
      "id": "registrationAcceptance",
      "groupKo": "등기·등록 절차에 관한 소",
      "labelKo": "등기의 인수를 구하는 소",
      "objectLabelKo": "목적물 가액",
      "numerator": 1,
      "denominator": 10,
      "sourceArticle": "제13조 제2항"
    }
  ]
};
