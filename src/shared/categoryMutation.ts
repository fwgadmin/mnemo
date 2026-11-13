export const GENERAL_CATEGORY_PATH = 'General';
export const UNASSIGNED_CATEGORY_PATH = 'Unassigned';

export function normalizeCategoryMutationPath(path: string): string {
  return path.trim().replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') || '';
}

export function categoryPathForMutation(tags: string[], hasAssignedCategories: boolean): string {
  const first = normalizeCategoryMutationPath(tags[0] ?? '');
  return first || (hasAssignedCategories ? UNASSIGNED_CATEGORY_PATH : GENERAL_CATEGORY_PATH);
}

export function tagsForCategoryMove(
  tags: string[],
  currentPath: string,
  sourcePath: string,
  targetPath: string,
  includeDescendants: boolean,
): string[] | null {
  const exact = currentPath === sourcePath;
  const descendant = includeDescendants && currentPath.startsWith(`${sourcePath}/`);
  if (!exact && !descendant) return null;
  const otherTags = tags.slice(1);
  if (exact && targetPath === UNASSIGNED_CATEGORY_PATH) return otherTags;
  const suffix = exact ? '' : currentPath.slice(sourcePath.length + 1);
  const first = suffix ? `${targetPath}/${suffix}` : targetPath;
  return [first, ...otherTags];
}

export function remapCategoryKeys<T>(
  values: Record<string, T>,
  sourcePath: string,
  targetPath: string | null,
  includeDescendants = true,
  retainSource = false,
): Record<string, T> {
  const next = { ...values };
  for (const key of Object.keys(values)) {
    const exact = key === sourcePath;
    if (!exact && (!includeDescendants || !key.startsWith(`${sourcePath}/`))) continue;
    const value = next[key];
    delete next[key];
    if (targetPath === null || value === undefined) continue;
    const suffix = exact ? '' : key.slice(sourcePath.length + 1);
    next[suffix ? `${targetPath}/${suffix}` : targetPath] = value;
  }
  return retainSource ? { ...values, ...next } : next;
}
