# Arcane Archive

Arcane Archive is a static, framework-free Magic: The Gathering playgroup collection browser. It loads manually committed ManaBox CSV exports, shows who owns each card and builds a client-side trade-request list that can be copied, printed or screenshotted.

It remains compatible with GitHub Pages and uses no backend, database, account system, paid service or secret API key. Card metadata and images are progressively enriched through the public Scryfall API.

Based on the MIT-licensed [mtg-collection-viewer](https://github.com/pnz1990/mtg-collection-viewer). The original licence is preserved in `LICENSE`.

## Main pages

- `index.html` — focused homepage and library directory
- `all-collections.html` — every uploaded library, grouped by card name or shown by printing
- `library.html?owner=monty` — reusable single-library page
- `detail.html?id=SCRYFALL_ID` — card details and exact ownership records
- `trade-basket.html` — trade requests, shopping list, exports and screenshot mode
- `deck-checker.html` and selected older tools remain available under **Archived Tools**

## Collection files

Libraries are configured in `data/collections/index.json`:

| ID | Library | CSV |
|---|---|---|
| `monty` | Monty’s Manor | `data/collections/monty.csv` |
| `edward` | Edward’s Exhibit | `data/collections/edward.csv` |
| `luke` | Luke’s Library | `data/collections/luke.csv` |
| `mitch` | Mitch’s Museum | `data/collections/mitch.csv` |
| `sam` | Sam’s Sanctuary | `data/collections/sam.csv` |
| `daniel` | Daniel’s Delights | `data/collections/daniel.csv` |
| `jcjc` | JCJC’s Jewels | `data/collections/jcjc.csv` |

Missing files are expected until a friend’s collection is uploaded. The site labels that library **Collection not yet uploaded** and continues loading the others.

### Add or update a friend

1. Export and sanitise their collection from ManaBox.
2. Save it at the configured path in `data/collections/`.
3. If this is a new owner, add one entry to `data/collections/index.json`.
4. Run `npm test`.
5. Run `npm start`.
6. Test their `library.html?owner=OWNER_ID` page and `all-collections.html`.
7. Commit and push the changes.

No column reordering is required for normal ManaBox exports. The parser recognises common header aliases and keeps different owners, printings, finishes, conditions, languages and binders distinct.

## Local setup and testing

Requirements: Node.js 20 or newer.

```powershell
cd "C:\path\to\mtg-collection-viewer"
npm test
npm run check
npm start
```

Open:

```text
http://127.0.0.1:4173/
```

Do not open the HTML files directly from disk because browsers restrict CSV loading from `file://` URLs.

## Filters and ownership

The library and All Collections pages share one filtering implementation. Filters combine simultaneously and useful state is mirrored into the URL. All Collections can group by card name without merging the underlying ownership records. Owner badges always include text and link back to that owner’s library filtered to the card.

Scryfall metadata is loaded after basic ManaBox results are shown. Until enrichment completes, filters requiring Oracle text, type, colour or commander metadata may update as data arrives.

## Trade Request Basket and Shopping List

The Trade Request Basket stores a request for a specific owner and owned printing. Requested quantity cannot exceed the selected owner’s quantity. Adding the same ownership record twice increases its requested quantity instead of creating a duplicate.

Basket and Shopping List data are stored in browser `localStorage`:

- They survive refreshes on the same browser/device.
- They do not sync between devices.
- Clearing site data removes them.
- They are not written back to Git.

The basket can be copied as plain text or Markdown, downloaded as JSON or CSV, printed/saved as PDF, or displayed in a phone-friendly Screenshot Mode.

Ownership never implies availability. A **Likely trade binder** label is only an inference from configurable binder-name terms in `data/config.json`; users should still ask the owner.

## GitHub Pages deployment

`.github/workflows/deploy.yml` tests and deploys the static repository whenever `main` is updated.

1. Push a branch.
2. Open a pull request against `jaemonty/mtg-collection-viewer` → `main`.
3. Merge the pull request.
4. In repository **Settings → Pages**, use **GitHub Actions** as the source.
5. Check the **Actions** tab for the deployment result.

All internal asset and navigation paths are relative so the site works beneath:

```text
https://jaemonty.github.io/mtg-collection-viewer/
```

## Pack Pullers

**Pack Pullers** is a booster-specific visual reference for identifying physical pulls. The first supported product is **Magic: The Gathering | Marvel Super Heroes — Collector Booster**. Open `pack-pullers.html`, then choose **Open Pull Guide**.

Pack Pullers deliberately does **not** treat a booster as equivalent to every card in its associated sets. Eligibility is controlled by an explicit Wizards-sourced product manifest:

```text
data/pack-pullers/index.json
data/pack-pullers/marvel-super-heroes-collector.json
```

The manifest records the supported set codes, collector-number ranges, eligible finishes and treatments, booster slots, published probabilities, official source URLs and verification date. The generated card index is committed at:

```text
data/pack-pullers/generated/marvel-super-heroes-collector-cards.json
```

It contains the eligible Scryfall IDs, printing metadata, small image URLs, finish eligibility, treatment/slot tags and a price snapshot. This lets the guide render from GitHub Pages even when Scryfall is temporarily unavailable. Current prices can be refreshed manually in browser using batched Scryfall `/cards/collection` requests; the maintenance script uses paginated set searches and never issues one request per card.

To regenerate the committed index:

```powershell
npm run update:pack-pullers
npm test
npm run check
```

Review the generated entries before committing them. The update script obtains card records from Scryfall, but the committed manifest—not a broad Scryfall set search—decides booster eligibility.

### Adding another booster product

1. Find official Wizards booster-content and collation information.
2. Create a product manifest in `data/pack-pullers/`.
3. Record eligible set codes and collector-number ranges.
4. Record slot, finish and treatment rules plus published wording and percentages.
5. Run `npm run update:pack-pullers -- PRODUCT_ID`.
6. Review generated entries manually against the official source.
7. Add tests for known inclusions, exclusions, special treatments and finish-only prices.
8. Add the product to `data/pack-pullers/index.json` only after verification.
9. Run `npm test`, `npm run check`, and preview the pages locally.
10. Commit the manifest and generated index together.

### Prices, AUD conversion and local data

- Scryfall values are labelled market estimates, not guaranteed sale values.
- A printing uses `usd`, `usd_foil`, or `usd_etched` only for the eligible finish. Missing values remain unavailable rather than becoming zero.
- One USD→AUD rate is fetched from the keyless [Frankfurter API](https://frankfurter.dev/) and cached for 24 hours. If the live request fails, the last cached rate is used. Without either, the page continues in USD and labels AUD unavailable.
- Refreshed Scryfall prices are cached for one hour. The pull checklist and view preference are stored only in browser `localStorage`; they never update a committed collection CSV.
- Card images and metadata are attributed to Scryfall. Booster eligibility and collation are attributed to the official Wizards sources stored in each manifest.

Because this is static hosting, visitors need connectivity for live price/rate refreshes, and stale committed snapshots may remain visible during an outage. Wizards can correct product collation after publication; update the manifest’s source notes and verification date when that happens.

## Privacy warning

**Any CSV or JSON committed to this public repository can be downloaded by visitors.**

Before committing a friend’s export, remove anything they do not want public, including:

- Purchase prices or dates
- Personal notes
- Sensitive binder or storage names
- Addresses or other personal information
- Credentials and API keys

Client-side hiding controls and passwords do not secure publicly committed data. This project intentionally does not implement a misleading client-side login or password gate.

## Static-hosting limitations

- There are no permanent shareable basket URLs.
- Trade requests and shopping lists are device-specific.
- Owners must provide updated CSV exports manually.
- Scryfall or exchange-rate outages can temporarily leave images, metadata or prices unavailable.
- The site does not claim that owned cards are available for trade and does not execute transactions.

## Licence

MIT. See `LICENSE`.
