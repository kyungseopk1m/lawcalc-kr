/**
 * Vitest는 Vite 위에서 동작하므로 `import.meta.glob` 이 사용 가능하지만,
 * core-engine 패키지는 `vite` 를 직접 devDep으로 두지 않아 `vite/client` 의 type 만이
 * pnpm 의 transitive 위치에 갇혀 있다. typescript-eslint typed-parser 가 이를
 * 자동으로 잡지 못하므로, golden 테스트에서만 쓰는 최소 시그니처를 직접 선언한다.
 */
interface ImportMeta {
  glob<T>(pattern: string, options: { eager: true; import?: string }): Record<string, T>;
}
