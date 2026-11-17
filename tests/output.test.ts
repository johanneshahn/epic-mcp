import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  assertNotReadOnly,
  assertSendAmount,
  redact,
  requireWalletPassword,
  truncate,
} from '../src/util/output.js';

const config = () =>
  loadConfig({
    chain: 'floonet',
    apiSecret: 'topsecret',
    walletPassword: 'hunter2',
    maxSendAmount: 100,
    maxOutputChars: 50,
  });

describe('redact', () => {
  it('removes configured secrets and sensitive lines', () => {
    const text = 'secret=topsecret\nPassword: hunter2\nYour recovery phrase is foo bar\nheight 42';
    expect(redact(text, config())).toBe('secret=[REDACTED]\nheight 42');
  });

  it('leaves normal output untouched', () => {
    expect(redact('Chain height: 42', config())).toBe('Chain height: 42');
  });
});

describe('truncate', () => {
  it('adds a truncation marker', () => {
    expect(truncate('abcdefghij', 5)).toContain('[truncated: 5 more characters]');
  });
});

describe('guards', () => {
  it('enforces a maximum send amount', () => {
    expect(() => assertSendAmount(10, config(), 'wallet_send')).not.toThrow();
    expect(() => assertSendAmount(101, config(), 'wallet_send')).toThrow(/exceeds/);
    expect(() => assertSendAmount(-1, config(), 'wallet_send')).toThrow(/positive/);
  });

  it('requires a password and honours read-only mode', () => {
    expect(() => requireWalletPassword(loadConfig({ chain: 'floonet' }))).toThrow(/PASSWORD/);
    expect(() => assertNotReadOnly(loadConfig({ chain: 'floonet', readOnly: true }))).toThrow(
      /READ_ONLY/,
    );
  });
});
