# ADR-001: Architecture of the first release

**Status:** Accepted · **Date:** 2026-10-26

## Context

- The repository was empty.
- The build environment cannot reach the npm registry. Available offline: TypeScript, esbuild, zod, tsx and Playwright. React 19 is installed but has no types.
- Hosting is Vercel. Scheduled jobs on the Hobby plan run at most once a day.
- The sources publish a few times a day, and there are only three of them.

## Decision

1. **Framework-free strict TypeScript.**
   - The client is a small DOM layer (`src/app`) over a pure domain layer (`src/domain`).
   - The same domain code runs on the server and in the browser: status, relevance, search.
   - The domain code is unit-tested against real captured responses.
2. **Ingestion on demand, in one Vercel function** (`functions/feed.ts` → `/api/feed`).
   - Sources are fetched in parallel, with an 8-second timeout and one retry.
   - Each source's result is validated with zod.
   - The function then deduplicates and returns the notices plus per-source health.
   - The CDN caches the response for 5 minutes, revalidating in the background for up to 10 more (60 seconds when a source is failing), so traffic never multiplies requests to the publishers.
   - No cron. A daily job would add nothing, and anything faster would need a paid plan.
3. **Optional durable store** (Upstash Redis over REST, configured through env vars) holds:
   - per-source health, with backoff after repeated failures;
   - the last good snapshot, served as stale when a source fails;
   - first-seen times.

   Without the store, the app works and says that the store is absent.
4. **Source adapters plus a registry.** A city and its places live in `src/domain/cities.ts`; sources live in `src/sources/registry.ts`. Adding a city does not touch the UI.
5. **No AI in the data path.**
   - Extraction is deterministic regex over Greek text, and every derived date is tagged with its provenance.
   - Headlines are composed from extracted fields. The original title is always kept and shown.
6. **No admin UI in this release.**
   - A real one needs authentication, an audit trail and a write path, and none of these exist yet.
   - The public Sources page shows the health an operator needs.
   - Corrections are made in code (adapter rules), with tests.

## Consequences

- **Easier:** testing. The fixtures are real responses, and the domain is pure.
- **Easier:** honest states. Health travels with the data.
- **Harder:** new contributors need to learn the small DOM helper.
- **Limit:** freshness depends on someone opening the site. Data is usually under 5 minutes behind the source, and at most about 15.
- **Revisit:** add a scheduled refresh and real admin review when there is a paid plan, or a second operator.
