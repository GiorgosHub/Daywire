import type { Notice, SourceHealth, Text2 } from "../domain/types.ts";

export interface SourceDef {
  id: string;
  cityIds: string[];
  name: Text2;
  publisher: Text2;
  method: SourceHealth["method"];
  /** Machine-readable endpoint we read. Absent for link-only sources. */
  endpoint?: string;
  homepage: string;
  /** What this source covers, how it's read, and its limits. Shown on the Sources page. */
  note: Text2;
  /** Real captured response used by tests and the local fixture mode. Never used in production. */
  fixture?: string;
  adapter?: Adapter;
  /** Official contact lines published by the source (checked on the publisher's site). */
  contacts?: { label: Text2; phone: string; checkedOn: string; url: string }[];
}

export interface AdapterContext {
  source: SourceDef;
  cityId: string;
  now: number;
  fixture: boolean;
  get: (url: string) => Promise<string>;
  /** Report an item the adapter could not validate (counted on the Sources page, never shown as a notice). */
  reject: (why: string) => void;
}

export type Adapter = (ctx: AdapterContext) => Promise<{ notices: Notice[]; fetched: number }>;
