export type CategoryType = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
