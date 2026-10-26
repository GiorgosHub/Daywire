// Coverage: which categories have a connected source for a location. Computed from the registry, never from how
// many notices happen to exist, so an empty feed is never mistaken for full coverage.
//   good    — 3 or more categories with a connected source
//   partial — 2
//   limited — 1
//   none    — 0 (link-only sources and sources waiting for configuration don't count)
import { CATEGORIES, type Category, type Coverage, type GeoLocation } from "../domain/types.ts";
import { disabledFrom, missingConfig, sourcesFor } from "../sources/registry.ts";

export function coverageFor(loc: GeoLocation, env: Record<string, string | undefined>): Coverage {
  const sources = sourcesFor(loc, disabledFrom(env));
  const categories = CATEGORIES.map((category: Category) => {
    const here = sources.filter((s) => s.categories.includes(category));
    const connected = here.filter((s) => s.adapter && s.method !== "link-only" && missingConfig(s, env).length === 0);
    const needsConfig = here.filter((s) => s.adapter && missingConfig(s, env).length > 0);
    const linkOnly = here.filter((s) => s.method === "link-only");
    const state = connected.length ? "connected" : needsConfig.length ? "needs-config" : linkOnly.length ? "link-only" : "none";
    return { category, state, sources: (connected.length ? connected : needsConfig.length ? needsConfig : linkOnly).map((s) => s.id) } as Coverage["categories"][number];
  });
  const connected = categories.filter((c) => c.state === "connected").length;
  const level = connected >= 3 ? "good" : connected === 2 ? "partial" : connected === 1 ? "limited" : "none";
  return { level, connected, categories };
}
