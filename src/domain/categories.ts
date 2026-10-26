// The categories every source maps into. Kept free of zod so the browser bundle stays small.
export const CATEGORIES = ["weather", "water", "power", "roads", "transport", "services", "emergency", "announcement"] as const;
export type CategoryName = (typeof CATEGORIES)[number];
