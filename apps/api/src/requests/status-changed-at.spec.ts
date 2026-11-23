import {
  statusChangedAt,
  visibleStage,
  type StatusTimes,
} from './status-changed-at.js';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute));

const times: StatusTimes = {
  createdAt: at(0),
  respondedAt: at(10),
  decidedAt: at(40),
  latestRun: { createdAt: at(10), endedAt: at(20) },
};

describe('visibleStage', () => {
  it('follows the status for automated review and decisions', () => {
    expect(visibleStage('UNDER_AUTOMATED_REVIEW', false)).toBe(
      'automatedReview',
    );
    // A request under automated review is never flagged (Sprint 3 §3.1).
    expect(visibleStage('UNDER_AUTOMATED_REVIEW', true)).toBe(
      'automatedReview',
    );
    expect(visibleStage('APPROVED', false)).toBe('decided');
    expect(visibleStage('REJECTED', true)).toBe('decided');
  });

  it('shows a responded request under review only when the caller is told so', () => {
    expect(visibleStage('PROVIDER_RESPONDED', true)).toBe('underReview');
    expect(visibleStage('PROVIDER_RESPONDED', false)).toBe('responded');
  });

  it('keeps a pending request awaiting', () => {
    expect(visibleStage('AWAITING_PROVIDER_RESPONSE', false)).toBe('awaiting');
  });
});

describe('statusChangedAt', () => {
  it('is the creation time while awaiting a response', () => {
    expect(statusChangedAt('awaiting', times)).toEqual(at(0));
  });

  it("is the latest run's creation, not its start, under automated review", () => {
    expect(
      statusChangedAt('automatedReview', {
        ...times,
        latestRun: { createdAt: at(30), endedAt: null },
      }),
    ).toEqual(at(30));
  });

  it('is the end of the latest run once a run flagged the request', () => {
    expect(statusChangedAt('underReview', times)).toEqual(at(20));
  });

  it("moves to the end of a correction's run", () => {
    expect(
      statusChangedAt('underReview', {
        ...times,
        decidedAt: null,
        latestRun: { createdAt: at(50), endedAt: at(55) },
      }),
    ).toEqual(at(55));
  });

  it('is the response time for a request flagged before Sprint 3', () => {
    expect(
      statusChangedAt('underReview', { ...times, latestRun: null }),
    ).toEqual(at(10));
  });

  it('is the response time for a responded request', () => {
    expect(statusChangedAt('responded', { ...times, latestRun: null })).toEqual(
      at(10),
    );
  });

  it('is the decision time once decided', () => {
    expect(statusChangedAt('decided', times)).toEqual(at(40));
  });
});
