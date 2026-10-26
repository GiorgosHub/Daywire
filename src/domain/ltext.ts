import type { LText } from "./types.ts";

/** The text in `lang`, falling back to English. */
export function pick(t: LText | undefined, lang: string): string {
  if (!t) return "";
  return t[lang] ?? t[lang.split("-")[0]!] ?? t.en;
}
