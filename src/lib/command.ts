import { execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { which } from './which.js';

const execFileAsync = promisify(execFileCb);

export async function run(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
	const { stdout } = await execFileAsync(command, args, {
		maxBuffer: 50 * 1024 * 1024,
		cwd: options?.cwd,
	});
	return stdout;
}

export async function runWithOutput(
	command: string,
	args: string[],
	options?: { cwd?: string; env?: Record<string, string> },
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options?.cwd,
			env: options?.env ? { ...process.env, ...options.env } : process.env,
			stdio: 'inherit',
		});
		child.on('error', reject);
		child.on('close', (code, signal) => {
			if (code === 0) resolve();
			else if (signal)
				reject(
					new Error(
						`${command} was killed by signal ${signal}` +
							(signal === 'SIGKILL' ? ' (likely out of memory — check `dmesg -T | grep -i oom`)' : ''),
					),
				);
			else reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

export async function verifyDependencies(commands: string[]): Promise<void> {
	const missing: string[] = [];
	for (const cmd of commands) {
		const found = await which(cmd);
		if (!found) missing.push(cmd);
	}
	if (missing.length > 0) {
		throw new Error(`Missing system dependencies: ${missing.join(', ')}`);
	}
}
