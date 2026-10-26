# Sources (researched 2026-10-26)

| Source | Publisher | Access method | Status in DAYWIRE |
|---|---|---|---|
| Water interruptions | ΔΕΥΑΛ (Larissa water utility) | RSS (Joomla K2): `https://deyal.gr/el/gia-polites/vlaves-diakopes?format=feed&type=rss` | **Connected** |
| Announcements and service-change press releases | Δήμος Λαρισαίων | WordPress REST API: `https://www.larissa.gov.gr/wp-json/wp/v2/posts?categories=5,35&per_page=60&_fields=…` | **Connected** |
| Official weather warnings | ΕΜΥ / HNMS, via MeteoAlarm | JSON (CAP) feed: `https://feeds.meteoalarm.org/api/v1/warnings/feeds-greece`, filtered to EMMA region `GR001` (Thessaly) | **Connected** |
| Planned power cuts | ΔΕΔΔΗΕ / HEDNO | HTML form at `siteapps.deddie.gr/Outages2Public`, behind Imperva/Incapsula bot protection | Link only. We do not bypass bot protection. |
| 112 emergency alerts | Ministry for Climate Crisis & Civil Protection | Cell broadcast to phones; no public feed | Link only. DAYWIRE does not relay or replace 112. |
| City buses | n/a | No verified public feed found | Not connected |

## ΔΕΥΑΛ
- **What:** planned water interruptions with date, hours, the community or neighbourhood, and often a list of streets.
- **Updates:** a few times a week, usually the working day before.
- **Extraction:** dates such as "Δευτέρα 26 Οκτωβρίου" and hours such as "από 09:00 έως 11:00" are read from the text.
  - The year is inferred from the publication date, and the detail view says so.
  - The weekday is checked against the date.
  - Signature lines ("Λάρισα, 23 Οκτωβρίου 2026") and ordinal names ("28ης Οκτωβρίου", a street) are ignored.
- **Places:** matched only from explicit phrases:
  - "κατοίκους της Χ"
  - "στη Δ. Κ. Χ"
  - "συνοικία Χ"
  - "περιοχής του Χ"

  Streets come from the bullet lists. A street named "Τερψιθέας" is never taken to mean the community of Terpsithea.
- **End time:** the announced end. ΔΕΥΑΛ does not publish completion, so after the end time the UI says "Expected to have ended".
- **Access:** robots.txt disallows only system folders. The feed is offered publicly by the site. One request per refresh.
- **Fault lines:** the phone numbers shown in the detail view were read on deyal.gr on 2026-10-26: 2410687210 (working hours) and 2410687220 (24 h).

## Δήμος Λαρισαίων
- **What it covers:**
  - Category 5, "Ανακοινώσεις": about 2,160 posts. All of them are kept.
  - Category 35, "Δελτία Τύπου": about 6,000 posts. A post is kept only when a rule in `src/domain/classify.ts` matches its title: traffic arrangements, road works, interruptions, markets, opening hours, refuse collection or transport.
- **Times:** `date_gmt` and `modified_gmt` are UTC.
  - When `modified_gmt` is more than 10 minutes after publication, it is shown as "Updated".
  - Event dates come from the text.
- **Duplicates:** the municipality republishes ΔΕΥΑΛ notices.
  - These are merged with the ΔΕΥΑΛ originals when the category, the local date and at least one place match. ΔΕΥΑΛ stays first, and both links are kept.
  - Successive road-works posts that name a common street within 21 days become one thread. Older posts stay listed as related.
- **Access:** robots.txt is `Disallow:` (everything allowed). The REST API is public and read-only. One request per refresh.

## MeteoAlarm / ΕΜΥ
- **What:** CAP alerts with Greek and English text, `onset` and `expires`, and HNMS's own awareness level (2 yellow, 3 orange, 4 red) and hazard type.
- **Severity:** DAYWIRE never computes severity. It displays the source's level.
- **Coverage:** warnings are regional (Thessaly). The UI says so, and notes when the text names Larissa explicitly.
- **Links:** there is no page for each individual warning. We link the `web` field the alert carries (`https://www.emy.gr`).
- **Terms:** we could not read the MeteoAlarm terms page programmatically on 2026-10-26 (it is a client-rendered app). The feed is publicly offered for redistribution and we credit HNMS and MeteoAlarm. **To do:** confirm the attribution wording against the terms page by hand.

## Adding a city or source
1. Add the city to `src/domain/cities.ts`: its places, aliases, time zone and EMMA code.
2. Add an adapter in `src/sources/adapters/` that returns `Notice[]` using `makeNotice()`.
3. Register the source in `src/sources/registry.ts` with:
   - its endpoint and a short note on coverage and limits
   - a captured fixture in `tests/fixtures/`
4. Add tests against the fixture.
