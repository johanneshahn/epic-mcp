import { describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';
import { loadConfig } from '../src/config.js';

const config = () => loadConfig({ chain: 'floonet', cliTimeoutMs: 5000 });

describe('runCli', () => {
  it('captures successful output', async () => {
    const result = await runCli(process.execPath, ['-e', "console.log('hello')"], config());
    expect(result).toMatchObject({ stdout: 'hello\n', code: 0 });
  });

  it('turns a non-zero exit into a redacted error', async () => {
    await expect(
      runCli(process.execPath, ['-e', "console.error('boom'); process.exit(3)"], config()),
    ).rejects.toThrow(/exited with code 3: boom/);
  });

  it('reports missing binaries', async () => {
    await expect(runCli('definitely-not-a-real-binary-xyz', [], config())).rejects.toThrow(
      /not found or is not executable/,
    );
  });
});
