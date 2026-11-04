# versatiles-elevation

Builds the VersaTiles elevation container (`elevation.versatiles`) from [Mapterhorn](https://mapterhorn.com)'s global DEM.

The script reads the remote [`planet.pmtiles`](https://download.mapterhorn.com/planet.pmtiles) (z0–12, already [Terrarium-encoded](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium) WebP), updates its metadata with `meta_update` and writes the result as a [`.versatiles`](https://github.com/versatiles-org/versatiles-spec) container to `OUTPUT_DIR`. The conversion runs in-process through the [`@versatiles/versatiles-rs`](https://www.npmjs.com/package/@versatiles/versatiles-rs) Node module, which builds the output beside the destination and renames it into place only once it is complete, so a crash never leaves a half-written container behind.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20.12+, for `process.loadEnvFile`)

The VersaTiles CLI is not needed: `npm install` brings the native module for your platform.

## Setup

```bash
npm install
cp .env.example .env   # then set OUTPUT_DIR etc.
```

Settings come from `.env` (see [`.env.example`](.env.example)); variables already set in the environment win. Without `OUTPUT_DIR`, containers are written to `data/`.

| Variable                  | Default                                          | Meaning                                                        |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `OUTPUT_DIR`              | `data/`                                          | Local directory or `sftp://` URL the containers are written to |
| `VERSATILES_SSH_IDENTITY` | SSH agent, then `~/.ssh` keys                    | Private key for `sftp://` outputs, read by versatiles itself   |
| `MAPTERHORN_URL`          | `https://download.mapterhorn.com/planet.pmtiles` | The Mapterhorn source                                          |

## Usage

```bash
# Generate all containers into $OUTPUT_DIR
npm run generate

# Generate one container
npm run generate:elevation

# Only write the .vpl pipelines to data/, without converting anything
npm run generate -- --dry-run

# Write one container to a specific file instead of $OUTPUT_DIR
npm run generate -- elevation --output dem.versatiles

# See all options
npm run generate -- --help
```

The pipelines are written to `data/<target>.vpl` for inspection.

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
