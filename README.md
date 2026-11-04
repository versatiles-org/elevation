# versatiles-elevation

Builds the VersaTiles elevation container (`elevation.versatiles`) from [Mapterhorn](https://mapterhorn.com)'s global DEM.

The script reads the remote [`planet.pmtiles`](https://download.mapterhorn.com/planet.pmtiles) (z0–12, already [Terrarium-encoded](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium) WebP), updates its metadata with `meta_update` and writes the result as a [`.versatiles`](https://github.com/versatiles-org/versatiles-spec) container to the output target (the storagebox by default). It converts into a `tmp_` file first and renames it once the conversion succeeds, so a crash never leaves a half-written container behind.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [VersaTiles](https://github.com/versatiles-org/versatiles-rs) (`versatiles`)

## Setup

```bash
npm install
```

## Usage

```bash
# Convert planet.pmtiles (writes to the storagebox SFTP target by default)
npm run mapterhorn

# Only generate the .vpl pipeline file, without converting anything
npm run mapterhorn -- --dry-run

# Convert to a local file instead
npm run mapterhorn -- --output dem.versatiles

# See all options
npm run mapterhorn -- --help
```

The generated pipeline is written to `data/mapterhorn.vpl` for inspection.

## Development

```bash
# Run all checks (formatting, linting, type checking, tests)
npm run check

# Individual checks
npm run format            # auto-format with prettier
npm run lint              # prettier --check + eslint
npm run check:types       # tsc --noEmit
npm test                  # vitest run
npm run test:coverage     # vitest run --coverage
npm run test:watch        # vitest in watch mode
```

## License

The source code is available under the [MIT License](LICENSE).

The elevation data is © [Mapterhorn](https://mapterhorn.com/attribution) — see their attribution page for the underlying sources and licenses.
