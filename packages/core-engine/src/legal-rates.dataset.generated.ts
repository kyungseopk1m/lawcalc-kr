// AUTO-GENERATED. Do not edit by hand.
// Source: data/legal-rates/v1.json
// Regenerate: pnpm --filter @lawcalc-kr/core-engine sync:legal-rates

import type { LegalRateDataset } from "./legal-rates";

export const DEFAULT_LEGAL_RATES_DATASET: LegalRateDataset = {
  "version": "1.0.0",
  "updatedAt": "2026-05-09",
  "rates": [
    {
      "code": "civil",
      "label_ko": "민법 제379조 (법정이율)",
      "annualRate": 0.05,
      "validFrom": "1958-02-22",
      "validTo": null
    },
    {
      "code": "commercial",
      "label_ko": "상법 제54조 (상사법정이율)",
      "annualRate": 0.06,
      "validFrom": "1962-01-20",
      "validTo": null
    },
    {
      "code": "promotion",
      "label_ko": "소송촉진 등에 관한 특례법 제3조",
      "annualRate": 0.12,
      "validFrom": "2019-06-01",
      "validTo": null,
      "previousVersions": [
        {
          "annualRate": 0.15,
          "validFrom": "2015-10-01",
          "validTo": "2019-05-31"
        },
        {
          "annualRate": 0.2,
          "validFrom": "2003-06-01",
          "validTo": "2015-09-30"
        }
      ]
    }
  ]
};
