# Legal References

This document lists reference sources for the current lawcalc-kr calculation surfaces: judgment interest, statutory delay damages, and simplified inheritance shares. It is not a substitute for checking the currently effective statute and case-specific procedural history.

## 독립성 명시

lawcalc-kr는 법원, 전자소송, 대법원 또는 그 산하기관이 배포·보증·감수한 프로그램이 아닙니다.
법원 공식 프로그램, 상표, 로고, 설치 파일과 무관한 독립 오픈소스 프로젝트입니다.

본 섹션이 이 무관성 명시의 단일 출처입니다. README와 다른 docs 파일에서 이 문구를 반복하지 않고 본 문서로 링크합니다.

## Primary Legal Sources

| Topic                             | Reference                                                                        | App Use                                                   |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Civil statutory interest          | Civil Act, Article 379                                                           | Default civil legal interest preset                       |
| Commercial statutory interest     | Commercial Act, Article 54                                                       | Commercial legal interest preset                          |
| Litigation delay damages          | Act on Special Cases Concerning Expedition, etc. of Legal Proceedings, Article 3 | Judgment-delay interest preset and effective-date history |
| Period boundary — first day       | Civil Act, Article 157 (초일 불산입 원칙)                                        | `options.includeFirstDay = false` default                 |
| Period boundary — year maturity   | Civil Act, Articles 159 · 160 (기간 만료점 / 역에 의한 계산)                     | `period` mode 풀 1년 cycle 만료일 정의 (`periodCycleEnd`) |
| Inheritance order                 | Civil Act, Article 1000                                                          | 1~4순위 상속인 fall-through                               |
| Representation by succession      | Civil Act, Articles 1001 · 1010                                                  | 1순위/3순위 1차 대습상속                                  |
| Spouse inheritance                | Civil Act, Article 1003                                                          | 배우자 동순위/단독상속                                    |
| Statutory inheritance shares      | Civil Act, Article 1009                                                          | 배우자 1.5배, 동순위 균분                                 |
| Official court calculator context | Korean court public calculator announcements and manuals                         | Functional comparison and golden-test planning only       |

## Current Rate Assumptions

- Civil statutory interest: 5% per year, unless another statute or agreement applies.
- Commercial statutory interest: 6% per year, when commercial law applies.
- Litigation-promotion judgment interest: 12% per year from 2019-06-01, with historical rates represented in versioned data.

These assumptions are backed by versioned data files and golden tests. Do not treat this document as executable truth.

## Current Inheritance Scope

- Only decedents who died on or after 1991-01-01 are supported.
- The current engine supports 1st through 4th statutory heir groups and spouse rules.
- Only first-level representation by succession is supported for lineal descendants and siblings.
- Second-level or deeper representation, and representation for lineal ascendants or collateral fourth-degree relatives, are rejected explicitly.

## Source-Material Policy

Internal planning references may use locally stored court manuals for analysis. The OSS repository must not include HWP manual text, screenshots, installer binaries, extracted resources, or copied UI.

Allowed in this repository:

- source names, official URLs, and short citations;
- independently written explanations;
- calculation inputs and expected outputs created for golden tests;
- links to official public sources.

Not allowed in this repository:

- redistributed HWP/MSI files;
- decompiled or extracted program internals;
- court logos, screenshots, or UI imitation;
- copied manual body text.

## Verification Before Release

Before each release that changes legal/domain data, confirm every affected row or rule against official sources and record:

- source title and URL;
- effective date;
- rate value or inheritance rule;
- date verified;
- reviewer initials or commit reference.
