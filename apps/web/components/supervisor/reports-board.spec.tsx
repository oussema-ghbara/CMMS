/**
 * DuplicateSubmissionBadge renders the duplicate-warning indicator used by the reports board.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DuplicateSubmissionBadge } from './reports-board';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('DuplicateSubmissionBadge', () => {
  it('renders the warning badge when the report was submitted despite the warning', () => {
    const markup = renderToStaticMarkup(<DuplicateSubmissionBadge submittedDespiteWarning />);

    expect(markup).toContain('supervisorReports.labels.submittedDespiteWarning');
  });

  it('renders nothing when the warning flag is false', () => {
    const markup = renderToStaticMarkup(<DuplicateSubmissionBadge submittedDespiteWarning={false} />);

    expect(markup).toBe('');
  });
});