// Greek text helpers: accent-insensitive folding, month and weekday names.

/** Lower-case, strip accents and diaeresis, final sigma → sigma, collapse spaces. "Γιάννουλης" → "γιαννουλησ". */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Month names as they appear in announcements (genitive: "26 Οκτωβρίου"), folded, 1-based. */
const MONTHS: Record<string, number> = {
  ιανουαριου: 1, φεβρουαριου: 2, μαρτιου: 3, απριλιου: 4, μαιου: 5, ιουνιου: 6,
  ιουλιου: 7, αυγουστου: 8, σεπτεμβριου: 9, οκτωβριου: 10, νοεμβριου: 11, δεκεμβριου: 12,
};
export function monthFromGreek(word: string): number | undefined {
  return MONTHS[fold(word)];
}

/** Weekday names (nominative and accusative), folded → JS getUTCDay() number. */
const WEEKDAYS: Record<string, number> = {
  κυριακη: 0, δευτερα: 1, τριτη: 2, τεταρτη: 3, πεμπτη: 4, παρασκευη: 5, σαββατο: 6,
};
export function weekdayFromGreek(word: string): number | undefined {
  return WEEKDAYS[fold(word)];
}

export const WEEKDAY_PATTERN = "(?:Κυριακή|Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο)";
export const MONTH_PATTERN =
  "(?:Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Μαίου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)";
