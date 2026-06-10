import { parseArgs } from 'node:util';
import { writeFile, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DATA_DIR } from './config.js';
import { run, runWithOutput, verifyDependencies } from './lib/command.js';

/**
 * Mapterhorn publishes a global, low-zoom DEM (`planet.pmtiles`, z0–12) plus
 * hundreds of high-zoom regional patches (`6-x-y.pmtiles`, z13–18), each
 * covering a distinct z6 tile region.
 *
 * This script builds one elevation container in two phases:
 *
 *   1. Scan every source in the download index and convert the ones that have
 *      not been converted yet, each with its own `dem_quantize` pipeline, into a
 *      per-source `.versatiles` container on the Hetzner storage box.
 *   2. Once every source is present on the storage box, stack all of those
 *      per-source containers with `from_stacked`, merge their tiles and write the
 *      combined container back to the storage box.
 *
 * Splitting it this way means a re-run only converts sources that are new (or
 * were missed last time), and the expensive remote-PMTiles quantization happens
 * once per source instead of on every merge.
 */

const DOWNLOAD_INDEX_URL = 'https://download.mapterhorn.com/download_urls.json';

// Output target and SSH identity (matches the original mapterhorn.sh).
const DEFAULT_OUTPUT = 'sftp://u417480@u417480.your-storagebox.de:23/home/incoming/elevation.versatiles';
const DEFAULT_SSH_IDENTITY = `${process.env.HOME ?? ''}/.ssh/id_ed25519`;

// Per-source containers live in a sibling directory next to the merged output.
const SOURCES_SUBDIR = 'mapterhorn-sources';

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

/** `planet.pmtiles` -> `planet`, `6-0-21.pmtiles` -> `6-0-21`. */
export function sourceSlug(item: DownloadItem): string {
	return item.name.replace(/\.pmtiles$/, '');
}

/** Filename of a source's per-source container, e.g. `6-0-21.versatiles`. */
export function containerName(item: DownloadItem): string {
	return `${sourceSlug(item)}.versatiles`;
}

/** Phase 1: quantize a single remote PMTiles source into a terrarium container. */
export function quantizePipeline(sourceUrl: string): string {
	return `from_container filename='${sourceUrl}' | dem_quantize encoding=terrarium`;
}

/**
 * Phase 2: stack the already-quantized per-source containers. `from_stacked`
 * uses the tile from the first source that provides it, so we list the high-zoom
 * regional patches before the low-zoom planet. The sources never overlap in x/y
 * at a given zoom, so the order is only a tie-breaker, but keeping detailed
 * sources first is the safe, intentional choice.
 */
export function stackPipeline(items: DownloadItem[], containerUrlFor: (item: DownloadItem) => string): string {
	const ordered = [...items].sort((a, b) => b.max_zoom - a.max_zoom);
	const sources = ordered.map((item) => `\tfrom_container filename='${containerUrlFor(item)}'`).join(',\n');
	return `from_stacked [\n${sources}\n]`;
}

/** Strip the trailing path segment from a URL or filesystem path (posix-style). */
function parentOf(path: string): string {
	const i = path.lastIndexOf('/');
	return i <= 0 ? '.' : path.slice(0, i);
}

/**
 * Where per-source and merged containers live, and how to inspect/prepare that
 * location. Backed by SSH/SFTP for `sftp://` outputs and the local filesystem
 * otherwise (handy for `--dry-run` and tests).
 */
interface Storage {
	/** Full container reference passed to `versatiles convert`. */
	containerUrl(name: string): string;
	mergedOutput: string;
	/** Extra args every `versatiles convert` call needs (e.g. `--ssh-identity`). */
	convertArgs: string[];
	/** Ensure the per-source directory exists. */
	ensureSourcesDir(): Promise<void>;
	/** Names of containers already present in the per-source directory. */
	listExisting(): Promise<Set<string>>;
}

function createRemoteStorage(output: string, sshIdentity: string): Storage {
	const url = new URL(output);
	const port = url.port || '22';
	const sshTarget = `${url.username}@${url.hostname}`;
	const sshArgs = ['-i', sshIdentity, '-p', port, '-o', 'BatchMode=yes', sshTarget];

	const sourcesDirUrl = `${parentOf(output)}/${SOURCES_SUBDIR}`;
	const sourcesDirPath = `${parentOf(url.pathname)}/${SOURCES_SUBDIR}`;

	return {
		containerUrl: (name) => `${sourcesDirUrl}/${name}`,
		mergedOutput: output,
		convertArgs: ['--ssh-identity', sshIdentity],
		async ensureSourcesDir() {
			await run('ssh', [...sshArgs, 'mkdir', '-p', sourcesDirPath]);
		},
		async listExisting() {
			try {
				const stdout = await run('ssh', [...sshArgs, 'ls', '-1', sourcesDirPath]);
				return new Set(
					stdout
						.split('\n')
						.map((line) => line.trim())
						.filter((line) => line.length > 0),
				);
			} catch {
				// Directory does not exist yet -> nothing converted so far.
				return new Set();
			}
		},
	};
}

