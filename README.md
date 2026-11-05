# versatiles-elevation

Builds VersaTiles containers from [Mapterhorn](https://mapterhorn.com)'s global DEM, the remote [`planet.pmtiles`](https://download.mapterhorn.com/planet.pmtiles) (z0–12, already [Terrarium-encoded](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium) WebP), and writes them as [`.versatiles`](https://github.com/versatiles-org/versatiles-spec) containers to `OUTPUT_DIR`:

| Target      | Container              | Contents                                                                                                             |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `elevation` | `elevation.versatiles` | The DEM tiles unchanged, with our metadata (`dem/terrarium`)                                                         |
| `hillshade` | `hillshade.versatiles` | Transparent RGBA WebP hillshading (`dem_hillshade`), shaded like MapLibre's `hillshade` layer, to lay over a basemap |

The pipelines are in [`src/pipelines.ts`](src/pipelines.ts). The conversion runs in-process through the [`@versatiles/versatiles-rs`](https://www.npmjs.com/package/@versatiles/versatiles-rs) Node module, which builds the output beside the destination and renames it into place only once it is complete, so a crash never leaves a half-written container behind.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20.12+, for `process.loadEnvFile`)

The VersaTiles CLI is not needed: `npm install` brings the native module for your platform.

## Setup

```bash
npm install
cp .env.example .env   # then set OUTPUT_DIR etc.
```

Settings come from `.env` (see [`.env.example`](.env.example)); variables already set in the environment win. Without `OUTPUT_DIR`, containers are written to `data/`.

| Variable                  | Default                                          | Meaning                                                           |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `OUTPUT_DIR`              | `data/`                                          | Local directory or `sftp://` URL the containers are written to    |
| `VERSATILES_SSH_IDENTITY` | SSH agent, then `~/.ssh` keys                    | Private key for `sftp://` outputs, read by versatiles itself      |
| `VERSATILES_CACHE_DIR`    | in memory                                        | Directory for versatiles' temporary cache; set it for planet runs |
| `MAPTERHORN_URL`          | `https://download.mapterhorn.com/planet.pmtiles` | The Mapterhorn source                                             |
| `DEV_PORT`                | `8080`                                           | Port of the `npm run dev` preview server                          |

## Preview

```bash
npm run dev
```

Opens a preview server at <http://127.0.0.1:8080/> (see `DEV_PORT`). It serves every target's pipeline live from the remote Mapterhorn source, so each tile is computed when the map asks for it and nothing is converted or written. The MapLibre page in [`dev/`](dev/) shows them over the VersaTiles basemap, with toggles for the pre-rendered hillshade, MapLibre's own hillshade from the elevation tiles, and 3D terrain.

The server restarts when a file in `src/` changes, so edit a pipeline in [`src/pipelines.ts`](src/pipelines.ts) and reload the page. Tiles load slowly because they are fetched from Mapterhorn and computed on the fly.

## Usage

```bash
# Generate all containers into $OUTPUT_DIR
npm run generate

# Generate one container
npm run generate:elevation
npm run generate:hillshade

# Check the pipelines and write them to data/, without converting anything
npm run generate -- --dry-run

# Trial run: a small area and zoom range, e.g. Switzerland up to z8
npm run generate -- hillshade --bbox 5.9,45.8,10.5,47.8 --max-zoom 8 --output data/trial/hillshade.versatiles

# Write one container to a specific file instead of $OUTPUT_DIR
npm run generate -- elevation --output dem.versatiles

# See all options
npm run generate -- --help
```

The pipelines are checked with `checkVpl` and written to `data/<target>.vpl` for inspection before anything is converted, so a broken pipeline fails before a long run starts.

## Development

```bash
# Run all checks (formatting, linting, type checking, tests)
npm run check

# Individual checks
npm run check:format      # prettier --check
npm run check:lint        # eslint
npm run check:types       # tsc --noEmit
npm test                  # vitest run

npm run format            # auto-format with prettier
npm run test:coverage     # vitest run --coverage
npm run test:watch        # vitest in watch mode
npm run upgrade           # upgrade dependencies (vrt deps-upgrade)
```

## License

The source code is available under the [MIT License](LICENSE).

The elevation data is © [Mapterhorn](https://mapterhorn.com/attribution) — see their attribution page for the underlying sources and licenses.
