import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
export const DATA_DIR = join(PROJECT_ROOT, 'data');
export const ENV_FILE = join(PROJECT_ROOT, '.env');

export const DEFAULT_SOURCE_URL = 'https://download.mapterhorn.com/planet.pmtiles';

/**
 * Settings that differ between machines. They come from the environment, which
 * `loadEnvFile` fills from `.env`; see `.env.example`.
 *
 * `VERSATILES_SSH_IDENTITY` is not listed here: the versatiles module reads it
 * itself.
 */
export interface Config {
	/** Directory or `sftp://` URL the containers are written to. */
	outputDir: string;
	/** The Mapterhorn PMTiles file to read. */
	sourceUrl: string;
	/** Port of the `npm run dev` preview server. */
	devPort: number;
}

export const DEFAULT_DEV_PORT = 8080;

/** Load `.env` into `process.env` if it exists. Variables already set win. */
export function loadEnvFile(path = ENV_FILE): void {
	if (existsSync(path)) process.loadEnvFile(path);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
	return {
		outputDir: nonEmpty(env.OUTPUT_DIR) ?? DATA_DIR,
		sourceUrl: nonEmpty(env.MAPTERHORN_URL) ?? DEFAULT_SOURCE_URL,
		devPort: parsePort(nonEmpty(env.DEV_PORT)),
	};
}

function parsePort(value: string | undefined): number {
	if (value === undefined) return DEFAULT_DEV_PORT;
	const port = /^\d+$/.test(value) ? Number(value) : NaN;
	if (!(port >= 1 && port <= 65535)) throw new Error(`DEV_PORT needs a port from 1 to 65535, got "${value}"`);
	return port;
}

/**
 * Where a container named `filename` goes inside `outputDir`. Works for local
 * directories and `sftp://` URLs alike, with or without a trailing slash.
 */
export function outputPath(outputDir: string, filename: string): string {
	if (outputDir.includes('://')) return outputDir.replace(/\/*$/, '/') + filename;
	return join(outputDir, filename);
}

function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
