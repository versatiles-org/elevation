import { describe, it, expect } from 'vitest';
import { buildPipeline, tmpVariant } from './mapterhorn.js';

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