function createLocalStorage(output: string): Storage {
	const sourcesDir = join(parentOf(output), SOURCES_SUBDIR);
	return {
		containerUrl: (name) => join(sourcesDir, name),
		mergedOutput: output,
		convertArgs: [],
		async ensureSourcesDir() {
			await mkdir(sourcesDir, { recursive: true });
		},
		async listExisting() {
			try {
				return new Set(await readdir(sourcesDir));
			} catch {
				return new Set();
			}
		},
	};
}

function createStorage(output: string, sshIdentity: string): Storage {
	return output.startsWith('sftp://') ? createRemoteStorage(output, sshIdentity) : createLocalStorage(output);
}

interface CliArgs {
	output: string;
	sshIdentity: string;
	vplPath: string;
	cacheDir?: string;
	force: boolean;
	dryRun: boolean;
}

function parseCliArgs(): CliArgs {
	const { values } = parseArgs({
		options: {
			output: { type: 'string', short: 'o' },
			'ssh-identity': { type: 'string' },
			'vpl-path': { type: 'string' },
			'cache-dir': { type: 'string' },
			force: { type: 'boolean' },
			'dry-run': { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
		strict: true,
	});

	if (values.help) {
		console.log(`Usage: npx tsx src/mapterhorn.ts [options]

Builds one elevation container from all Mapterhorn DEM sources in two phases:
  1. Convert each not-yet-converted source with dem_quantize into a per-source
     container next to the output (in a "${SOURCES_SUBDIR}" directory).
  2. Stack all per-source containers with from_stacked and merge them into the
     output container.

Options:
  -o, --output <target>    Merged output container path or SFTP URL
                           (default: ${DEFAULT_OUTPUT})
      --ssh-identity <f>   SSH identity file for SFTP (default: ~/.ssh/id_ed25519)
      --vpl-path <file>    Where to write the generated merge pipeline
                           (default: data/mapterhorn.vpl)
      --cache-dir <dir>    Cache dir for versatiles convert (set via the
                           VERSATILES_CACHE_DIR env var). Default: a temporary
                           directory created per run and removed on completion.
      --force              Re-convert sources even if their container exists
      --dry-run            Only generate the merge .vpl file, convert nothing
  -h, --help               Show this help`);
		process.exit(0);
	}

	return {
		output: values.output ?? DEFAULT_OUTPUT,
		sshIdentity: values['ssh-identity'] ?? DEFAULT_SSH_IDENTITY,
		vplPath: values['vpl-path'] ?? join(DATA_DIR, 'mapterhorn.vpl'),
		cacheDir: values['cache-dir'],
		force: values.force ?? false,
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	const args = parseCliArgs();

	console.log('Verifying system dependencies...');
	await verifyDependencies(['versatiles']);

	const index = await fetchIndex(DOWNLOAD_INDEX_URL);
	console.log(`Index version ${index.version}: ${index.items.length} sources`);

	const storage = createStorage(args.output, args.sshIdentity);

	// Always write the merge pipeline for inspection.
	await mkdir(DATA_DIR, { recursive: true });
	const mergePipeline = stackPipeline(index.items, (item) => storage.containerUrl(containerName(item)));
	await writeFile(args.vplPath, mergePipeline + '\n');
	console.log(`Wrote merge pipeline (${index.items.length} sources) to ${args.vplPath}`);

	if (args.dryRun) {
		console.log('Dry run, skipping conversion and merge.');
		return;
	}

	// versatiles caches remote PMTiles reads in $VERSATILES_CACHE_DIR. Use the
	// caller-provided dir if given, otherwise a temporary one we remove on exit.
	const usingTempCache = !args.cacheDir;
	const cacheDir = args.cacheDir ?? (await mkdtemp(join(tmpdir(), 'versatiles-cache-')));
	const convertEnv = { VERSATILES_CACHE_DIR: cacheDir };
	console.log(`versatiles cache dir: ${cacheDir}${usingTempCache ? ' (temporary)' : ''}`);

	try {
		// ---- Phase 1: convert new sources into per-source containers ----------
		await storage.ensureSourcesDir();
		const existing = args.force ? new Set<string>() : await storage.listExisting();

		const pending = index.items.filter((item) => !existing.has(containerName(item)));
		console.log(
			`Phase 1: ${pending.length} source(s) to convert, ${index.items.length - pending.length} already present.`,
		);

		for (const [i, item] of pending.entries()) {
			const target = storage.containerUrl(containerName(item));
			console.log(`[${i + 1}/${pending.length}] Converting ${item.name} -> ${target}`);
			const pipeline = quantizePipeline(item.url);
			await runWithOutput('versatiles', [...storage.convertArgs, 'convert', `[,vpl](${pipeline})`, target], {
				env: convertEnv,
			});
		}

		console.log('Phase 1 complete: all sources converted.');

		// ---- Phase 2: stack per-source containers into the merged output ------
		console.log(`Phase 2: merging ${index.items.length} sources into ${storage.mergedOutput}`);
		await runWithOutput('versatiles', [...storage.convertArgs, 'convert', args.vplPath, storage.mergedOutput], {
			env: convertEnv,
		});

		console.log(`Merge complete: ${storage.mergedOutput}`);
	} finally {
		if (usingTempCache) {
			await rm(cacheDir, { recursive: true, force: true });
		}
	}
}

const isEntry = process.argv[1]?.endsWith('mapterhorn.ts');
if (isEntry) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
