// Deterministic category rules for municipal posts. Each rule is a documented pattern on the title
// (and, for the announcements category, the opening of the text). No model decides what a post is.
import type { Category } from "./types.ts";

export interface Rule { category: Category; pattern: RegExp; why: string }

export const RULES: Rule[] = [
  { category: "water", pattern: /διακοπ[ήέ]\S*\s+(?:νερού|υδροδότησης)|λειψυδρ/iu, why: "water interruption" },
  { category: "power", pattern: /διακοπ[ήέ]\S*\s+(?:ρεύματος|ηλεκτροδότησης)/iu, why: "power interruption" },
  { category: "emergency", pattern: /εκκένωσ|έκτακτ\S*\s+(?:μέτρα|ανακοίνωση)|πολιτικ\S*\s+προστασ|κατάσταση\s+έκτακτης/iu, why: "civil protection / emergency measures" },
  { category: "roads", pattern: /κυκλοφοριακ\S*\s+ρυθμίσ|διακοπή\s+(?:της\s+)?κυκλοφορίας|κλειστ\S*\s+(?:\S+\s+)?(?:οδ|τμήμα|δρόμ)|ασφαλτόστρωσ|αποκλεισμ\S*\s+(?:της\s+)?(?:οδ|δρόμ)/iu, why: "road works / traffic arrangements" },
  { category: "transport", pattern: /λεωφορ|ΚΤΕΛ|αστικ\S*\s+συγκοινων|δρομολόγ/iu, why: "public transport change" },
  { category: "services", pattern: /λαϊκ\S*\s+αγορ|ωράρι\S*\s+λειτουργ|δεν\s+θα\s+λειτουργ|κλειστ\S*\s+(?:οι|τα|η|το)?\s*(?:υπηρεσ|γραφεί|ΚΕΠ|δημαρχ)|αποκομιδ|αργία/iu, why: "public service operating change" },
];

/** Category for a municipal post. Press releases (category 35) are kept only when a rule matches the title. */
export function classifyMunicipal(title: string, text: string, isAnnouncement: boolean): Category | null {
  for (const r of RULES) if (r.pattern.test(title)) return r.category;
  if (isAnnouncement) {
    const opening = text.slice(0, 400);
    for (const r of RULES) if (r.category !== "services" && r.category !== "transport" && r.pattern.test(opening)) return r.category;
    return "announcement";
  }
  return null;
}
