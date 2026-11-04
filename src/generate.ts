import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { convert, type MessageData, type ProgressData } from '@versatiles/versatiles-rs';
import { DATA_DIR, loadEnvFile, outputPath, readConfig } from './config.js';
import { elevationPipeline, hillshadePipeline, pipelineProblems } from './pipelines.js';

/**
 * Generates the elevation containers from Mapterhorn's global DEM
 * (`planet.pmtiles`) and writes them to `OUTPUT_DIR` (see `.env.example`).
 */

/** How often to print a progress line, in milliseconds. */
const PROGRESS_INTERVAL = 10_000;

/** A container this script can generate. */
export interface Target {
	/** File name of the container inside `OUTPUT_DIR`. */
	filename: string;
	/** The VPL pipeline that produces it from the Mapterhorn source. */
	pipeline(sourceUrl: string): string;
}

export const TARGETS: Record<string, Target> = {
	elevation: { filename: 'elevation.versatiles', pipeline: elevationPipeline },
	hillshade: { filename: 'hillshade.versatiles', pipeline: hillshadePipeline },
};

/** Parse `--bbox west,south,east,north` in WGS84 degrees. */
export function parseBbox(value: string): [number, number, number, number] {
	const parts = value.split(',').map((part) => Number(part.trim()));
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
		throw new Error(`--bbox needs four numbers west,south,east,north, got "${value}"`);
	}
	const [west, south, east, north] = parts;
	if (west >= east || south >= north) {
		throw new Error(`--bbox needs west < east and south < north, got "${value}"`);
	}
	return [west, south, east, north];
}

/** Parse `--max-zoom`, an integer from 0 to 30. */
export function parseZoom(value: string): number {
	const zoom = /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
	if (!Number.isInteger(zoom) || zoom > 30) {
		throw new Error(`--max-zoom needs an integer from 0 to 30, got "${value}"`);
	}
	return zoom;
}

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
	bbox?: [number, number, number, number];
	maxZoom?: number;
	dryRun: boolean;
}

function parseCliArgs(): CliArgs {
	const { values, positionals } = parseArgs({
		options: {
			output: { type: 'string', short: 'o' },
			'ssh-identity': { type: 'string' },
			bbox: { type: 'string' },
			'max-zoom': { type: 'string' },
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
      --bbox <w,s,e,n>     Only convert this area, in WGS84 degrees (for trial runs)
      --max-zoom <z>       Only convert up to this zoom level (for trial runs)
      --dry-run            Check the pipelines and write them to data/,
                           convert nothing
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
		bbox: values.bbox === undefined ? undefined : parseBbox(values.bbox),
		maxZoom: values['max-zoom'] === undefined ? undefined : parseZoom(values['max-zoom']),
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	loadEnvFile();
	const config = readConfig();
	const args = parseCliArgs();

	await mkdir(DATA_DIR, { recursive: true });

	// Write and check every pipeline before converting any, so a broken one
	// fails now rather than after the others have run for hours.
	const jobs = [];
	for (const name of args.targets) {
		const target = TARGETS[name];
		const vpl = target.pipeline(config.sourceUrl);
		const vplPath = join(DATA_DIR, `${name}.vpl`);
		await writeFile(vplPath, vpl + '\n');
		console.log(`Wrote pipeline to ${vplPath}`);

		const problems = pipelineProblems(vpl);
		if (problems.length > 0) {
			throw new Error(`Pipeline "${name}" is invalid:\n  ${problems.join('\n  ')}`);
		}
		jobs.push({ name, vplPath, output: args.output ?? outputPath(config.outputDir, target.filename) });
	}

	if (args.dryRun) {
		console.log('Pipelines are valid. Dry run, converting nothing.');
		return;
	}

	for (const { name, vplPath, output } of jobs) {
		// versatiles builds the output beside the destination and renames it into
		// place only once it is complete, locally and over SFTP alike, so a crash
		// never leaves a corrupt container at the real path.
		console.log(`Converting ${name}: ${config.sourceUrl} -> ${output}`);
		if (!output.includes('://')) await mkdir(dirname(output), { recursive: true });
		await convert(
			vplPath,
			output,
			{ sshIdentity: args.sshIdentity, bbox: args.bbox, maxZoom: args.maxZoom },
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
