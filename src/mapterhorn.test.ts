import { describe, it, expect } from 'vitest';
import { quantizePipeline, tmpVariant } from './mapterhorn.js';

describe('quantizePipeline', () => {
	it('quantizes to terrarium webp and sets metadata', () => {
		expect(quantizePipeline('https://example.com/a.pmtiles')).toBe(
			[
				"from_container filename='https://example.com/a.pmtiles'",
				"| meta_update name='VersaTiles Elevation' description='VersaTiles Elevation based on Mapterhorn DEM data' schema='dem/terrarium'",
				'| dem_quantize',
				'| raster_format format=webp effort=80',
			].join('\n'),
		);
	});
});

describe('tmpVariant', () => {
	it('prefixes the basename of a path with tmp_', () => {
		expect(tmpVariant('/home/incoming/elevation.versatiles')).toBe('/home/incoming/tmp_elevation.versatiles');
	});

	it('prefixes the basename of an sftp URL with tmp_', () => {
		expect(tmpVariant('sftp://u@host:23/home/incoming/elevation.versatiles')).toBe(
			'sftp://u@host:23/home/incoming/tmp_elevation.versatiles',
		);
	});

	it('handles a bare filename', () => {
		expect(tmpVariant('elevation.versatiles')).toBe('tmp_elevation.versatiles');
	});
});
