import { join } from 'node:path';
import { TileServer, TileSource } from '@versatiles/versatiles-rs';
import { type Config, PROJECT_ROOT, loadEnvFile, readConfig } from './config.js';
import { TARGETS } from './generate.js';
import { pipelineProblems } from './pipelines.js';

/**
 * Live preview: serves every target's pipeline straight from the remote
 * Mapterhorn source, so each tile is computed when the map asks for it, plus a
 * MapLibre page (`dev/`) to look at them. Nothing is converted or written.
 *
 * Run with `npm run dev`, which restarts the server when a pipeline changes.
 */

const DEV_DIR = join(PROJECT_ROOT, 'dev');
const MAPLIBRE_DIR = join(PROJECT_ROOT, 'node_modules', 'maplibre-gl', 'dist');

export async function startDevServer(config: Config): Promise<TileServer> {
	// The tiles change whenever a pipeline does, under the same URLs, so the
	// browser must not answer from its cache.
	const server = new TileServer({ ip: '127.0.0.1', port: config.devPort, cacheControl: 'no-cache' });

	for (const [name, target] of Object.entries(TARGETS)) {
		const vpl = target.pipeline(config.sourceUrl);
		const problems = pipelineProblems(vpl);
		if (problems.length > 0) {
			throw new Error(`Pipeline "${name}" is invalid:\n  ${problems.join('\n  ')}`);
		}
		await server.addTileSource(name, await TileSource.fromVpl(vpl, PROJECT_ROOT));
	}

	await server.addStaticSource(MAPLIBRE_DIR, '/maplibre');
	await server.addStaticSource(DEV_DIR, '/');
	await server.start();
	return server;
}

async function main(): Promise<void> {
	loadEnvFile();
	const config = readConfig();
	const server = await startDevServer(config);

	console.log(`Preview: http://127.0.0.1:${server.port}/`);
	for (const name of Object.keys(TARGETS)) {
		console.log(`  ${name}: http://127.0.0.1:${server.port}/tiles/${name}/{z}/{x}/{y}`);
	}
	console.log(`Tiles are computed live from ${config.sourceUrl}. Ctrl+C to stop.`);

	// The native server runs on its own threads and does not keep Node's event
	// loop alive, so hold it open with a timer until Ctrl+C.
	const keepAlive = setInterval(() => undefined, 2 ** 31 - 1);
	process.once('SIGINT', () => {
		clearInterval(keepAlive);
		void server.stop();
	});
}

const isEntry = process.argv[1]?.endsWith('dev.ts');
if (isEntry) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
