import { describe, expect, it } from 'vitest';

import {
  canonicaliseSkill,
  canonicaliseSkills,
  extractSkills,
  getSkill,
  SKILL_CATEGORIES,
  SKILLS,
  skillKey,
} from './skills';

const names = (text: string) => extractSkills(text).map((s) => s.canonical);

describe('taxonomy data', () => {
  it('has at least 420 skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(420);
  });

  it('covers every category with at least 3 skills', () => {
    for (const category of SKILL_CATEGORIES) {
      const count = SKILLS.filter((s) => s.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(3);
    }
  });

  it('only uses known categories', () => {
    for (const skill of SKILLS) expect(SKILL_CATEGORIES).toContain(skill.category);
  });

  it('has unique canonical names', () => {
    const seen = new Set<string>();
    for (const skill of SKILLS) {
      expect(seen.has(skill.name.toLowerCase()), skill.name).toBe(false);
      seen.add(skill.name.toLowerCase());
    }
  });

  it('maps every name and alias key to exactly one canonical (no skillKey collisions)', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const skill of SKILLS) {
      for (const term of [skill.name, ...skill.aliases]) {
        const key = skillKey(term);
        expect(key, `${skill.name}: "${term}"`).not.toBe('');
        const existing = owner.get(key);
        if (existing && existing !== skill.name) {
          collisions.push(`${term} → ${existing} / ${skill.name}`);
        }
        owner.set(key, skill.name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('resolves every alias back to its own canonical', () => {
    for (const skill of SKILLS) {
      for (const alias of skill.aliases) expect(canonicaliseSkill(alias), alias).toBe(skill.name);
      expect(canonicaliseSkill(skill.name)).toBe(skill.name);
    }
  });

  it('exposes frozen definitions', () => {
    expect(Object.isFrozen(SKILLS)).toBe(true);
    expect(Object.isFrozen(SKILLS[0])).toBe(true);
  });
});

describe('skillKey', () => {
  it.each([
    ['Node.js', 'nodejs'],
    ['node js', 'nodejs'],
    ['  NodeJS ', 'nodejs'],
    ['C++', 'c++'],
    ['C#', 'c#'],
    ['.NET', 'net'],
    ['ASP.NET', 'aspnet'],
    ['CI/CD', 'cicd'],
    ['react-native', 'reactnative'],
    ['Ｒｅａｃｔ', 'react'],
  ])('%s → %s', (input, key) => {
    expect(skillKey(input)).toBe(key);
  });

  it('keeps C, C++ and C# distinct', () => {
    expect(new Set([skillKey('C'), skillKey('C++'), skillKey('C#')]).size).toBe(3);
  });
});

describe('canonicaliseSkill', () => {
  it.each([
    ['JS', 'JavaScript'],
    ['Javascript', 'JavaScript'],
    ['ECMAScript', 'JavaScript'],
    ['es6', 'JavaScript'],
    ['k8s', 'Kubernetes'],
    ['ML', 'Machine Learning'],
    ['ml', 'Machine Learning'],
    ['NLP', 'Natural Language Processing'],
    ['golang', 'Go'],
    ['go', 'Go'],
    ['reactjs', 'React'],
    ['React.js', 'React'],
    ['c', 'C'],
    ['cpp', 'C++'],
    ['c sharp', 'C#'],
    ['Postgres', 'PostgreSQL'],
    ['nodejs', 'Node.js'],
    ['node js', 'Node.js'],
    ['GCP', 'Google Cloud'],
    ['Amazon Web Services', 'AWS'],
    ['sklearn', 'scikit-learn'],
    ['dotnet', '.NET'],
    ['asp.net core', 'ASP.NET'],
    ['ci cd', 'CI/CD'],
    ['Financial Modeling', 'Financial Modelling'],
    ['MS Excel', 'Excel'],
    ['search engine optimisation', 'SEO'],
    ['oops', 'Object-Oriented Programming'],
    ['DSA', 'Data Structures and Algorithms'],
  ])('%s → %s', (input, canonical) => {
    expect(canonicaliseSkill(input)).toBe(canonical);
  });

  it.each(['unknown thing', '', '   ', 'CV', 'TF'])('returns null for %j', (input) => {
    expect(canonicaliseSkill(input)).toBeNull();
  });
});

describe('canonicaliseSkills', () => {
  it('canonicalises, keeps unknown inputs trimmed, dedupes case-insensitively in order', () => {
    expect(
      canonicaliseSkills([
        'js',
        ' JavaScript ',
        'k8s',
        '',
        '  ',
        'Quantum Basket Weaving',
        'quantum basket weaving',
        'React',
      ]),
    ).toEqual(['JavaScript', 'Kubernetes', 'Quantum Basket Weaving', 'React']);
  });

  it('returns an empty array for empty input', () => {
    expect(canonicaliseSkills([])).toEqual([]);
  });
});

describe('getSkill', () => {
  it('returns the definition by name or alias', () => {
    expect(getSkill('k8s')).toMatchObject({ name: 'Kubernetes', category: 'devops' });
    expect(getSkill('Figma')?.category).toBe('design');
    expect(getSkill('Public Speaking')?.category).toBe('soft');
  });

  it('returns undefined for unknown skills', () => {
    expect(getSkill('definitely not a skill')).toBeUndefined();
  });
});

describe('extractSkills: positives', () => {
  it.each([
    ['Strong JS and TypeScript', ['JavaScript', 'TypeScript']],
    ['Experience with C++ and C#', ['C#', 'C++']],
    ['We use .NET and ASP.NET Core', ['.NET', 'ASP.NET']],
    ['Built APIs with Node.js.', ['Node.js']],
    ['Built APIs with nodejs, Express and MongoDB', ['Express', 'MongoDB', 'Node.js']],
    ['Familiar with node js', ['Node.js']],
    ['CI/CD pipelines on GitHub Actions', ['CI/CD', 'GitHub Actions']],
    ['react-native and React Native apps', ['React Native']],
    ['Deployed on k8s', ['Kubernetes']],
    ['Knowledge of ML and NLP', ['Machine Learning', 'Natural Language Processing']],
    ['AI/ML enthusiast', ['Artificial Intelligence', 'Machine Learning']],
    ['Programming in C, Python and Go.', ['C', 'Go', 'Python']],
    ['Skills: Go, Rust', ['Go', 'Rust']],
    ['Go developer with golang microservices', ['Go', 'Microservices']],
    ['Statistical work in R and RStudio', ['R']],
    ['Proficient in R.', ['R']],
    ['Objective-C and Swift for iOS', ['iOS', 'Objective-C', 'Swift']],
    ['Google Cloud Platform (GCP) and AWS', ['AWS', 'Google Cloud']],
    ['Advanced Excel and PowerPoint', ['Excel', 'PowerPoint']],
    ['Excel, Word', ['Excel']],
    ['Spring Boot microservices in Java', ['Java', 'Microservices', 'Spring Boot']],
    ['Java/Spring developer', ['Java', 'Spring']],
    ['Big data with Apache Spark and PySpark', ['Apache Spark', 'Big Data', 'PySpark']],
    ['Ruby on Rails and Ruby', ['Ruby', 'Ruby on Rails']],
    ['HTML/CSS, Tailwind CSS', ['CSS', 'HTML', 'Tailwind CSS']],
    ['PostgreSQL, MySQL, SQL and NoSQL', ['MySQL', 'NoSQL', 'PostgreSQL', 'SQL']],
    ['PL/SQL and T-SQL', ['PL/SQL', 'T-SQL']],
    [
      'Generative AI with LLMs and RAG',
      ['Generative AI', 'Large Language Models', 'Retrieval-Augmented Generation'],
    ],
    ['UI/UX design in Figma', ['Figma', 'UI Design', 'UX Design']],
    ['Go-to-market and pricing strategy', ['Go-to-Market Strategy', 'Pricing Strategy']],
    [
      'Financial modelling, DCF and M&A',
      ['DCF Analysis', 'Financial Modelling', 'Mergers and Acquisitions'],
    ],
    ['Public speaking and teamwork', ['Public Speaking', 'Teamwork']],
    ['Ｐｙｔｈｏｎ and “React”', ['Python', 'React']],
    ['machine\nlearning', ['Machine Learning']],
  ])('%j → %j', (text, expected) => {
    expect(names(text).sort()).toEqual([...expected].sort());
  });
});

describe('extractSkills: false positives', () => {
  it.each([
    'Feel free to go to the office',
    'Go ahead and apply. Go beyond expectations.',
    'Go to the careers page',
    'We are ready to Go',
    'Ability to react to feedback quickly',
    'Teams that React quickly to change',
    'Report to the C-suite and C-level executives',
    'Strong R&D background',
    'Excel at communication',
    'You will excel in this role',
    'Excel in a fast-paced team',
    'Plan C, Section C, Type-C port, Vitamin C, Series C funding',
    'Students in grade R',
    'swift delivery of rust belt projects',
    'Express your interest',
    'Spring 2027 internship, this Spring semester',
    'Sketch out ideas',
    'the Notion of ownership',
    'Unity in diversity',
    'a sense of unity and purpose',
    'Built in node.jsx files',
    'USB Type C charger and C-level buy-in',
    'Ask R. K. Sharma',
  ])('%j yields nothing ambiguous', (text) => {
    const found = names(text);
    for (const ambiguous of [
      'Go',
      'React',
      'C',
      'R',
      'Excel',
      'Swift',
      'Rust',
      'Express',
      'Spring',
      'Sketch',
      'Notion',
      'Unity',
      'JavaScript',
      'Node.js',
    ]) {
      expect(found, `${text} → ${ambiguous}`).not.toContain(ambiguous);
    }
  });

  it('does not yield .NET from asp.net, or JavaScript from node.js', () => {
    expect(names('ASP.NET MVC')).toEqual(['ASP.NET']);
    expect(names('node.js only')).toEqual(['Node.js']);
    expect(names('ASP.NET and .NET')).toEqual(['.NET', 'ASP.NET'].sort());
  });

  it('does not match C inside C++/C# or Java inside JavaScript', () => {
    expect(names('C++')).toEqual(['C++']);
    expect(names('C#')).toEqual(['C#']);
    expect(names('JavaScript')).toEqual(['JavaScript']);
  });

  it('allows Go at a sentence start only when it reads as the language', () => {
    expect(names('Go developers wanted.')).toEqual(['Go']);
    expect(names('Go, Python, Rust')).toContain('Go');
    expect(names('Go the extra mile.')).toEqual([]);
  });
});

describe('extractSkills: longest match, counts and ordering', () => {
  it('prefers the longest alias at a position', () => {
    expect(names('React Native')).toEqual(['React Native']);
    expect(names('Google Cloud Platform')).toEqual(['Google Cloud']);
    expect(names('Spring Boot')).toEqual(['Spring Boot']);
    expect(names('Tailwind CSS')).toEqual(['Tailwind CSS']);
  });

  it('counts every occurrence across aliases and reports the first alias seen', () => {
    const result = extractSkills('JS is great. I love JavaScript. js js. Kubernetes and k8s.');
    expect(result[0]).toEqual({ canonical: 'JavaScript', matchedAlias: 'js', count: 4 });
    expect(result[1]).toEqual({ canonical: 'Kubernetes', matchedAlias: 'Kubernetes', count: 2 });
  });

  it('sorts by count desc, then canonical name asc', () => {
    const result = extractSkills('Python, Docker, Python, AWS, Docker, Python');
    expect(result.map((r) => [r.canonical, r.count])).toEqual([
      ['Python', 3],
      ['Docker', 2],
      ['AWS', 1],
    ]);
  });

  it('reports case-sensitive aliases as defined', () => {
    expect(extractSkills('Experience with ML pipelines')).toEqual([
      { canonical: 'Machine Learning', matchedAlias: 'ML', count: 1 },
    ]);
  });
});

describe('extractSkills: edge cases', () => {
  it.each(['', '   ', '\n\t'])('returns [] for blank text %j', (text) => {
    expect(extractSkills(text)).toEqual([]);
  });

  it('handles emoji and non-Latin text', () => {
    expect(names('🚀 React + TypeScript 💯 developer')).toEqual(['React', 'TypeScript']);
    expect(names('पायथन डेवलपर ✨ — Python')).toEqual(['Python']);
  });

  it('returns stable results across repeated calls', () => {
    const text = 'Docker and Kubernetes on AWS';
    expect(extractSkills(text)).toEqual(extractSkills(text));
  });

  it('extracts from a realistic job description', () => {
    const jd = `About the role: You'll build our analytics platform with Python, pandas and SQL.
      Requirements: 2+ years with Apache Airflow, dbt, Snowflake and Tableau; strong communication skills.
      Nice to have: Docker, Terraform, A/B testing experience.`;
    expect(names(jd).sort()).toEqual(
      [
        'A/B Testing',
        'Apache Airflow',
        'Communication',
        'Docker',
        'Pandas',
        'Python',
        'SQL',
        'Snowflake',
        'Tableau',
        'Terraform',
        'dbt',
      ].sort(),
    );
  });

  it('extracts 20,000 characters in under 150 ms at steady state', () => {
    const paragraph =
      'We are hiring engineers with React, TypeScript, Node.js, PostgreSQL, Docker and Kubernetes. ' +
      'You will work on machine learning pipelines in Python using PyTorch and scikit-learn, ship CI/CD ' +
      'workflows, and collaborate with product managers on A/B testing and roadmaps. ';
    const text = paragraph.repeat(Math.ceil(20_000 / paragraph.length)).slice(0, 20_000);
    // Warm the actual input path so regexp tier-up is not part of the measurement.
    // A median avoids one scheduler pause on shared CI runners without relaxing the budget.
    extractSkills(text);
    const samples = Array.from({ length: 3 }, () => {
      const started = performance.now();
      const result = extractSkills(text);
      const elapsed = performance.now() - started;
      expect(result.length).toBeGreaterThan(10);
      return elapsed;
    }).sort((a, b) => a - b);
    expect(samples[1]).toBeLessThan(150);
  });
});
