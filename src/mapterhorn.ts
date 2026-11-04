import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { convert, type MessageData, type ProgressData } from '@versatiles/versatiles-rs';
import { DATA_DIR } from './config.js';

/**
 * Converts Mapterhorn's global DEM (`planet.pmtiles`) into a single elevation
 * container: the remote PMTiles file is read, its metadata is updated and it is
 * written to the output (the Hetzner storage box by default).
 */

const SOURCE_URL = 'https://download.mapterhorn.com/planet.pmtiles';

// Output target (matches the original mapterhorn.sh).
const DEFAULT_OUTPUT = 'sftp://u417480@u417480.your-storagebox.de:23/home/incoming/elevation.versatiles';

const METADATA = {
	name: 'Elevation',
	description: 'Elevation based on Mapterhorn',
};

/** How often to print a progress line, in milliseconds. */
const PROGRESS_INTERVAL = 10_000;

/**
 * Read a remote PMTiles source and tag it with our own TileJSON metadata. The
 * Mapterhorn tiles are already quantized terrarium WebP, so they pass through
 * unchanged.
 */
export function buildPipeline(sourceUrl: string): string {
	return [
		`from_container filename='${sourceUrl}'`,
		`meta_update name='${METADATA.name}' description='${METADATA.description}' schema='dem/terrarium'`,
	].join('\n| ');
}

/** One human-readable progress line, e.g. `12.3% (1234/10000 tiles, 56 tiles/s, ETA 14:05:00)`. */
export function formatProgress(progress: ProgressData): string {
	const parts = [`${progress.position}/${progress.total} tiles`, `${progress.speed.toFixed(0)} tiles/s`];
	if (progress.etaTimestamp !== undefined) {
		parts.push(`ETA ${new Date(progress.etaTimestamp).toLocaleString()}`);
	}
	const step = progress.message ? `${progress.message}: ` : '';
	return `${step}${progress.percentage.toFixed(1)}% (${parts.join(', ')})`;
}

/** Progress callback that prints at most one line per `interval` milliseconds. */
export function createProgressLogger(
	log: (line: string) => void,
	interval = PROGRESS_INTERVAL,
	now: () => number = Date.now,
): (progress: ProgressData) => void {
	let last = -Infinity;
	return (progress) => {
		const t = now();
		if (t - last < interval) return;
		last = t;
		log(formatProgress(progress));
	};
}

function logMessage({ type, message }: MessageData): void {
	if (type === 'error') console.error(message);
	else if (type === 'warning') console.warn(message);
	else console.log(message);
}

interface CliArgs {
	output: string;
	sshIdentity?: string;
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

Converts the global Mapterhorn DEM (${SOURCE_URL}) into one
elevation container with updated metadata.

Options:
  -o, --output <target>    Output container path or SFTP URL
                           (default: ${DEFAULT_OUTPUT})
      --ssh-identity <f>   SSH identity file for SFTP (default:
                           $VERSATILES_SSH_IDENTITY, then the SSH agent and
                           the usual ~/.ssh keys)
      --vpl-path <file>    Where to write the generated pipeline
                           (default: data/mapterhorn.vpl)
      --dry-run            Only generate the .vpl file, convert nothing
  -h, --help               Show this help`);
		process.exit(0);
	}

	return {
		output: values.output ?? DEFAULT_OUTPUT,
		sshIdentity: values['ssh-identity'],
		vplPath: values['vpl-path'] ?? join(DATA_DIR, 'mapterhorn.vpl'),
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	const args = parseCliArgs();

	// Always write the pipeline for inspection.
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(args.vplPath, buildPipeline(SOURCE_URL) + '\n');
	console.log(`Wrote pipeline to ${args.vplPath}`);

	if (args.dryRun) {
		console.log('Dry run, skipping conversion.');
		return;
	}

	// versatiles builds the output beside the destination and renames it into
	// place only once it is complete, locally and over SFTP alike, so a crash
	// never leaves a corrupt container at the real path.
	console.log(`Converting ${SOURCE_URL} -> ${args.output}`);
	await convert(
		args.vplPath,
		args.output,
		{ sshIdentity: args.sshIdentity },
		createProgressLogger((line) => {
			console.log(line);
		}),
		logMessage,
	);

	console.log(`Conversion complete: ${args.output}`);
}

const isEntry = process.argv[1]?.endsWith('mapterhorn.ts');
if (isEntry) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
