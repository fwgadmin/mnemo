import type { CategoryMoveInput } from '../shared/types';
import {
  GENERAL_CATEGORY_PATH,
  UNASSIGNED_CATEGORY_PATH,
  normalizeCategoryMutationPath,
} from '../shared/categoryMutation';

const MAX_CATEGORY_PATH_LENGTH = 500;
const MAX_BULK_DELETE_IDS = 10_000;

export function validateCategoryMoveInput(raw: unknown): CategoryMoveInput {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid category move request.');
  const candidate = raw as Partial<CategoryMoveInput>;
  if (typeof candidate.sourcePath !== 'string' || typeof candidate.targetPath !== 'string') {
    throw new Error('Category paths must be strings.');
  }
  if (candidate.sourcePath.length > MAX_CATEGORY_PATH_LENGTH || candidate.targetPath.length > MAX_CATEGORY_PATH_LENGTH) {
    throw new Error('Category path is too long.');
  }
  const sourcePath = normalizeCategoryMutationPath(candidate.sourcePath) || GENERAL_CATEGORY_PATH;
  const targetPath = normalizeCategoryMutationPath(candidate.targetPath) || GENERAL_CATEGORY_PATH;
  if (sourcePath === targetPath) throw new Error('Source and target categories must differ.');
  if (targetPath.startsWith(`${sourcePath}/`)) throw new Error('A category cannot be moved beneath itself.');
  return {
    sourcePath,
    targetPath,
    includeDescendants:
      targetPath === UNASSIGNED_CATEGORY_PATH ? false : candidate.includeDescendants === true,
  };
}

export function validateBulkDeleteIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_BULK_DELETE_IDS) {
    throw new Error('Invalid bulk deletion request.');
  }
  return [...new Set(raw.map(id => {
    if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('Invalid note id.');
    return id;
  }))];
}
