import type { Config } from '../config.js';
import { assertNotReadOnly, requireWalletPassword } from '../util/output.js';
import { args, runCli } from './cli.js';

/** Thin wrapper around the epic-wallet CLI. Uses argument arrays, never a shell. */
export class EpicWalletClient {
  constructor(private readonly config: Config) {}

  private globalArgs(extra: string[] = []): string[] {
    return args(
      this.config.chainFlag,
      this.config.walletCurrentDir && ['-c', this.config.walletCurrentDir],
      this.config.walletDir && ['-t', this.config.walletDir],
      this.config.walletPassword && ['-p', this.config.walletPassword],
      ['-a', this.config.walletAccount],
      this.config.walletNodeUrl && ['-r', this.config.walletNodeUrl],
      extra,
    );
  }

  async run(
    subcommand: string,
    subArgs: string[] = [],
    options: { mutate?: boolean; extraGlobals?: string[] } = {},
  ) {
    if (options.mutate) assertNotReadOnly(this.config);
    requireWalletPassword(this.config);
    return runCli(
      this.config.walletBin,
      [...this.globalArgs(options.extraGlobals), subcommand, ...subArgs],
      this.config,
    );
  }
}
