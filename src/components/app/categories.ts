export type Category = "fixed_bills" | "daily_living" | "shopping" | "unplanned";

export const CATEGORIES: { id: Category; label: string; emoji: string; hint: string }[] = [
  { id: "fixed_bills", label: "Fixed Bills", emoji: "🏠", hint: "Rent, utilities, plans" },
  { id: "daily_living", label: "Daily Living", emoji: "🥬", hint: "Food, transport, basics" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", hint: "Clothes, gadgets, gifts" },
  { id: "unplanned", label: "Unplanned", emoji: "✨", hint: "Treats, surprises" },
];

export const categoryLabel = (id: Category) =>
  CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const categoryEmoji = (id: Category) =>
  CATEGORIES.find((c) => c.id === id)?.emoji ?? "•";
