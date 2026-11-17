import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { EpicWalletClient } from '../adapters/wallet.js';
import { amountArg } from '../adapters/cli.js';
import type { Config } from '../config.js';
import {
  assertSendAmount,
  cliText,
  requireWalletPassword,
} from '../util/output.js';
import { addTool, DESTRUCTIVE, READ, WRITE } from './shared.js';

const sendMethod = z.enum(['http', 'file', 'self', 'keybase', 'emoji', 'epicbox']);
const receiveMethod = z.enum(['file', 'emoji']);

export function registerWalletTools(
  server: McpServer,
  config: Config,
  wallet: EpicWalletClient,
): void {
  addTool(
    server,
    config,
    'wallet_get_info',
    {
      title: 'Wallet summary',
      description: 'Total, immature coinbase, awaiting confirmation, locked and spendable balance.',
      annotations: READ,
    },
    { minConf: z.number().int().positive().optional().describe('Minimum confirmations (default 10)') },
    async ({ minConf }) =>
      cliText(
        await wallet.run('info', minConf === undefined ? [] : ['-c', String(minConf)]),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_get_address',
    {
      title: 'Wallet addresses',
      description: 'Epicbox address, payment proof address and Tor address.',
      annotations: READ,
    },
    {},
    async () => cliText(await wallet.run('address'), config),
  );

  addTool(
    server,
    config,
    'wallet_list_accounts',
    {
      title: 'Wallet accounts',
      description: 'List wallet accounts.',
      annotations: READ,
    },
    {},
    async () => cliText(await wallet.run('account'), config),
  );

  addTool(
    server,
    config,
    'wallet_create_account',
    {
      title: 'Create wallet account',
      description: 'Create a new wallet account with the given name.',
      annotations: WRITE,
    },
    { name: z.string().min(1).describe('Name of the new account') },
    async ({ name }) =>
      cliText(await wallet.run('account', ['-c', name], { mutate: true }), config),
  );

  addTool(
    server,
    config,
    'wallet_list_outputs',
    {
      title: 'Wallet outputs',
      description: 'Raw wallet outputs. Use showFullHistory for spent/overwritten outputs.',
      annotations: READ,
    },
    {
      showFullHistory: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async ({ showFullHistory, limit, offset, sortOrder }) =>
      cliText(
        await wallet.run('outputs', [
          ...(showFullHistory ? ['-f'] : []),
          ...(limit === undefined ? [] : ['-l', String(limit)]),
          ...(offset === undefined ? [] : ['-o', String(offset)]),
          ...(sortOrder ? ['-s', sortOrder] : []),
        ]),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_list_transactions',
    {
      title: 'Wallet transactions',
      description: 'Transaction history, optionally filtered by id or txid.',
      annotations: READ,
    },
    {
      id: z.number().int().nonnegative().optional(),
      txid: z.string().optional(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async ({ id, txid, limit, offset, sortOrder }) =>
      cliText(
        await wallet.run('txs', [
          ...(id === undefined ? [] : ['-i', String(id)]),
          ...(txid ? ['-t', txid] : []),
          ...(limit === undefined ? [] : ['-l', String(limit)]),
          ...(offset === undefined ? [] : ['-o', String(offset)]),
          ...(sortOrder ? ['-s', sortOrder] : []),
        ]),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_scan',
    {
      title: 'Scan / repair wallet',
      description:
        'Checks outputs against the live node and repairs or restores missing outputs.',
      annotations: WRITE,
    },
    {
      startHeight: z.number().int().nonnegative().optional().describe('First block to scan (default 1)'),
      deleteUnconfirmed: z.boolean().optional().describe('Also delete unconfirmed outputs/txs'),
    },
    async ({ startHeight, deleteUnconfirmed }) =>
      cliText(
        await wallet.run('scan', [
          ...(startHeight === undefined ? [] : ['-h', String(startHeight)]),
          ...(deleteUnconfirmed ? ['-d'] : []),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_send',
    {
      title: 'Send EPIC',
      description:
        'Build and send a transaction via http listener, emoji, file, epicbox or self.',
      annotations: WRITE,
    },
    {
      amount: z.number().positive().describe('Amount in EPIC'),
      method: sendMethod.default('http'),
      dest: z.string().optional().describe('http://host:3415 URL or output file name'),
      minConf: z.number().int().positive().optional(),
      selection: z.enum(['all', 'smallest']).default('smallest'),
      changeOutputs: z.number().int().positive().optional(),
      estimateSelection: z.boolean().optional().describe('Only estimate selection strategies'),
      requestPaymentProof: z.boolean().optional(),
      proofAddress: z.string().optional(),
      fluff: z.boolean().optional(),
      message: z.string().optional(),
      storedTx: z.string().optional(),
      ttlBlocks: z.number().int().positive().optional(),
      slateVersion: z.number().int().positive().optional(),
    },
    async (params) => {
      assertSendAmount(params.amount, config, 'wallet_send');
      const cliArgs = [
        amountArg(params.amount),
        '-m', params.method,
        '-s', params.selection,
        ...(params.dest ? ['-d', params.dest] : []),
        ...(params.minConf === undefined ? [] : ['-c', String(params.minConf)]),
        ...(params.changeOutputs === undefined ? [] : ['-o', String(params.changeOutputs)]),
        ...(params.estimateSelection ? ['-e'] : []),
        ...(params.requestPaymentProof ? ['-y'] : []),
        ...(params.proofAddress ? ['-z', params.proofAddress] : []),
        ...(params.fluff ? ['-f'] : []),
        ...(params.message ? ['-g', params.message] : []),
        ...(params.storedTx ? ['-t', params.storedTx] : []),
        ...(params.ttlBlocks === undefined ? [] : ['-b', String(params.ttlBlocks)]),
        ...(params.slateVersion === undefined ? [] : ['-v', String(params.slateVersion)]),
      ];
      return cliText(await wallet.run('send', cliArgs, { mutate: true }), config);
    },
  );

  addTool(
    server,
    config,
    'wallet_receive',
    {
      title: 'Receive EPIC',
      description: 'Process a sender slate from a file or emoji string.',
      annotations: WRITE,
    },
    {
      method: receiveMethod.default('file'),
      input: z.string().describe('Slate file path or emoji string'),
      message: z.string().optional(),
    },
    async ({ method, input, message }) =>
      cliText(
        await wallet.run('receive', [
          '-m', method,
          '-i', input,
          ...(message ? ['-g', message] : []),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_finalize',
    {
      title: 'Finalize transaction',
      description: 'Process the receiver response and broadcast the finalized transaction.',
      annotations: WRITE,
    },
    {
      method: receiveMethod.default('file'),
      input: z.string().describe('Response slate file path or emoji string'),
      fluff: z.boolean().optional(),
      nopost: z.boolean().optional().describe('Do not post the transaction'),
      dest: z.string().optional().describe('Save the finalized slate to this file'),
    },
    async ({ method, input, fluff, nopost, dest }) =>
      cliText(
        await wallet.run('finalize', [
          '-m', method,
          '-i', input,
          ...(fluff ? ['-f'] : []),
          ...(nopost ? ['-n'] : []),
          ...(dest ? ['-d', dest] : []),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_invoice',
    {
      title: 'Create invoice',
      description: 'Initialize an invoice transaction (legacy invoice flow).',
      annotations: WRITE,
    },
    {
      amount: z.number().positive(),
      dest: z.string().optional().describe('Output slate file name'),
      message: z.string().optional(),
      slateVersion: z.number().int().positive().optional(),
    },
    async ({ amount, dest, message, slateVersion }) =>
      cliText(
        await wallet.run('invoice', [
          amountArg(amount),
          ...(dest ? ['-d', dest] : []),
          ...(message ? ['-g', message] : []),
          ...(slateVersion === undefined ? [] : ['-v', String(slateVersion)]),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_issue_invoice',
    {
      title: 'Issue invoice',
      description: 'Issue an invoice to be paid later.',
      annotations: WRITE,
    },
    {
      amount: z.number().positive(),
      message: z.string().optional(),
      dest: z.string().optional(),
      fluff: z.boolean().optional(),
      ttlBlocks: z.number().int().positive().optional(),
      slateVersion: z.number().int().positive().optional(),
    },
    async ({ amount, message, dest, fluff, ttlBlocks, slateVersion }) =>
      cliText(
        await wallet.run('issue_invoice', [
          amountArg(amount),
          ...(message ? ['-g', message] : []),
          ...(dest ? ['-d', dest] : []),
          ...(fluff ? ['-f'] : []),
          ...(ttlBlocks === undefined ? [] : ['-b', String(ttlBlocks)]),
          ...(slateVersion === undefined ? [] : ['-v', String(slateVersion)]),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_pay',
    {
      title: 'Pay invoice',
      description: 'Spend coins to pay a provided invoice slate.',
      annotations: WRITE,
    },
    {
      input: z.string().describe('Invoicer slate file path'),
      method: z.enum(['file', 'http', 'self']).default('file'),
      dest: z.string().optional(),
      message: z.string().optional(),
      minConf: z.number().int().positive().optional(),
      selection: z.enum(['all', 'smallest']).default('all'),
      estimateSelection: z.boolean().optional(),
      ttlBlocks: z.number().int().positive().optional(),
    },
    async (params) =>
      cliText(
        await wallet.run('pay', [
          '-i', params.input,
          '-m', params.method,
          '-s', params.selection,
          ...(params.dest ? ['-d', params.dest] : []),
          ...(params.message ? ['-g', params.message] : []),
          ...(params.minConf === undefined ? [] : ['-c', String(params.minConf)]),
          ...(params.estimateSelection ? ['-e'] : []),
          ...(params.ttlBlocks === undefined ? [] : ['-b', String(params.ttlBlocks)]),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_post',
    {
      title: 'Post transaction',
      description: 'Post a finalized transaction file to the chain.',
      annotations: WRITE,
    },
    { input: z.string().describe('Transaction file'), fluff: z.boolean().optional() },
    async ({ input, fluff }) =>
      cliText(
        await wallet.run('post', ['-i', input, ...(fluff ? ['-f'] : [])], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_repost',
    {
      title: 'Repost transaction',
      description: 'Repost a stored but unconfirmed transaction, or dump it to a file.',
      annotations: WRITE,
    },
    {
      id: z.number().int().nonnegative().optional(),
      dumpfile: z.string().optional(),
      fluff: z.boolean().optional(),
    },
    async ({ id, dumpfile, fluff }) =>
      cliText(
        await wallet.run('repost', [
          ...(id === undefined ? [] : ['-i', String(id)]),
          ...(dumpfile ? ['-m', dumpfile] : []),
          ...(fluff ? ['-f'] : []),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_cancel',
    {
      title: 'Cancel transaction',
      description: 'Cancel a stored transaction and free its locked outputs.',
      annotations: WRITE,
    },
    { id: z.number().int().nonnegative().optional(), txid: z.string().optional() },
    async ({ id, txid }) =>
      cliText(
        await wallet.run('cancel', [
          ...(id === undefined ? [] : ['-i', String(id)]),
          ...(txid ? ['-t', txid] : []),
        ], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_export_proof',
    {
      title: 'Export payment proof',
      description: 'Export a payment proof for a completed transaction.',
      annotations: READ,
    },
    {
      output: z.string().describe('Proof output file'),
      id: z.number().int().nonnegative().optional(),
      txid: z.string().optional(),
    },
    async ({ output, id, txid }) =>
      cliText(
        await wallet.run('export_proof', [
          output,
          ...(id === undefined ? [] : ['-i', String(id)]),
          ...(txid ? ['-t', txid] : []),
        ]),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_verify_proof',
    {
      title: 'Verify payment proof',
      description: 'Verify a payment proof file.',
      annotations: READ,
    },
    { input: z.string().describe('Proof file path') },
    async ({ input }) => cliText(await wallet.run('verify_proof', [input]), config),
  );

  addTool(
    server,
    config,
    'wallet_export_tx',
    {
      title: 'Export transactions',
      description: 'Export transactions to CSV or JSON (handy for accounting).',
      annotations: READ,
    },
    {
      output: z.string().describe('Output file path'),
      all: z.boolean().default(true),
      id: z.number().int().nonnegative().optional(),
      format: z.enum(['csv', 'json']).default('json'),
    },
    async ({ output, all, id, format }) =>
      cliText(
        await wallet.run('export_tx', [
          '-o', output,
          '--format', format,
          ...(all ? ['--all'] : []),
          ...(id === undefined ? [] : ['-i', String(id)]),
        ]),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_import_tx',
    {
      title: 'Import transactions',
      description: 'Import transactions from a CSV or JSON file.',
      annotations: WRITE,
    },
    {
      input: z.string().describe('Input file path'),
      format: z.enum(['csv', 'json']).default('json'),
    },
    async ({ input, format }) =>
      cliText(
        await wallet.run('import_tx', ['-i', input, '--format', format], { mutate: true }),
        config,
      ),
  );

  addTool(
    server,
    config,
    'wallet_change_password',
    {
      title: 'Change wallet password',
      description:
        'Change the wallet password and update the MCP server password in memory. ' +
        'Update EPIC_MCP_WALLET_PASSWORD on disk as well to survive a restart.',
      annotations: DESTRUCTIVE,
    },
    {
      oldPassword: z.string(),
      newPassword: z.string().min(1),
      removeBackup: z.boolean().optional(),
    },
    async ({ oldPassword, newPassword, removeBackup }) => {
      requireWalletPassword(config);
      const result = await wallet.run('change_password', [
        oldPassword,
        newPassword,
        ...(removeBackup ? ['--remove-backup'] : []),
      ], { mutate: true });
      if (result.code === 0) {
        config.walletPassword = newPassword;
        config.secrets = [config.apiSecret, config.walletPassword].filter(
          (value): value is string => Boolean(value),
        );
      }
      return cliText(result, config);
    },
  );
}
