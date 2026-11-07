import { isFlagged } from './flag-reasons.js';

describe('isFlagged', () => {
  it('needs at least one reason', () => {
    expect(isFlagged('PROVIDER_RESPONDED', 0)).toBe(false);
    expect(isFlagged('PROVIDER_RESPONDED', 1)).toBe(true);
    expect(isFlagged('PROVIDER_RESPONDED', 2)).toBe(true);
  });

  it('does not depend on the provider having responded', () => {
    expect(isFlagged('AWAITING_PROVIDER_RESPONSE', 1)).toBe(true);
  });

  it('ends with a decision', () => {
    expect(isFlagged('APPROVED', 1)).toBe(false);
    expect(isFlagged('REJECTED', 1)).toBe(false);
  });
});
