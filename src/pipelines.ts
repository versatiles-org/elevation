import { checkVpl } from '@versatiles/versatiles-rs';

/**
 * The VPL pipelines that turn Mapterhorn's DEM into our containers. Each takes
 * the URL of the Mapterhorn PMTiles file and returns VPL text.
 */

/** Join pipeline steps the way `versatiles` prints them, one step per line. */
function pipe(...steps: string[]): string {
	return steps.join('\n| ');
}

/** Read the Mapterhorn PMTiles file. */
function source(sourceUrl: string): string {
	return `from_container filename='${sourceUrl}'`;
}

/**
 * The elevation tiles themselves. They are already quantized terrarium WebP, so
 * they pass through unchanged and only get our metadata.
 */
export function elevationPipeline(sourceUrl: string): string {
	return pipe(
		source(sourceUrl),
		"meta_update name='Elevation' description='Elevation based on Mapterhorn' schema='dem/terrarium'",
	);
}

/**
 * Hillshading as transparent RGBA raster tiles, rendered the way MapLibre's
 * `hillshade` layer shades the DEM, to be laid over a basemap.
 *
 * Mapterhorn's PMTiles carry no tile schema, so `dem_hillshade` is told the
 * encoding.
 */
export function hillshadePipeline(sourceUrl: string): string {
	return pipe(
		source(sourceUrl),
		'dem_hillshade encoding=terrarium',
		'raster_format format=webp quality=70',
		"meta_update name='Hillshade' description='Hillshade based on Mapterhorn'",
	);
}

interface CheckResult {
	ok: boolean;
	problems?: { message: string; path: number[]; property?: string }[];
	error?: unknown;
}

/**
 * What is wrong with a pipeline, without reading any data: unknown operations
 * or parameters and unparsable values. Empty when the pipeline is valid.
 */
export function pipelineProblems(vpl: string): string[] {
	const result = JSON.parse(checkVpl(vpl)) as CheckResult;
	if (!result.ok) return [`VPL does not parse: ${JSON.stringify(result.error)}`];
	return (result.problems ?? []).map(({ message, path, property }) => {
		const where = `step ${path.map((i) => i + 1).join('.')}${property ? `, ${property}` : ''}`;
		return `${where}: ${message}`;
	});
}
