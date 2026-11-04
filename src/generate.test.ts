import { describe, it, expect } from 'vitest';
import type { ProgressData } from '@versatiles/versatiles-rs';
import { createProgressLogger, formatProgress, parseBbox, parseZoom, selectTargets, TARGETS } from './generate.js';

describe('selectTargets', () => {
	it('selects all targets when none are named', () => {
		expect(selectTargets([])).toEqual(['elevation', 'hillshade']);
	});

	it('keeps named targets once each, in the given order', () => {
		expect(selectTargets(['hillshade', 'elevation', 'hillshade'])).toEqual(['hillshade', 'elevation']);
	});

	it('rejects unknown targets', () => {
		expect(() => selectTargets(['contours'])).toThrow('Unknown target: contours');
	});
});

describe('TARGETS', () => {
	it('gives every target its own file name', () => {
		const filenames = Object.values(TARGETS).map((target) => target.filename);
		expect(new Set(filenames).size).toBe(filenames.length);
	});
});

describe('parseBbox', () => {
	it('parses west,south,east,north', () => {
		expect(parseBbox('5.9, 45.8,10.5,47.8')).toEqual([5.9, 45.8, 10.5, 47.8]);
	});

	it.each(['1,2,3', '1,2,3,x', '10,0,5,1', '0,10,1,5'])('rejects "%s"', (value) => {
		expect(() => parseBbox(value)).toThrow('--bbox');
	});
});

describe('parseZoom', () => {
	it('parses an integer zoom level', () => {
		expect(parseZoom('8')).toBe(8);
	});

	it.each(['-1', '31', '1.5', 'x', ''])('rejects "%s"', (value) => {
		expect(() => parseZoom(value)).toThrow('--max-zoom');
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
