# DiScammer visit and engagement analytics

Owner request, 2026-09-29: measure real traffic, sources and paths during Foma's
university applications. **All applications use one common URL.** This prevents
reliable per-university attribution. A referring university domain is an origin
signal, not proof of the visitor's role or admissions interest. Direct/unknown
must remain unknown. Do not assign universities from city, IP, or engagement.

## Provider and activation

Umami Cloud Hobby: $0, one website, 100,000 events/month, six-month retention.
Pro: $20/month, two-year retention. Pricing checked 2026-09-29 at
https://umami.is/pricing. Pageviews and custom events both consume the allowance.
Export needed history before six months or explicitly purchase a longer-retention
plan before records expire. Never imply cross-day return visitors are uniquely
identified; cookieless identifiers are approximate and rotate.

1. Owner signs into https://cloud.umami.is and adds `discammer.com` as a website.
   Keep the dashboard private; no public share link, replay, or heatmaps.
2. Copy the **public website ID**, not an API key, into
   `backend/analytics-settings.json` (`website_id`). An empty value disables all
   client collection and removes the collector from CSP. `UMAMI_WEBSITE_ID` is
   an optional local test override. No secret, DNS change or remote script needed.
3. Run the complete repository release gate, commit generated assets, then
   reproduce them with zero diff. Deploy by the authorized main/CI path.
4. Verify live receipt in Umami Realtime with a normal browser (DNT/GPC off,
   not excluded), then create the saved funnels below. Confirm the received
   payload contains only permitted fields. A successful build or 200 response
   alone is **not** completed analytics setup.
5. Exclude the owner's regular browser via the footer privacy disclosure or
   `https://discammer.com/en/?analytics=off`. This persists in that browser.
   To re-enable deliberately, remove `discammer.analytics.disabled` from that
   site's local storage. Browser profile / device changes require fresh exclusion.

The owner registered the Umami Cloud account on 2026-09-29. The private
DiScammer website is configured with public ID
`3980b9ef-df17-4059-8b04-cae95b30ed31` in the EU workspace. No paid subscription
was purchased. Collection starts when this configuration is deployed; receipt
and saved reports must be verified in the dashboard after deployment.

## Measurements and saved reports

Public authored page paths (EN/RU) appear in Pages; Referrers contains external
origins only; location/device estimates are provided by Umami from network data.
Search strings, query parameters, fragments, unknown/404 paths, checker inputs,
form values, certificate names, quiz answers, sync data and raw referrer paths
are not collected. No UTM extraction is enabled for this common-link setup.

| Event | Exact meaning |
| --- | --- |
| `page_viewed` | Public page first visible in this document; any language |
| `home_view` | Home page visible |
| `portfolio_view` | Project dossier visible |
| `game_view` | Game landing page visible |
| `course_view` | Course index visible |
| `lesson_view` | Authored lesson visible |
| `page_engaged` | At least 30 seconds visible, plus trusted pointer/keyboard/scroll interaction; once per document |
| `game_launch` | Visitor activates launch; not proof the Unity game finished loading or was played |
| `lesson_complete` | Visitor marks a lesson complete locally; not verified learning or exam success |

Each visible page sends a native pageview plus `page_viewed`, and selected
surfaces send one additional event. Custom event data has only `surface` and
`language`. A reload is a new view; browser Back restoration does not promise a
new event. There is no document-download event because the current public site
does not expose a project PDF download. Do not invent that funnel step.

Create separate ordered funnels (60-minute step window), rather than requiring
every visitor to use all features:

- **Home to dossier**: `home_view` → `portfolio_view`. Direct dossier arrivals
  are counted separately in `portfolio_view`, not as home-to-dossier conversions.
- **Game**: `game_view` → `game_launch`.
- **Learning**: `course_view` → `lesson_view` → `lesson_complete`.
- **Engagement**: `page_viewed` → `page_engaged`.

Use Journey to inspect actual page sequences and Referrers/Countries to filter
observed origins. Review counts and denominators together, especially with tiny
samples. A PDF/email/application portal can suppress the referrer. Link scanners,
ad blockers, disabled JS, browser privacy controls and network failures make
counts incomplete. Automated browsers reporting webdriver are excluded, but
this is not comprehensive bot detection. With one shared URL, applications
cannot be separated from other direct traffic or attributed to named universities.

## Privacy and technical contract

The site's own bundled adapter calls Umami's documented public collection API:
https://docs.umami.is/docs/api/sending-stats. No authentication token is required.
The payload is constructed from server-approved page metadata and fixed event
names, not serialized DOM/input objects. The browser omits credentials and the
HTTP Referer header. Umami necessarily receives the source IP and User-Agent;
the privacy disclosure states this. No analytics cookies or persistent visitor
IDs are created by DiScammer; its only analytics storage is the opt-out preference.
GPC, DNT, blocked storage and disabled configuration suppress collection.
No remote JS, user identity enrichment, hidden proxies, or ad-block bypass.

Backend tests cover fail-closed settings, authored paths/404s, disclosure and CSP.
Frontend tests cover payload sanitation, exclusions, event bounds and failures.
Browser tests must verify both languages, checker-input isolation, engagement,
launch, navigation continuity, opt-out and JS-off behavior. Live funnels and
collection must still be checked in the owner's dashboard after activation.

### Isolated browser verification

Run a local preview on `127.0.0.1:8793` with
`UMAMI_WEBSITE_ID=b8eb4c16-67f2-413f-a5c9-9c2647439e2e` (a test-only UUID),
`SITE_ORIGIN=http://127.0.0.1:8793` and a throwaway SQLite directory. Then from
`e2e/`, run:

```sh
ANALYTICS_E2E=1 E2E_BASE_URL=http://127.0.0.1:8793 npx playwright test analytics.spec.ts --workers=2
```

The spec intercepts all collector requests, simulates a non-automated visitor,
and checks real interactions. It is intentionally opt-in; a normal suite or
production smoke must not send test events into the owner's metrics. Never
commit the test UUID as the live website ID.
