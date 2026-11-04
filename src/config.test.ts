import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, DEFAULT_SOURCE_URL, loadEnvFile, outputPath, readConfig } from './config.js';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../..');

describe('DATA_DIR', () => {
	it('points to data/', () => {
		expect(DATA_DIR).toBe(resolve(PROJECT_ROOT, 'data'));
	});
});

describe('readConfig', () => {
	it('defaults to data/ and the Mapterhorn planet file', () => {
		expect(readConfig({})).toEqual({ outputDir: DATA_DIR, sourceUrl: DEFAULT_SOURCE_URL });
	});

	it('treats blank values as unset', () => {
		expect(readConfig({ OUTPUT_DIR: ' ', MAPTERHORN_URL: '' })).toEqual(readConfig({}));
	});

	it('reads OUTPUT_DIR and MAPTERHORN_URL', () => {
		expect(readConfig({ OUTPUT_DIR: 'sftp://u@host:23/in/', MAPTERHORN_URL: 'https://example.com/a.pmtiles' })).toEqual(
			{ outputDir: 'sftp://u@host:23/in/', sourceUrl: 'https://example.com/a.pmtiles' },
		);
	});
});

describe('loadEnvFile', () => {
	it('sets variables from the file without overriding existing ones', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'elevation-env-'));
		const file = join(dir, '.env');
		await writeFile(file, 'ELEVATION_TEST_A=from-file\nELEVATION_TEST_B=from-file\n');
		process.env.ELEVATION_TEST_B = 'already-set';

		loadEnvFile(file);

		expect(process.env.ELEVATION_TEST_A).toBe('from-file');
		expect(process.env.ELEVATION_TEST_B).toBe('already-set');
		delete process.env.ELEVATION_TEST_A;
		delete process.env.ELEVATION_TEST_B;
	});

	it('does nothing when the file is missing', () => {
		expect(() => {
			loadEnvFile('/nonexistent/.env');
		}).not.toThrow();
	});
});

describe('outputPath', () => {
	it('joins local directories', () => {
		expect(outputPath('/data', 'elevation.versatiles')).toBe('/data/elevation.versatiles');
	});

	it('appends to sftp URLs with or without a trailing slash', () => {
		expect(outputPath('sftp://u@host:23/in', 'e.versatiles')).toBe('sftp://u@host:23/in/e.versatiles');
		expect(outputPath('sftp://u@host:23/in/', 'e.versatiles')).toBe('sftp://u@host:23/in/e.versatiles');
	});
});
