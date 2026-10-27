import { describe, expect, it } from 'vitest';

import {
  areRolesRelated,
  classifyRole,
  getRoleFamily,
  resolveRoleFamily,
  ROLE_FAMILIES,
  ROLE_GROUPS,
} from './roles';

describe('ROLE_FAMILIES', () => {
  it('has ~60+ unique families across every group', () => {
    expect(ROLE_FAMILIES.length).toBeGreaterThanOrEqual(60);
    const ids = ROLE_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of ROLE_GROUPS) {
      expect(ROLE_FAMILIES.some((f) => f.group === group)).toBe(true);
    }
  });

  it('has symmetric relations that point at real families', () => {
    for (const family of ROLE_FAMILIES) {
      for (const other of family.related) {
        expect(getRoleFamily(other)).toBeDefined();
        expect(getRoleFamily(other)?.related).toContain(family.id);
        expect(other).not.toBe(family.id);
      }
    }
  });
});

describe('classifyRole', () => {
  it.each([
    ['Software Engineer Intern', 'software_engineer'],
    ['SDE-1', 'software_engineer'],
    ['SWE Intern (Summer 2026)', 'software_engineer'],
    ['Senior Frontend Engineer', 'frontend'],
    ['Front-End Developer (React)', 'frontend'],
    ['React Developer', 'frontend'],
    ['Backend Engineer - Payments', 'backend'],
    ['Node.js Engineer', 'backend'],
    ['Full Stack Developer Intern', 'fullstack'],
    ['MERN Stack Developer', 'fullstack'],
    ['Android Developer', 'android'],
    ['iOS Engineer', 'ios'],
    ['Flutter Developer', 'mobile'],
    ['Mobile App Developer', 'mobile'],
    ['Embedded Firmware Engineer', 'embedded'],
    ['Game Developer (Unity)', 'game_dev'],
    ['DevOps Engineer', 'devops'],
    ['Site Reliability Engineer', 'sre'],
    ['Cloud Engineer - AWS', 'cloud'],
    ['Platform Engineer', 'platform'],
    ['Cybersecurity Analyst', 'security'],
    ['Penetration Tester', 'security'],
    ['Network Engineer', 'network'],
    ['IT Support Executive', 'it_support'],
    ['Database Administrator', 'dba'],
    ['QA Automation Engineer', 'qa'],
    ['SDET', 'qa'],
    ['Blockchain Developer', 'blockchain'],
    ['Robotics Engineer Intern', 'robotics'],
    ['VLSI Design Intern', 'hardware'],
    ['Mechanical Design Engineer', 'mechanical'],
    ['Civil Site Engineer', 'civil'],
    ['Solutions Architect', 'solutions_engineer'],
    ['Technical Support Engineer', 'support_engineer'],
    ['Developer Advocate', 'devrel'],
    ['Technical Writer', 'technical_writer'],
    ['Google Summer of Code Contributor', 'open_source'],
    ['Data Scientist', 'data_scientist'],
    ['Data Science Intern', 'data_scientist'],
    ['Data Analyst', 'data_analyst'],
    ['Product Analyst', 'data_analyst'],
    ['Power BI Developer', 'bi_analyst'],
    ['Data Engineer', 'data_engineer'],
    ['Analytics Engineer', 'analytics_engineer'],
    ['Machine Learning Engineer', 'ml_engineer'],
    ['ML Engineer Intern', 'ml_engineer'],
    ['GenAI Developer', 'ml_engineer'],
    ['Software Engineer, Machine Learning', 'ml_engineer'],
    ['MLOps Engineer', 'mlops'],
    ['NLP Engineer', 'nlp'],
    ['Computer Vision Intern', 'computer_vision'],
    ['Research Scientist', 'research_scientist'],
    ['AI Researcher', 'research_scientist'],
    ['Quantitative Analyst', 'quant'],
    ['Actuarial Analyst', 'statistician'],
    ['Product Designer', 'product_designer'],
    ['UI/UX Designer', 'product_designer'],
    ['Product Design Intern', 'product_designer'],
    ['UX Researcher', 'ux_researcher'],
    ['Graphic Designer', 'graphic_designer'],
    ['Motion Designer', 'motion_designer'],
    ['Associate Product Manager', 'product_manager'],
    ['Product Manager Intern', 'product_manager'],
    ['Technical Program Manager', 'program_manager'],
    ['Project Coordinator', 'project_manager'],
    ['Business Analyst', 'business_analyst'],
    ['Strategy Consultant', 'consulting'],
    ["Founder's Office Associate", 'strategy'],
    ['Sales Development Representative', 'sales'],
    ['Business Development Associate', 'business_development'],
    ['Customer Success Manager', 'customer_success'],
    ['Digital Marketing Intern', 'marketing'],
    ['Growth Marketing Lead', 'marketing'],
    ['SEO Specialist', 'growth'],
    ['Content Writer', 'content'],
    ['Social Media Intern', 'social_media'],
    ['Public Relations Associate', 'pr_comms'],
    ['Financial Analyst', 'finance'],
    ['Audit Associate', 'accounting'],
    ['Investment Banking Analyst', 'investment_banking'],
    ['Equity Research Intern', 'investment_banking'],
    ['Risk Analyst', 'risk_compliance'],
    ['Operations Associate', 'operations'],
    ['Supply Chain Analyst', 'supply_chain'],
    ['Talent Acquisition Intern', 'hr'],
    ['Legal Intern', 'legal'],
    ['Summer Research Internship', 'research_assistant'],
    ['PhD Position in Robotics', 'robotics'],
    ['Junior Research Fellow (JRF)', 'research_assistant'],
    ['Teaching Assistant', 'teaching'],
    ['Bioinformatics Intern', 'life_sciences'],
    ['Public Policy Fellow', 'policy'],
    ['Campus Ambassador', 'campus_ambassador'],
    ['Engineering Manager', 'engineering_manager'],
    ['🚀 Backend Engineer 🔥', 'backend'],
  ])('%s → %s', (title, family) => {
    expect(classifyRole(title)?.family).toBe(family);
  });

  it.each(['', '   ', 'Smart City Hackathon 2026', 'Merit Scholarship', '🚀🔥'])(
    'returns null for %j',
    (title) => {
      expect(classifyRole(title)).toBeNull();
    },
  );

  it('reports confidence by specificity', () => {
    expect(classifyRole('Frontend Engineer')?.confidence).toBe(0.9);
    expect(classifyRole('Web Developer')?.confidence).toBe(0.75);
    expect(classifyRole('Engineer')).toMatchObject({
      family: 'software_engineer',
      confidence: 0.55,
    });
    expect(classifyRole('Data Science Intern')).toMatchObject({
      label: 'Data Scientist',
      group: 'data',
    });
  });
});

describe('resolveRoleFamily / areRolesRelated', () => {
  it.each([
    ['frontend', 'frontend'],
    ['ml engineer', 'ml_engineer'],
    ['Data-Scientist', 'data_scientist'],
    ['Product Designer (UX/UI)', 'product_designer'],
    ['SDE', 'software_engineer'],
    ['UX designer', 'product_designer'],
    ['   ', null],
    ['Astronaut', null],
  ])('%j → %j', (input, expected) => {
    expect(resolveRoleFamily(input)).toBe(expected);
  });

  it('knows adjacency', () => {
    expect(areRolesRelated('frontend', 'fullstack')).toBe(true);
    expect(areRolesRelated('fullstack', 'frontend')).toBe(true);
    expect(areRolesRelated('ml_engineer', 'data_scientist')).toBe(true);
    expect(areRolesRelated('frontend', 'frontend')).toBe(false);
    expect(areRolesRelated('frontend', 'accounting')).toBe(false);
    expect(areRolesRelated('nope', 'frontend')).toBe(false);
  });
});
