export type CategoryType = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isActive: boolean;
  mergedIntoId?: string;
  createdAt: string;
  updatedAt: string;
};
