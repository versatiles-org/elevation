import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';
import { runWithOutput, verifyDependencies } from './lib/command.js';

/**
 * Mapterhorn publishes a global, low-zoom DEM (`planet.pmtiles`, z0–12) plus
 * hundreds of high-zoom regional patches (`6-x-y.pmtiles`, z13–18), each
 * covering a distinct z6 tile region. This script discovers all of them from
 * the download index, stacks them into a single VersaTiles pipeline, quantizes
 * the elevation, and converts the whole stack into one elevation container in a
 * single pass.
 */

const DOWNLOAD_INDEX_URL = 'https://download.mapterhorn.com/download_urls.json';

// Output target and SSH identity (matches the original mapterhorn.sh).
const DEFAULT_OUTPUT = 'sftp://u417480@u417480.your-storagebox.de:23/home/incoming/elevation.versatiles';
const DEFAULT_SSH_IDENTITY = `${process.env.HOME ?? ''}/.ssh/id_ed25519`;

interface DownloadItem {
	name: string;
	url: string;
	md5sum: string;
	size: number;
	min_zoom: number;
	max_zoom: number;
}

interface DownloadIndex {
	version: string;
	items: DownloadItem[];
}

async function fetchIndex(url: string): Promise<DownloadIndex> {
	console.log(`Fetching download index: ${url}`);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
	}
	const index = (await res.json()) as DownloadIndex;
	if (!Array.isArray(index.items) || index.items.length === 0) {
		throw new Error('Download index contains no items');
	}
	return index;
}

/**
 * Builds a `from_stacked_raster` pipeline over every source. `from_stacked_raster`
 * uses the tile from the first source that provides it, so we list the high-zoom
 * regional patches before the low-zoom planet. Because the sources never overlap
 * in x/y at any given zoom, the order only matters as a tie-breaker, but keeping
 * detailed sources first is the safe, intentional choice.
 */
function buildPipeline(items: DownloadItem[]): string {
	const ordered = [...items].sort((a, b) => b.max_zoom - a.max_zoom);

	const sources = ordered.map((item) => `\tfrom_container filename='${item.url}'`).join(',\n');

	return `from_stacked_raster [\n${sources}\n] | dem_quantize encoding=terrarium`;
}

interface CliArgs {
	output: string;
	sshIdentity: string;
	vplPath: string;
	dryRun: boolean;
}

function parseCliArgs(): CliArgs {
	const { values } = parseArgs({
		options: {
			output: { type: 'string', short: 'o' },
			'ssh-identity': { type: 'string' },
			'vpl-path': { type: 'string' },
			'dry-run': { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
		strict: true,
	});

	if (values.help) {
		console.log(`Usage: npx tsx src/mapterhorn.ts [options]

Stacks all Mapterhorn DEM sources into a single elevation container.

Options:
  -o, --output <target>    Output container path or SFTP URL
                           (default: ${DEFAULT_OUTPUT})
      --ssh-identity <f>   SSH identity file for SFTP (default: ~/.ssh/id_ed25519)
      --vpl-path <file>    Where to write the generated pipeline
                           (default: data/mapterhorn.vpl)
      --dry-run            Only generate the .vpl file, do not run the conversion
  -h, --help               Show this help`);
		process.exit(0);
	}

	return {
		output: values.output ?? DEFAULT_OUTPUT,
		sshIdentity: values['ssh-identity'] ?? DEFAULT_SSH_IDENTITY,
		vplPath: values['vpl-path'] ?? join(DATA_DIR, 'mapterhorn.vpl'),
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	const args = parseCliArgs();

	console.log('Verifying system dependencies...');
	await verifyDependencies(['versatiles']);

	const index = await fetchIndex(DOWNLOAD_INDEX_URL);
	console.log(`Index version ${index.version}: ${index.items.length} sources`);

	const pipeline = buildPipeline(index.items);

	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(args.vplPath, pipeline + '\n');
	console.log(`Wrote pipeline (${index.items.length} sources) to ${args.vplPath}`);

	if (args.dryRun) {
		console.log('Dry run, skipping conversion.');
		return;
	}

	console.log(`Converting stacked DEM into ${args.output}`);
	await runWithOutput('versatiles', ['--ssh-identity', args.sshIdentity, 'convert', args.vplPath, args.output]);

	console.log('Conversion complete.');
}

const isEntry = process.argv[1]?.endsWith('mapterhorn.ts');
if (isEntry) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
