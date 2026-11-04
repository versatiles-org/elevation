import { describe, it, expect } from 'vitest';
import type { ProgressData } from '@versatiles/versatiles-rs';
import { buildPipeline, createProgressLogger, formatProgress } from './mapterhorn.js';

describe('buildPipeline', () => {
	it('reads the source and only updates its metadata', () => {
		expect(buildPipeline('https://example.com/a.pmtiles')).toBe(
			[
				"from_container filename='https://example.com/a.pmtiles'",
				"| meta_update name='Elevation' description='Elevation based on Mapterhorn' schema='dem/terrarium'",
			].join('\n'),
		);
	});
});

const progress: ProgressData = { position: 1234, total: 10000, percentage: 12.34, speed: 56.4 };

describe('formatProgress', () => {
	it('shows percentage, counts and speed', () => {
		expect(formatProgress(progress)).toBe('12.3% (1234/10000 tiles, 56 tiles/s)');
	});

	it('prefixes the current step and appends the ETA when known', () => {
		const eta = Date.UTC(2026, 10, 4, 12);
		const line = formatProgress({ ...progress, message: 'converting', etaTimestamp: eta });
		expect(line).toBe(`converting: 12.3% (1234/10000 tiles, 56 tiles/s, ETA ${new Date(eta).toLocaleString()})`);
	});
});

describe('createProgressLogger', () => {
	it('logs the first update and then at most once per interval', () => {
		const lines: string[] = [];
		let t = 0;
		const onProgress = createProgressLogger(
			(line) => lines.push(line),
			1000,
			() => t,
		);

		onProgress(progress);
		t = 500;
		onProgress(progress);
		t = 1000;
		onProgress(progress);

		expect(lines).toHaveLength(2);
	});
});
