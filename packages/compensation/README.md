# @lawcalc-kr/compensation

손해배상 (compensation) 도메인 엔진. v0.5 cycle 의 자×부상 (auto-injury) single slice 를 `compensation@1` capability 로 동결한다.

## 책임 범위

- 입력 검증 (`validateCompensationInput`)
- 일실수입 / 위자료 / 적극손해 / 기왕증 / 과실상계 / 손익공제 계산 (`computeCompensation`)
- capability id 상수 `COMPENSATION_CAPABILITY_ID`

## 외부 의존

- `@lawcalc-kr/core-engine` — `STANDARD_DISCLAIMER`, `addYears`, `IsoDate`, `LegalRatePreset` 등 공용 심볼.
- `@lawcalc-kr/datasets-compensation` — `HoffmanDataset` / `LeibnizDataset` / `LaborRatesDataset` / `LifeExpectancyDataset` loader.

## 도메인 확장 정원

- v0.6 자×사망 → `compensation@2` (sub-slice `auto-death`)
- v0.7 산재 → `compensation@3` (sub-slice `industrial`)
- v0.8 기타손해 → `compensation@4` (sub-slice `other`)

매 격상마다 `@N` → `@N+1` migration registry 갱신 + `.lcalc` v3 envelope negotiation 정원.
