// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('<EmptyState>', () => {
  it('renders the title as a heading, one sentence and the next action', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nothing tracked yet."
        body="Press A on any listing, or drag one here from Deadlines."
        action={<button type="button">Go to Radar</button>}
        secondaryAction={<button type="button">Import</button>}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nothing tracked yet.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Press A on any listing, or drag one here from Deadlines.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Radar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('uses an h2 in the display face for full-page empty states and keeps the icon decorative', () => {
    const { container } = render(<EmptyState variant="page" icon={Inbox} title="All caught up." />);
    const heading = screen.getByRole('heading', { level: 2, name: 'All caught up.' });
    expect(heading.className).toContain('font-display');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-slot="empty-state"]')?.tagName).toBe('SECTION');
  });

  it('honours an explicit heading level and omits the action row without actions', () => {
    const { container } = render(<EmptyState title="No alert rules." headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No alert rules.');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
