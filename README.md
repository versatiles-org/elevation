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

## Using the tiles in MapLibre

Which container to use:

- **Elevation** for 3D terrain, hillshading that MapLibre computes in the browser (light direction and colours set in the style), and colour relief.
- **Hillshade** for a fixed relief overlay on a basemap: a plain `raster` layer, with no DEM decoding in the browser.

Serve a container with [`versatiles serve`](https://github.com/versatiles-org/versatiles-rs), e.g. `versatiles serve hillshade.versatiles`, and point MapLibre at its TileJSON, `/tiles/<name>/tiles.json`. The elevation tiles are hosted at <https://tiles.versatiles.org/tiles/elevation/tiles.json>.

### Hillshade

Shadows are black and highlights white, with their strength in the alpha channel, so the layer works over any basemap. Add it below the first symbol layer, so labels stay on top, and tune its strength with `raster-opacity`:

```js
map.addSource('hillshade', {
	type: 'raster',
	url: 'https://your-server/tiles/hillshade/tiles.json',
	tileSize: 512,
});
const firstSymbol = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
map.addLayer({ id: 'hillshade', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': 0.5 } }, firstSymbol);
```

### Elevation

The tiles are Terrarium-encoded, which the TileJSON does not tell MapLibre, so set `encoding` on the source. Use separate sources for MapLibre's `hillshade` layer and for terrain: MapLibre loads terrain tiles one zoom level coarser, which would blur a hillshade sharing the source.

```js
const dem = {
	type: 'raster-dem',
	url: 'https://tiles.versatiles.org/tiles/elevation/tiles.json',
	encoding: 'terrarium',
	tileSize: 512,
};
map.addSource('elevation-hillshade', dem);
map.addSource('elevation-terrain', dem);
map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'elevation-hillshade' }, firstSymbol);
map.setTerrain({ source: 'elevation-terrain', exaggeration: 1 });
```

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
