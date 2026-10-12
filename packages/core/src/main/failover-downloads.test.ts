import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPlayChain, type FailoverAttempt } from './failover.js';

const cfg = {
  parallel: 2,
  staggerMs: 0,
  preferredGraceMs: 0,
  maxWaitMs: 5_000,
  duplicateStaggerMs: 0,
};

const after = <T>(ms: number, fn: () => T) =>
  new Promise<T>((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, ms)
  );

describe('runPlayChain with a downloading attempt', () => {
  it('does not race a downloading variant against a debrid link', async () => {
    let downloadStarted = false;
    const attempts: FailoverAttempt[] = [
      {
        label: 'debrid',
        rank: 0,
        resolve: () => after(200, () => 'https://cdn/debrid'),
      },
      {
        label: 'qbittorrent',
        rank: 0,
        downloads: true,
        resolve: () => {
          downloadStarted = true;
          return Promise.resolve('https://qbit/stream');
        },
      },
    ];
    const result = await runPlayChain(attempts, cfg);
    assert.equal(result.url, 'https://cdn/debrid');
    assert.equal(downloadStarted, false);
  });

  it('falls back to the downloading attempt once the others fail', async () => {
    let downloadStarted = false;
    const attempts: FailoverAttempt[] = [
      {
        label: 'debrid',
        rank: 0,
        resolve: () =>
          after(50, () => {
            throw new Error('not cached');
          }),
      },
      {
        label: 'qbittorrent',
        rank: 0,
        downloads: true,
        resolve: () => {
          downloadStarted = true;
          return Promise.resolve('https://qbit/stream');
        },
      },
    ];
    const result = await runPlayChain(attempts, cfg);
    assert.equal(downloadStarted, true);
    assert.equal(result.url, 'https://qbit/stream');
  });

  it('still races attempts that do not download', async () => {
    const started: string[] = [];
    const attempts: FailoverAttempt[] = [
      {
        label: 'a',
        rank: 0,
        resolve: () => {
          started.push('a');
          return after(200, () => 'https://a');
        },
      },
      {
        label: 'b',
        rank: 0,
        resolve: () => {
          started.push('b');
          return after(10, () => 'https://b');
        },
      },
    ];
    const result = await runPlayChain(attempts, cfg);
    assert.deepEqual(started, ['a', 'b']);
    assert.equal(result.url, 'https://b');
  });
});
