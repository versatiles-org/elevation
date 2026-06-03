# versatiles-dem

CLI tool for downloading, processing, and converting Digital Elevation Model (DEM) data into [Terrarium-encoded](https://s3.amazonaws.com/elevation-tiles-prod/terrarium/) map tiles stored in [`.versatiles`](https://github.com/versatiles-org/versatiles-spec) containers.

Currently supports [Copernicus DEM GLO-30](https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model) (30m resolution) and GLO-90 (90m resolution).

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [GDAL](https://gdal.org/) (`gdalinfo`, `gdalbuildvrt`)
- [VersaTiles](https://github.com/versatiles-org/versatiles-rs) (`versatiles`)

## Setup

```bash
npm install
```

## Usage

```bash
# Run the full pipeline for all sources
./dem

# Process a single source
./dem --source copernicus-dem-glo30
./dem --source copernicus-dem-glo90

# Run a specific step for all sources
./dem --step download
./dem --step check

# Combine both flags
./dem --source copernicus-dem-glo90 --step download

# Run the merge step (combines all sources into one file)
./dem --step merge

# Show help
./dem --help
```

## Pipeline Steps

The pipeline runs these steps in order for each source:

| Step       | Description                                                                       |
| ---------- | --------------------------------------------------------------------------------- |
| `download` | Fetch tile list from S3 and download all GeoTIFF tiles (8 concurrent, with retry) |
| `check`    | Verify completeness against tile list and integrity via `gdalinfo`                |
| `vrt`      | Build a virtual raster (`dem.vrt`) from all tiles using `gdalbuildvrt`            |
| `convert`  | Convert VRT to `.versatiles` with Terrarium encoding                              |
| `backup`   | _(not yet implemented)_                                                           |
| `merge`    | Merge all per-source `.versatiles` files into a single `dem.versatiles`           |

## Output

```
data/
├── copernicus-dem-glo30/
│   ├── tileList.txt
│   ├── tiles/                              # ~26,000 GeoTIFFs
│   ├── dem.vrt
│   └── copernicus-dem-glo30.versatiles
├── copernicus-dem-glo90/
│   ├── tileList.txt
│   ├── tiles/
│   ├── dem.vrt
│   └── copernicus-dem-glo90.versatiles
└── dem.versatiles                          # merged output
```

## Mapterhorn

In addition to processing Copernicus DEM, this repo can build a single elevation
container from [Mapterhorn](https://mapterhorn.com)'s published tiles. Mapterhorn
provides a global low-zoom DEM (`planet.pmtiles`, z0–12) plus hundreds of
high-zoom regional patches (`6-x-y.pmtiles`, z13–18). The `mapterhorn` script
discovers all of them from the [download index](https://download.mapterhorn.com/download_urls.json),
stacks them with `from_stacked_raster`, quantizes the elevation, and converts the
whole stack into one container in a single pass.

```bash
# Stack all sources and convert (writes to the storagebox SFTP target by default)
npm run mapterhorn

# Only generate the .vpl pipeline file, without running the conversion
npm run mapterhorn -- --dry-run

# Convert to a local file instead
npm run mapterhorn -- --output dem.versatiles

# See all options
npm run mapterhorn -- --help
```

> **Note:** the generated pipeline opens all ~460 remote PMTiles sources. `versatiles`
> reads each source's header up front, so expect a burst of HTTP range requests at
> startup (it retries automatically if the server throttles).

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

Data sources have their own licenses — see the YAML files in `sources/` for details.
