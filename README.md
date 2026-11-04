# versatiles-elevation

Builds the VersaTiles elevation container (`elevation.versatiles`) from [Mapterhorn](https://mapterhorn.com)'s global DEM.

The script reads the remote [`planet.pmtiles`](https://download.mapterhorn.com/planet.pmtiles) (z0–12, already [Terrarium-encoded](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium) WebP), updates its metadata with `meta_update` and writes the result as a [`.versatiles`](https://github.com/versatiles-org/versatiles-spec) container to the output target (the storagebox by default). The conversion runs in-process through the [`@versatiles/versatiles-rs`](https://www.npmjs.com/package/@versatiles/versatiles-rs) Node module, which builds the output beside the destination and renames it into place only once it is complete, so a crash never leaves a half-written container behind.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)

The VersaTiles CLI is not needed: `npm install` brings the native module for your platform.

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
