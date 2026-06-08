import { describe, it, expect } from 'vitest';
import { sourceSlug, containerName, quantizePipeline, stackPipeline } from './mapterhorn.js';

const item = (name: string, max_zoom: number) => ({
	name,
	url: `https://download.mapterhorn.com/${name}`,
	md5sum: '',
	size: 0,
	min_zoom: 0,
	max_zoom,
});

describe('sourceSlug / containerName', () => {
	it('strips the .pmtiles suffix', () => {
		expect(sourceSlug(item('planet.pmtiles', 12))).toBe('planet');
		expect(sourceSlug(item('6-0-21.pmtiles', 13))).toBe('6-0-21');
	});

	it('derives a .versatiles container name', () => {
		expect(containerName(item('6-0-21.pmtiles', 13))).toBe('6-0-21.versatiles');
	});
});

describe('quantizePipeline', () => {
	it('reads one source and quantizes to terrarium', () => {
		expect(quantizePipeline('https://example.com/a.pmtiles')).toBe(
			"from_container filename='https://example.com/a.pmtiles' | dem_quantize encoding=terrarium",
		);
	});
});

describe('stackPipeline', () => {
	it('stacks containers high-zoom first and does not re-quantize', () => {
		const items = [item('planet.pmtiles', 12), item('6-0-21.pmtiles', 13)];
		const pipeline = stackPipeline(items, (i) => `/tiles/${containerName(i)}`);

		expect(pipeline).toBe(
			"from_stacked [\n\tfrom_container filename='/tiles/6-0-21.versatiles',\n\tfrom_container filename='/tiles/planet.versatiles'\n]",
		);
		// planet (z12) must come after the z13 patch.
		expect(pipeline.indexOf('6-0-21')).toBeLessThan(pipeline.indexOf('planet'));
		expect(pipeline).not.toContain('dem_quantize');
	});
});
