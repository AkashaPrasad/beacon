import { describe, expect, it } from 'vitest';

import { buildFollowUpTemplate } from './template';

describe('buildFollowUpTemplate', () => {
  it('fills role, company, applied date and name', () => {
    const t = buildFollowUpTemplate({
      title: 'Platform Engineering Intern',
      company: 'Northwind Labs',
      appliedAt: '2026-10-14T06:00:00.000Z',
      name: 'Aarav Mehta',
      highlight: 'the developer tooling work.',
    });
    expect(t.subject).toBe('Following up on my application — Platform Engineering Intern');
    expect(t.body).toContain('Hi Northwind Labs team,');
    expect(t.body).toContain('I applied for the Platform Engineering Intern role on 14 Oct');
    expect(t.body).toContain("I'm still very interested, especially the developer tooling work.");
    expect(t.body.endsWith('Thanks,\nAarav Mehta')).toBe(true);
    expect(t.text.startsWith('Subject: Following up')).toBe(true);
  });

  it('degrades gracefully without optional fields', () => {
    const t = buildFollowUpTemplate({ title: 'SDE Intern', company: 'Acme', appliedAt: null, contactName: 'Priya' });
    expect(t.body).toContain('Hi Priya,');
    expect(t.body).toContain('I applied for the SDE Intern role and wanted');
    expect(t.body).toContain("I'm still very interested. Happy");
    expect(t.body.endsWith('Thanks,')).toBe(true);
  });
});
