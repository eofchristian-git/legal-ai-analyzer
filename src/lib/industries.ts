export const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Manufacturing",
  "Energy",
  "Legal",
  "Retail",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
