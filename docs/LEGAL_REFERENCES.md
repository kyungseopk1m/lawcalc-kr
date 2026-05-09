# Legal References

This document lists reference sources for the judgment-interest MVP. It is not a substitute for checking the currently effective statute and case-specific procedural history.

## 독립성 명시

lawcalc-kr는 법원, 전자소송, 대법원 또는 그 산하기관이 배포·보증·감수한 프로그램이 아닙니다.
법원 공식 프로그램, 상표, 로고, 설치 파일과 무관한 독립 오픈소스 프로젝트입니다.

본 섹션이 이 무관성 명시의 단일 출처입니다. README와 다른 docs 파일에서 이 문구를 반복하지 않고 본 문서로 링크합니다.

## Primary Legal Sources

| Topic                             | Reference                                                                        | MVP Use                                                   |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Civil statutory interest          | Civil Act, Article 379                                                           | Default civil legal interest preset                       |
| Commercial statutory interest     | Commercial Act, Article 54                                                       | Commercial legal interest preset                          |
| Litigation delay damages          | Act on Special Cases Concerning Expedition, etc. of Legal Proceedings, Article 3 | Judgment-delay interest preset and effective-date history |
| Official court calculator context | Korean court public calculator announcements and manuals                         | Functional comparison and golden-test planning only       |

## Current MVP Rate Assumptions

- Civil statutory interest: 5% per year, unless another statute or agreement applies.
- Commercial statutory interest: 6% per year, when commercial law applies.
- Litigation-promotion judgment interest: 12% per year from 2019-06-01, with historical rates represented in versioned data.

These assumptions must be backed by versioned data files and golden tests before release. Do not treat this document as executable truth.

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

Before v0.1.0, confirm every legal-rate row against official sources and record:

- source title and URL;
- effective date;
- rate value;
- date verified;
- reviewer initials or commit reference.
