import type { Category, CategoryType } from "../types/Category";
import { expenseCategoryOptions, incomeCategoryOptions } from "./categoryOptions";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "categories.v1";

const seed = (names: string[], type: CategoryType): Category[] =>
  names.map((name) => {
    const now = new Date().toISOString();
    return { id: `${type}:${name}`, name, type, isActive: true, createdAt: now, updatedAt: now };
  });

export const loadCategories = (): Category[] => {
  const saved = safeLoadJSON<unknown>(STORAGE_KEY, null);
  if (Array.isArray(saved)) return saved as Category[];
  return [...seed(expenseCategoryOptions, "expense"), ...seed(incomeCategoryOptions, "income")];
};

export const saveCategories = (categories: Category[]) => safeSaveJSON(STORAGE_KEY, categories);
