import { describe, expect, it } from 'vitest';

import { SAMPLE_RESUME_TEXT } from '../test/resume-fixtures.js';

import {
  classifyLink,
  extractEmails,
  extractGradYear,
  extractLinks,
  extractPhones,
  parseEducation,
  parseExperience,
  parseProjects,
  parseResumeText,
  splitSections,
} from './parse.js';

describe('parseResumeText (deterministic)', () => {
  const result = parseResumeText(SAMPLE_RESUME_TEXT);

  it('detects the standard sections', () => {
    expect(result.sections).toEqual(
      expect.arrayContaining(['summary', 'education', 'experience', 'projects', 'skills', 'languages']),
    );
    expect(result.textChars).toBeGreaterThan(500);
  });

  it('extracts canonical skills from the taxonomy', () => {
    const names = result.profile.skills.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['React', 'Node.js', 'TypeScript', 'Python', 'Docker', 'Kubernetes']));
    expect(result.skills[0]!.count).toBeGreaterThanOrEqual(1);
  });

  it('parses education: degree, branch, institution, grad year, GPA', () => {
    const [edu] = result.profile.education;
    expect(edu).toMatchObject({
      institution: 'Indian Institute of Technology Bombay',
      degreeLevel: 'bachelor',
      field: 'Computer Science and Engineering',
      gradYear: 2026,
      startYear: 2022,
      gpa: { value: 8.7, scale: 10 },
    });
    expect(edu!.degree).toContain('B.Tech');
  });

  it('parses experience with dates and bullets', () => {
    const [job] = result.profile.experience;
    expect(job).toMatchObject({ title: 'Software Engineering Intern', company: 'Razorpay', current: false });
    expect(job!.startDate?.toISOString().slice(0, 7)).toBe('2025-05');
    expect(job!.description).toContain('payments dashboard');
    expect(result.profile.experienceYears).toBeGreaterThan(0);
  });

  it('parses projects as title + bullets with skills', () => {
    const names = result.profile.projects.map((p) => p.name);
    expect(names).toEqual(['Beacon Clone', 'Chess Engine']);
    expect(result.profile.projects[0]!.skills).toEqual(expect.arrayContaining(['React', 'MongoDB']));
    expect(result.profile.projects[0]!.description).toContain('ranking engine');
  });

  it('extracts contact details and profile links', () => {
    expect(result.emails).toEqual(['priya.sharma@example.com']);
    expect(result.phones[0]).toContain('98765');
    expect(result.profile.links).toEqual(
      expect.arrayContaining([
        { kind: 'github', url: 'https://github.com/priyasharma' },
        { kind: 'linkedin', url: 'https://linkedin.com/in/priya-sharma' },
        { kind: 'portfolio', url: 'https://priya.dev' },
      ]),
    );
  });

  it('infers headline, role preference and spoken languages', () => {
    expect(result.profile.headline).toBe('Full-stack Developer Intern');
    expect(result.profile.preferredRoles.length).toBeGreaterThan(0);
    expect(result.profile.languages).toEqual([
      { name: 'English', proficiency: 'professional' },
      { name: 'Hindi', proficiency: 'native' },
    ]);
  });

  it('warns when there is no skills section but still finds skills', () => {
    const r = parseResumeText('Rahul\nEducation\nNIT Trichy\nB.E. in Mechanical Engineering\nBatch of 2027\nExperience\nUsed Python and SQL daily');
    expect(r.warnings.join(' ')).toMatch(/No skills section/);
    expect(r.profile.skills.map((s) => s.name)).toEqual(expect.arrayContaining(['Python', 'SQL']));
    expect(r.profile.education[0]).toMatchObject({ gradYear: 2027, degreeLevel: 'bachelor' });
  });

  it('handles non-English / headless resumes gracefully', () => {
    const r = parseResumeText('Curriculum Vitae\nFormación académica\nUniversidad de Madrid 2020 - 2024\nHabilidades: Java, Docker');
    expect(r.warnings.join(' ')).toMatch(/No standard section headings|Graduation year|degree/);
    expect(r.profile.skills.map((s) => s.name)).toEqual(expect.arrayContaining(['Java', 'Docker']));
  });

  it('produces an empty-but-valid profile for empty text', () => {
    const r = parseResumeText('');
    expect(r.profile.skills).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('resume parser pieces', () => {
  it('grad year: markers win (Batch of, Expected, Class of), within 2024-2032', () => {
    expect(extractGradYear('B.Tech, Batch of 2027', '')).toBe(2027);
    expect(extractGradYear('M.Tech (Expected May 2026)', '')).toBe(2026);
    expect(extractGradYear("Class of '28", '')).toBe(2028);
    expect(extractGradYear('Graduation year: 2031', '')).toBe(2031);
    expect(extractGradYear('Expected 2040', '')).toBeNull();
    expect(extractGradYear('2019 - 2023', '')).toBe(2023);
    expect(extractGradYear('Aug 2023 – Present', '')).toBeNull();
    expect(extractGradYear('Some school', 'Expected graduation: 2029')).toBe(2029);
    expect(extractGradYear('graduating 2030 hopefully', '')).toBe(2030);
  });

  it('degree detection covers common Indian and global degrees', () => {
    const cases: [string, string, string][] = [
      ['BE in Electronics and Communication Engineering, 2025', 'BE', 'bachelor'],
      ['BSc Physics (Hons), Delhi University 2026', 'BSc', 'bachelor'],
      ['M.Tech in Data Science, 2027', 'M.Tech', 'master'],
      ['MS in Computer Science (2026)', 'MS', 'master'],
      ['MBA, IIM Ahmedabad, 2025', 'MBA', 'master'],
      ['PhD in Machine Learning, 2028', 'PhD', 'phd'],
      ['Diploma in Civil Engineering 2025', 'Diploma', 'diploma'],
      ['BCA, Christ University, 2026', 'BCA', 'bachelor'],
    ];
    for (const [line, label, level] of cases) {
      const { entries } = parseEducation(['Some University', line], line);
      expect(entries[0], line).toMatchObject({ degreeLevel: level });
      expect(entries[0]!.degree, line).toContain(label);
    }
    expect(parseEducation(['B.Tech (CSE), VIT Vellore', '2022 - 2026'], '').entries[0]!.field).toBe(
      'Computer Science and Engineering',
    );
  });

  it('education without a year or degree produces warnings, not entries', () => {
    expect(parseEducation(['Some University', 'B.Tech'], '').warnings.join(' ')).toMatch(/Graduation year/);
    expect(parseEducation(['Some University'], '').warnings.join(' ')).toMatch(/degree/);
  });

  it('experience handles "Company | Title" and current roles', () => {
    const { entries } = parseExperience([
      'Google | Software Engineer',
      'Jan 2024 - Present',
      '- Worked on Search',
      'Data Analyst, Flipkart  06/2023 - 08/2023',
    ]);
    expect(entries[0]).toMatchObject({ company: 'Google', title: 'Software Engineer', current: true, endDate: null });
    expect(entries[1]).toMatchObject({ title: 'Data Analyst', company: 'Flipkart' });
  });

  it('projects: bullets attach to the preceding title; URLs are captured', () => {
    const projects = parseProjects([
      'Portfolio Site - https://me.dev',
      '* Built with Next.js',
      '1. Lighthouse 100',
    ]);
    expect(projects[0]).toMatchObject({ name: 'Portfolio Site', url: 'https://me.dev' });
    expect(projects[0]!.description).toContain('Lighthouse');
  });

  it('sections split on headings and inline "Skills:" lines', () => {
    const { sections, header } = splitSections('Name\nSKILLS: Go, Rust\nEducation:\nIIT');
    expect(header).toEqual(['Name']);
    expect(sections.get('skills')).toEqual(['Go, Rust']);
    expect(sections.get('education')).toEqual(['IIT']);
  });

  it('links, emails and phones', () => {
    expect(classifyLink(new URL('https://leetcode.com/u/x'))).toBe('leetcode');
    expect(classifyLink(new URL('https://scholar.google.com/citations?user=1'))).toBe('scholar');
    expect(classifyLink(new URL('https://kaggle.com/x'))).toBe('kaggle');
    expect(classifyLink(new URL('https://devpost.com/x'))).toBe('devpost');
    expect(classifyLink(new URL('https://gitlab.com/x'))).toBe('other');
    expect(classifyLink(new URL('https://example.org'))).toBeNull();
    const links = extractLinks('see github.com/a/repo and www.linkedin.com/feed and https://x.github.io', '');
    expect(links).toEqual([
      { kind: 'github', url: 'https://github.com/a' },
      { kind: 'portfolio', url: 'https://x.github.io' },
    ]);
    expect(extractEmails('A@B.co and a@b.co')).toEqual(['a@b.co']);
    expect(extractPhones('2021 - 2025 and +1 (415) 555-0100')).toEqual(['+1 (415) 555-0100']);
  });
});
