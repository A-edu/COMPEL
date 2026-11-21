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

  // Sprint 3 spec §3.1: no officer can decide a request mid-run, even one
  // that already carries an objection.
  it('never holds while a pipeline run is in progress', () => {
    expect(isFlagged('UNDER_AUTOMATED_REVIEW', 1)).toBe(false);
    expect(isFlagged('UNDER_AUTOMATED_REVIEW', 2)).toBe(false);
  });
});
