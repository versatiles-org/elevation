import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
export const DATA_DIR = join(PROJECT_ROOT, 'data');
