/**
 * 골든 하네스 필드 커버리지 가드.
 *
 * 골든은 결과 전체를 deep equal 하지 않고 픽스처가 고른 필드만 대조한다. 픽스처가
 * 작게 유지되는 대신, 결과 타입에 필드가 새로 생기거나 이름이 바뀌어도 골든이 그대로
 * 통과한다. v0.11.0 의 인지액 산식 표시 결함(절사 전 금액 누락)이 골든이 아니라 사람 눈에
 * 걸린 것이 그 사례다.
 *
 * 이 가드는 픽스처 전체를 돌린 결과의 실제 키 경로를 모아 하네스의 선언과 양방향으로
 * 대조한다. 선언에 없는 경로가 결과에 있으면 새 필드를 방치한 것이고, 선언에 있는 경로가
 * 결과 어디에도 없으면 필드가 사라졌거나 이름이 바뀐 것이다. 둘 다 실패시킨다.
 *
 * 한계: 조건이 맞을 때만 방출되는 선택 필드는 픽스처가 그 조건을 밟지 않는 한 결과에
 * 나타나지 않아 이 가드에 걸리지 않는다 (`TreatmentResult.splitSuspected` 가 그렇다).
 * 그런 필드는 조건을 켜는 픽스처를 넣어야 덮인다.
 */

/**
 * 값의 leaf 키 경로를 모은다. 배열은 인덱스를 `[]` 로 접어 원소 수와 무관한 경로를 만든다.
 * 빈 배열과 빈 객체는 leaf 로 취급해 경로 자체를 남긴다.
 */
export function collectResultPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix];
    return [...new Set(value.flatMap((item) => collectResultPaths(item, `${prefix}[]`)))];
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [prefix];
    return entries.flatMap(([key, item]) =>
      collectResultPaths(item, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  return [prefix];
}

export interface GoldenCoverage {
  /** 픽스처가 값을 고정하는 경로. */
  pinned: readonly string[];
  /** 값을 고정하지 않는 경로와 그 사유. 사유 없이 빠뜨릴 수 없게 맵으로 둔다. */
  unpinned: Readonly<Record<string, string>>;
}

/**
 * 골든 하네스가 돌린 결과 전부를 받아 선언과 대조하고 위반 목록을 돌려준다.
 * 호출부는 `expect(findCoverageViolations(...)).toEqual([])` 로 단언한다.
 */
export function findCoverageViolations(
  results: readonly unknown[],
  coverage: GoldenCoverage,
): string[] {
  const observed = new Set(results.flatMap((result) => collectResultPaths(result)));
  const declared = new Map<string, "pinned" | "unpinned">();
  for (const path of coverage.pinned) declared.set(path, "pinned");
  for (const path of Object.keys(coverage.unpinned)) declared.set(path, "unpinned");

  const violations: string[] = [];
  for (const path of [...observed].sort()) {
    if (!declared.has(path)) {
      violations.push(
        `선언되지 않은 결과 필드: ${path} (pinned 로 값을 고정하거나 unpinned 에 사유와 함께 올린다)`,
      );
    }
  }
  for (const [path, kind] of [...declared].sort(([a], [b]) => a.localeCompare(b))) {
    if (!observed.has(path)) {
      violations.push(`${kind} 선언이 결과에 없다: ${path} (필드가 사라졌거나 이름이 바뀌었다)`);
    }
  }
  return violations;
}
