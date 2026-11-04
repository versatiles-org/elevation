import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { convert, type MessageData, type ProgressData } from '@versatiles/versatiles-rs';
import { DATA_DIR, loadEnvFile, outputPath, readConfig } from './config.js';

/**
 * Generates the elevation containers from Mapterhorn's global DEM
 * (`planet.pmtiles`) and writes them to `OUTPUT_DIR` (see `.env.example`).
 */

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

/** A container this script can generate. */
export interface Target {
	/** File name of the container inside `OUTPUT_DIR`. */
	filename: string;
	/** The VPL pipeline that produces it from the Mapterhorn source. */
	pipeline(sourceUrl: string): string;
}

export const TARGETS: Record<string, Target> = {
	elevation: { filename: 'elevation.versatiles', pipeline: buildPipeline },
};

/** The targets named on the command line, or all of them if none are named. */
export function selectTargets(names: string[]): string[] {
	if (names.length === 0) return Object.keys(TARGETS);
	const unknown = names.filter((name) => !(name in TARGETS));
	if (unknown.length > 0) {
		throw new Error(`Unknown target: ${unknown.join(', ')}. Known: ${Object.keys(TARGETS).join(', ')}`);
	}
	return [...new Set(names)];
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
	targets: string[];
	output?: string;
	sshIdentity?: string;
	dryRun: boolean;
}

function parseCliArgs(): CliArgs {
	const { values, positionals } = parseArgs({
		options: {
			output: { type: 'string', short: 'o' },
			'ssh-identity': { type: 'string' },
			'dry-run': { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
		allowPositionals: true,
		strict: true,
	});

	if (values.help) {
		console.log(`Usage: npm run generate -- [target...] [options]

Generates elevation containers from the Mapterhorn DEM and writes them to
$OUTPUT_DIR (default: data/). Settings are read from .env, see .env.example.

Targets: ${Object.keys(TARGETS).join(', ')} (default: all)

Options:
  -o, --output <target>    Output container path or SFTP URL, overriding
                           $OUTPUT_DIR. Only with a single target.
      --ssh-identity <f>   SSH identity file for SFTP (default:
                           $VERSATILES_SSH_IDENTITY, then the SSH agent and
                           the usual ~/.ssh keys)
      --dry-run            Only write the pipelines to data/, convert nothing
  -h, --help               Show this help`);
		process.exit(0);
	}

	const targets = selectTargets(positionals);
	if (values.output !== undefined && targets.length !== 1) {
		throw new Error('--output needs exactly one target');
	}

	return {
		targets,
		output: values.output,
		sshIdentity: values['ssh-identity'],
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	loadEnvFile();
	const config = readConfig();
	const args = parseCliArgs();

	await mkdir(DATA_DIR, { recursive: true });

	for (const name of args.targets) {
		const target = TARGETS[name];
		const output = args.output ?? outputPath(config.outputDir, target.filename);

		// Always write the pipeline for inspection.
		const vplPath = join(DATA_DIR, `${name}.vpl`);
		await writeFile(vplPath, target.pipeline(config.sourceUrl) + '\n');
		console.log(`Wrote pipeline to ${vplPath}`);

		if (args.dryRun) {
			console.log(`Dry run, skipping ${name}.`);
			continue;
		}

		// versatiles builds the output beside the destination and renames it into
		// place only once it is complete, locally and over SFTP alike, so a crash
		// never leaves a corrupt container at the real path.
		console.log(`Converting ${name}: ${config.sourceUrl} -> ${output}`);
		await convert(
			vplPath,
			output,
			{ sshIdentity: args.sshIdentity },
			createProgressLogger((line) => {
				console.log(line);
			}),
			logMessage,
		);
		console.log(`Conversion complete: ${output}`);
	}
}

const isEntry = process.argv[1]?.endsWith('generate.ts');
if (isEntry) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
