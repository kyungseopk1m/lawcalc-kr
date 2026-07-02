# @lawcalc-kr/compensation

손해배상 도메인 엔진. 자동차 사고와 산업재해를 부상·사망 유형으로 계산하고, 기타손해(개호비·치료비·보조구)까지 다룬다.

## 책임 범위

- 입력 검증 (`validateCompensationInput` / `validateCompensationDeathInput`)
- 부상 (`computeCompensation`): 일실수입 구간 분해, 호프만 240 한도, 위자료, 과실상계, 공제
- 사망 (`computeCompensationDeath`): 생계비 공제, 장례비, 상속분 분배 — 분배는 core-engine 상속 엔진을 재사용한다
- 산재: 산재보험급여(부상 = 장해급여, 사망 = 유족급여)를 같은 성질의 손해인 일실수입 한도에서 먼저 공제한 뒤 과실상계한다 (대법원 2021다241618 전원합의체)
- 기타손해: 개호비(연금형 현가, 호프만 240 한도), 치료비·보조구(일시금형 현가, 수치합계 20 한도)

## 외부 의존

- `@lawcalc-kr/core-engine` — `STANDARD_DISCLAIMER`, `addYears`, `IsoDate` 등 공용 심볼과 상속 엔진.
- `@lawcalc-kr/datasets-compensation` — 호프만 / 라이프니츠 / 시중노임 / 생명표 데이터셋 로더.

## `.lcalc` 호환

`.lcalc` v3 저장 파일의 기능 ID `compensation@1`(부상)부터 `compensation@4`(기타손해)까지 제공한다. 이전 기능 ID 로 저장된 파일은 로드 시 현재 형식으로 마이그레이션된다.
