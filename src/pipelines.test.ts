import { describe, it, expect } from 'vitest';
import { elevationPipeline, hillshadePipeline, pipelineProblems } from './pipelines.js';

const URL = 'https://example.com/a.pmtiles';

describe('elevationPipeline', () => {
	it('reads the source and only updates its metadata', () => {
		expect(elevationPipeline(URL)).toBe(
			[
				"from_container filename='https://example.com/a.pmtiles'",
				"| meta_update name='Elevation' description='Elevation based on Mapterhorn' schema='dem/terrarium'",
			].join('\n'),
		);
	});
});

describe('hillshadePipeline', () => {
	it('shades the terrarium DEM and encodes it as lossy WebP', () => {
		expect(hillshadePipeline(URL)).toBe(
			[
				"from_container filename='https://example.com/a.pmtiles'",
				'| dem_hillshade encoding=terrarium',
				'| raster_format format=webp quality=70',
				"| meta_update name='Hillshade' description='Hillshade based on Mapterhorn'",
			].join('\n'),
		);
	});
});

describe('pipelineProblems', () => {
	it.each([
		['elevation', elevationPipeline],
		['hillshade', hillshadePipeline],
	])('finds nothing wrong with the %s pipeline', (_, pipeline) => {
		expect(pipelineProblems(pipeline(URL))).toEqual([]);
	});

	it('names the step and property of an unknown parameter', () => {
		const problems = pipelineProblems(`from_container filename='${URL}' | dem_hillshade nonsense=1`);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/^step 2, nonsense: /);
	});

	it('reports VPL that does not parse', () => {
		expect(pipelineProblems('from_container filename=')[0]).toMatch(/^VPL does not parse/);
	});
});
