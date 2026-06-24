import { describe, expect, it } from 'vitest';

// Toolchain smoke test — replaced by real engine tests in P1.
describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
