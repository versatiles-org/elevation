import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './config.js';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../..');

describe('config', () => {
	it('DATA_DIR points to data/', () => {
		expect(DATA_DIR).toBe(resolve(PROJECT_ROOT, 'data'));
	});
});
