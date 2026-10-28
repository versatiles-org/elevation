import { parseArgs } from 'node:util';
import { writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DATA_DIR } from './config.js';
import { run, runWithOutput, verifyDependencies } from './lib/command.js';

/**
 * Converts Mapterhorn's global DEM (`planet.pmtiles`) into a single elevation
 * container: the remote PMTiles file is read, its metadata is updated and it is
 * written to the output (the Hetzner storage box by default).
 */

const SOURCE_URL = 'https://download.mapterhorn.com/planet.pmtiles';

// Output target and SSH identity (matches the original mapterhorn.sh).
const DEFAULT_OUTPUT = 'sftp://u417480@u417480.your-storagebox.de:23/home/incoming/elevation.versatiles';
const DEFAULT_SSH_IDENTITY = `${process.env.HOME ?? ''}/.ssh/id_ed25519`;

const METADATA = {
	name: 'Elevation',
	description: 'Elevation based on Mapterhorn',
};

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

/**
 * Temp variant of a container reference, with `tmp_` prefixed to the basename:
 * `.../elevation.versatiles` -> `.../tmp_elevation.versatiles`. We convert into
 * this, then rename to the final name, so a crash never leaves a half-written
 * container at the real path.
 */
export function tmpVariant(target: string): string {
	const i = target.lastIndexOf('/');
	return i < 0 ? `tmp_${target}` : `${target.slice(0, i + 1)}tmp_${target.slice(i + 1)}`;
}

/**
 * How to write to the output location. Backed by SSH/SFTP for `sftp://` outputs
 * and the local filesystem otherwise.
 */
interface Storage {
	/** Extra args every `versatiles convert` call needs (e.g. `--ssh-identity`). */
	convertArgs: string[];
	/** Rename the temp variant of `target` (see `tmpVariant`) to `target`. */
	promote(target: string): Promise<void>;
}

function createRemoteStorage(output: string, sshIdentity: string): Storage {
	const url = new URL(output);
	const port = url.port || '22';
	const sshTarget = `${url.username}@${url.hostname}`;
	const sshArgs = ['-i', sshIdentity, '-p', port, '-o', 'BatchMode=yes', sshTarget];

	return {
		convertArgs: ['--ssh-identity', sshIdentity],
		async promote(target) {
			await run('ssh', [...sshArgs, 'mv', new URL(tmpVariant(target)).pathname, new URL(target).pathname]);
		},
	};
}

function createLocalStorage(): Storage {
	return {
		convertArgs: [],
		async promote(target) {
			await rename(tmpVariant(target), target);
		},
	};
}

function createStorage(output: string, sshIdentity: string): Storage {
	return output.startsWith('sftp://') ? createRemoteStorage(output, sshIdentity) : createLocalStorage();
}

interface CliArgs {
	output: string;
	sshIdentity: string;
	vplPath: string;
	cacheDir?: string;
	dryRun: boolean;
}

function parseCliArgs(): CliArgs {
	const { values } = parseArgs({
		options: {
			output: { type: 'string', short: 'o' },
			'ssh-identity': { type: 'string' },
			'vpl-path': { type: 'string' },
			'cache-dir': { type: 'string' },
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
      --ssh-identity <f>   SSH identity file for SFTP (default: ~/.ssh/id_ed25519)
      --vpl-path <file>    Where to write the generated pipeline
                           (default: data/mapterhorn.vpl)
      --cache-dir <dir>    Cache dir for versatiles convert (set via the
                           VERSATILES_CACHE_DIR env var). Default: a temporary
                           directory created per run and removed on completion.
      --dry-run            Only generate the .vpl file, convert nothing
  -h, --help               Show this help`);
		process.exit(0);
	}

	return {
		output: values.output ?? DEFAULT_OUTPUT,
		sshIdentity: values['ssh-identity'] ?? DEFAULT_SSH_IDENTITY,
		vplPath: values['vpl-path'] ?? join(DATA_DIR, 'mapterhorn.vpl'),
		cacheDir: values['cache-dir'],
		dryRun: values['dry-run'] ?? false,
	};
}

export async function main(): Promise<void> {
	const args = parseCliArgs();

	console.log('Verifying system dependencies...');
	await verifyDependencies(['versatiles']);

	const storage = createStorage(args.output, args.sshIdentity);

	// Always write the pipeline for inspection.
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(args.vplPath, buildPipeline(SOURCE_URL) + '\n');
	console.log(`Wrote pipeline to ${args.vplPath}`);

	if (args.dryRun) {
		console.log('Dry run, skipping conversion.');
		return;
	}

	// versatiles caches remote PMTiles reads in $VERSATILES_CACHE_DIR. Use the
	// caller-provided dir if given, otherwise a temporary one we remove on exit.
	const usingTempCache = !args.cacheDir;
	const cacheDir = args.cacheDir ?? (await mkdtemp(join(tmpdir(), 'versatiles-cache-')));
	console.log(`versatiles cache dir: ${cacheDir}${usingTempCache ? ' (temporary)' : ''}`);

	try {
		console.log(`Converting ${SOURCE_URL} -> ${args.output}`);
		// Convert into a tmp_ file and only rename it into place once convert
		// succeeds, so a crash never leaves a corrupt container behind.
		await runWithOutput('versatiles', [...storage.convertArgs, 'convert', args.vplPath, tmpVariant(args.output)], {
			env: { VERSATILES_CACHE_DIR: cacheDir },
		});
		await storage.promote(args.output);

		console.log(`Conversion complete: ${args.output}`);
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
