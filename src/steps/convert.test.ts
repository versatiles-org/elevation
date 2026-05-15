import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../lib/command.js', () => ({
	runWithOutput: vi.fn(async () => undefined),
}));

import { runWithOutput } from '../lib/command.js';
import type { SourceConfig } from '../lib/source.js';

const makeSource = (): SourceConfig => ({
	name: 'Test',
	slug: 'test-source',
	license: 'MIT',
	url: 'https://example.com',
	date: '2024',
	type: 'copernicus-s3',
	config: {
		bucket: 'test',
		region: 'eu-central-1',
		tileListUrl: 'https://example.com/tileList.txt',
		tileUrlPattern: 'https://example.com/{name}/{name}.tif',
	},
});

describe('stepConvert', () => {
	let tempDir: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		tempDir = await mkdtemp(join(tmpdir(), 'convert-test-'));
		await mkdir(join(tempDir, 'test-source'), { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	it('writes pipeline file and runs versatiles convert', async () => {
		vi.doMock('../config.js', () => ({
			sourceDataDir: (slug: string) => join(tempDir, slug),
			sourceVrtPath: (slug: string) => join(tempDir, slug, 'dem.vrt'),
			sourceVersatilesPath: (slug: string) => join(tempDir, slug, `${slug}.versatiles`),
		}));

		const { stepConvert } = await import('./convert.js');
		await stepConvert(makeSource());

		expect(runWithOutput).toHaveBeenCalledWith('versatiles', [
			'--cache-dir',
			'/home/tmp',
			'convert',
			expect.stringContaining(`from_gdal_dem filename='${join(tempDir, 'test-source', 'dem.vrt')}'`),
			join(tempDir, 'test-source', 'test-source.versatiles'),
		]);
	});
});
