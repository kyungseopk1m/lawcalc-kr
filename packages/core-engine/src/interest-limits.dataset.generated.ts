// AUTO-GENERATED. Do not edit by hand.
// Source: data/interest-limits/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:interest-limits

import type { InterestLimitDataset } from "./interest-limits";

export const DEFAULT_INTEREST_LIMITS_DATASET: InterestLimitDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-05-10",
  "slices": [
    {
      "law": "interestLimitAct",
      "from": "2007-06-30",
      "to": "2014-07-14",
      "capRate": 0.3,
      "source": "이자제한법 시행 (법률 제8322호, 2007-06-30 부활) + 최고이자율에 관한 규정 (대통령령). 연 30%."
    },
    {
      "law": "interestLimitAct",
      "from": "2014-07-15",
      "to": "2018-02-07",
      "capRate": 0.25,
      "source": "이자제한법 최고이자율에 관한 규정 (대통령령 제25530호, 2014-07-15 시행). 연 25%."
    },
    {
      "law": "interestLimitAct",
      "from": "2018-02-08",
      "to": "2021-07-06",
      "capRate": 0.24,
      "source": "이자제한법 최고이자율에 관한 규정 일부개정 (대통령령 제28611호, 2018-02-08 시행). 연 24%."
    },
    {
      "law": "interestLimitAct",
      "from": "2021-07-07",
      "to": null,
      "capRate": 0.2,
      "source": "이자제한법 최고이자율에 관한 규정 일부개정 (대통령령 제31797호, 2021-07-07 시행). 연 20%."
    }
  ]
};
