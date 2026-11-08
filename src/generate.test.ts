import { describe, it, expect } from 'vitest';
import type { ProgressData } from '@versatiles/versatiles-rs';
import {
	createProgressLogger,
	formatDuration,
	formatProgress,
	parseBbox,
	parseZoom,
	selectTargets,
	TARGETS,
} from './generate.js';

describe('TARGETS', () => {
	it('names each container after its tileset, ending with the format', () => {
		// download.versatiles.org and tiles.versatiles.org know the tilesets by these names.
		expect(Object.values(TARGETS).map((target) => target.filename)).toEqual([
			'elevation-raster.versatiles',
			'hillshade-raster.versatiles',
		]);
	});
});

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

	it('prefixes the current step and appends the time left when known', () => {
		const eta = Date.UTC(2026, 10, 4, 12);
		const now = eta - (3 * 60 + 23) * 60000;
		const line = formatProgress({ ...progress, message: 'converting', etaTimestamp: eta }, now);
		expect(line).toBe('converting: 12.3% (1234/10000 tiles, 56 tiles/s, finished in 3h23m)');
	});
});

describe('formatDuration', () => {
	it('shows hours and zero-padded minutes', () => {
		expect(formatDuration(65 * 60000)).toBe('1h05m');
		expect(formatDuration((98 * 60 + 30) * 60000)).toBe('98h30m');
	});

	it('leaves out the hours under an hour', () => {
		expect(formatDuration(45 * 60000)).toBe('45m');
	});

	it('rounds up to the minute', () => {
		expect(formatDuration(1_000)).toBe('1m');
		expect(formatDuration(59 * 60000 + 1_000)).toBe('1h00m');
	});

	it('shows an ETA in the past as 0m', () => {
		expect(formatDuration(-90_000)).toBe('0m');
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
