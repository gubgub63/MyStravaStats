const normalizedName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function uniqueExactRunner<T extends { fullname: string }>(
  runners: T[],
  firstname: string,
  lastname: string,
): T | null {
  const full = normalizedName(`${firstname} ${lastname}`);
  if (!firstname.trim() || !lastname.trim()) return null;
  const exact = runners.filter((runner) => normalizedName(runner.fullname) === full);
  return exact.length === 1 ? exact[0] : null;
}
