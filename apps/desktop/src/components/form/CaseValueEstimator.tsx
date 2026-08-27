import {
  computeRealEstateCaseValue,
  listCaseValueClaimKinds,
  type RealEstateCaseValueResult,
} from "@lawcalc-kr/core-engine";
import { useMemo, useState } from "react";

import { formatWon, formatWonInput, parseWonText } from "../../lib/format-won";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

/**
 * 부동산 소가 산정 보조 패널. 「민사소송 등 인지규칙」 제10조·제12조·제13조.
 *
 * 기준 가액에 소의 종류별 계수를 곱해 소가를 낸다. 이 값은 `.lcalc` 에 따로 저장하지 않고
 * "소가에 적용" 으로 본 계산기의 소가 입력란에 넣는 방식이다. 파일 포맷을 건드리지 않으려는
 * 선택이며, 산출 근거는 계산식 텍스트로 화면에 남는다.
 *
 * **기준 가액이 무엇인지는 소의 종류마다 다르다.** 지역권은 승역지, 상린관계는 부담을 받는 이웃
 * 토지 부분, 경계확정은 다툼이 있는 범위의 토지부분 가액이다. 종류를 고르면 입력란 라벨이 그에
 * 맞게 바뀐다. 담보물권·전세권은 목적물 가액을 한도로 한 피담보채권액이 권리 가액이라 그 금액을
 * 따로 받는다.
 *
 * 가액 자체(토지 = 개별공시지가 × 면적, 건물 = 시가표준액)는 「지방세법 시행규칙」의
 * 지수 별표가 있어야 산정되므로 여기서는 입력받는다.
 */
export function CaseValueEstimator({ onApply }: { onApply: (caseValue: number) => void }) {
  const claimKinds = useMemo(() => listCaseValueClaimKinds(), []);
  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof claimKinds>();
    for (const kind of claimKinds) {
      byGroup.set(kind.groupKo, [...(byGroup.get(kind.groupKo) ?? []), kind]);
    }
    return [...byGroup.entries()];
  }, [claimKinds]);

  const [objectValueText, setObjectValueText] = useState("");
  const [claimKindId, setClaimKindId] = useState(claimKinds[0]?.id ?? "");
  const [securedClaimText, setSecuredClaimText] = useState("");
  const [shareNumeratorText, setShareNumeratorText] = useState("1");
  const [shareDenominatorText, setShareDenominatorText] = useState("1");

  const selectedKind = claimKinds.find((kind) => kind.id === claimKindId);
  const needsSecuredClaim = selectedKind?.securedClaimLimited === true;

  const result = useMemo<RealEstateCaseValueResult | { error: string }>(() => {
    const objectValueWon = Number(parseWonText(objectValueText) || "0");
    const shareNumerator = Number(shareNumeratorText || "1");
    const shareDenominator = Number(shareDenominatorText || "1");
    try {
      return computeRealEstateCaseValue({
        objectValueWon,
        claimKindId,
        // 피담보채권액을 쓰지 않는 종류에 넘기면 엔진이 거부한다. 필요한 종류에만 넘긴다.
        // 필요한데 비어 있으면 넘기지 않아 엔진 오류로 입력을 요구한다 (0 으로 대신하지 않는다).
        ...(needsSecuredClaim && parseWonText(securedClaimText)
          ? { securedClaimWon: Number(parseWonText(securedClaimText)) }
          : {}),
        shareNumerator,
        shareDenominator,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [
    claimKindId,
    needsSecuredClaim,
    objectValueText,
    securedClaimText,
    shareDenominatorText,
    shareNumeratorText,
  ]);

  const failed = "error" in result;

  return (
    <details className="rounded-md border border-border bg-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        부동산 소가 계산 (인지규칙 제10조·제12조·제13조)
      </summary>
      <div className="grid gap-3 pt-3">
        <p className="text-xs text-muted-foreground">
          기준 가액에 소의 종류별 계수를 곱해 소가를 냅니다. 무엇의 가액을 넣어야 하는지는 소의
          종류마다 달라 입력란 라벨로 알려드립니다. 토지는 개별공시지가 × 면적, 건물은 시가표준액이
          가액입니다.
        </p>
        <label className="grid gap-2 text-sm font-medium">
          소의 종류
          <Select value={claimKindId} onChange={(e) => setClaimKindId(e.target.value)}>
            {groups.map(([groupKo, kinds]) => (
              <optgroup key={groupKo} label={groupKo}>
                {kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.labelKo} ({kind.numerator}/{kind.denominator})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {selectedKind?.objectLabelKo ?? "목적물 가액"}
          <Input
            value={formatWonInput(objectValueText)}
            inputMode="numeric"
            placeholder="예: 300,000,000"
            onChange={(e) => setObjectValueText(parseWonText(e.target.value))}
          />
          {needsSecuredClaim ? (
            <span className="text-xs font-normal text-muted-foreground">
              이 종류는 목적물 가액이 권리 가액의 한도입니다. 아래 피담보채권액과 비교해 작은 쪽에
              계수를 곱합니다.
            </span>
          ) : null}
        </label>
        {needsSecuredClaim ? (
          <label className="grid gap-2 text-sm font-medium">
            피담보채권액
            <Input
              value={formatWonInput(securedClaimText)}
              inputMode="numeric"
              placeholder="예: 120,000,000"
              onChange={(e) => setSecuredClaimText(parseWonText(e.target.value))}
            />
            <span className="text-xs font-normal text-muted-foreground">
              피담보채권의 원본액입니다. 근저당권이면 채권최고액, 전세권이면 전세금액을 넣으세요.
            </span>
          </label>
        ) : null}
        <div className="grid gap-2 text-sm font-medium">
          공유지분
          <div className="flex items-center gap-2">
            <Input
              value={shareNumeratorText}
              inputMode="numeric"
              onChange={(e) => setShareNumeratorText(e.target.value)}
            />
            <span className="text-muted-foreground">/</span>
            <Input
              value={shareDenominatorText}
              inputMode="numeric"
              onChange={(e) => setShareDenominatorText(e.target.value)}
            />
          </div>
          <span className="text-xs font-normal text-muted-foreground">
            공유지분을 목적물로 하는 경우에만 바꾸세요. 기본값 1/1.
          </span>
        </div>
        {failed ? (
          <p className="text-xs text-destructive">{result.error}</p>
        ) : (
          <div className="grid gap-2 rounded-md border border-border bg-background p-3">
            <p className="text-sm">
              산출 소가 <strong>{formatWon(result.caseValue)}</strong>
            </p>
            <p className="text-xs text-muted-foreground">{result.formulaText}</p>
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => onApply(result.caseValue)}
            >
              소가에 적용
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
