/**
 * Role taxonomy: 76 role families with title patterns. `classifyRole(title)` picks
 * the family whose most specific pattern matches (highest weight wins; ties go to
 * the family defined first). Used for SPEC §4 role alignment and feed filters.
 */

export const ROLE_GROUPS = [
  'engineering',
  'data',
  'design',
  'product',
  'business',
  'research',
  'other',
] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

/** Public view of a role family. */
export interface RoleFamily {
  id: string;
  label: string;
  group: RoleGroup;
  /** Families considered adjacent for role alignment (symmetric). */
  related: readonly string[];
}

export interface RoleMatch {
  family: string;
  label: string;
  group: RoleGroup;
  /** 0..1: 0.9 specific title pattern, 0.75 strong keyword, 0.55 generic keyword. */
  confidence: number;
}

type Pattern = readonly [RegExp, number];

interface RoleFamilyDef {
  id: string;
  label: string;
  group: RoleGroup;
  patterns: readonly Pattern[];
  related?: readonly string[];
}

const DEFS: readonly RoleFamilyDef[] = [
  // ── Engineering ────────────────────────────────────────────────────────────
  {
    id: 'software_engineer',
    label: 'Software Engineer',
    group: 'engineering',
    patterns: [
      [/\bsoftware (engineer|developer|development engineer|engineering)\b/, 6],
      [/\b(software|solution|enterprise|technical) architect\b/, 6],
      [
        /\b(application|applications|java|python|c#|golang|go|ruby|php|\.net|dotnet) developer\b/,
        5,
      ],
      [/\b(developer|programmer|coder)\b/, 3],
      [/\bengineer(ing)?\b/, 1],
    ],
    related: [
      'frontend',
      'backend',
      'fullstack',
      'mobile',
      'systems',
      'platform',
      'embedded',
      'game_dev',
      'qa',
      'open_source',
      'devops',
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend Engineer',
    group: 'engineering',
    patterns: [
      [/\bfrontend\b/, 8],
      [/\b(react|reactjs|angular|vue|vuejs|ui|javascript|typescript) (developer|engineer)\b/, 8],
      [/\bweb (developer|engineer|development)\b/, 5],
    ],
    related: ['fullstack', 'mobile', 'product_designer'],
  },
  {
    id: 'backend',
    label: 'Backend Engineer',
    group: 'engineering',
    patterns: [
      [/\bbackend\b/, 8],
      [/\b(api|server side|microservices?) (engineer|developer)\b/, 7],
      [
        /\b(java|golang|go|python|node|nodejs|ruby|rails|php|django|spring|\.net|dotnet|scala|elixir) (backend )?(engineer)\b/,
        6,
      ],
    ],
    related: ['fullstack', 'platform', 'data_engineer', 'cloud', 'dba', 'blockchain'],
  },
  {
    id: 'fullstack',
    label: 'Full-stack Engineer',
    group: 'engineering',
    patterns: [
      [/\bfullstack\b/, 9],
      [/\b(mern|mean|lamp|t3) (stack )?(developer|engineer)?\b/, 9],
    ],
    related: ['frontend', 'backend'],
  },
  {
    id: 'mobile',
    label: 'Mobile Engineer',
    group: 'engineering',
    patterns: [
      [/\bmobile (app |application )?(engineer|developer|development)\b/, 8],
      [/\b(flutter|react native|kotlin multiplatform|xamarin|ionic) (developer|engineer)\b/, 8],
      [/\bapp developer\b/, 6],
    ],
    related: ['android', 'ios', 'frontend'],
  },
  {
    id: 'android',
    label: 'Android Engineer',
    group: 'engineering',
    patterns: [
      [/\bandroid\b/, 9],
      [/\bkotlin (developer|engineer)\b/, 8],
    ],
    related: ['mobile', 'ios'],
  },
  {
    id: 'ios',
    label: 'iOS Engineer',
    group: 'engineering',
    patterns: [
      [/\bios\b/, 9],
      [/\bswift(ui)? (developer|engineer)\b/, 8],
    ],
    related: ['mobile', 'android'],
  },
  {
    id: 'embedded',
    label: 'Embedded / Firmware Engineer',
    group: 'engineering',
    patterns: [
      [/\b(embedded|firmware)\b/, 8],
      [/\b(iot|microcontroller|rtos) (engineer|developer)\b/, 8],
    ],
    related: ['hardware', 'systems', 'robotics', 'electrical'],
  },
  {
    id: 'systems',
    label: 'Systems Engineer',
    group: 'engineering',
    patterns: [
      [
        /\b(kernel|compiler|operating systems?|low level|distributed systems) (engineer|developer|intern)?\b/,
        7,
      ],
      [/\bsystems? (software )?(engineer|programmer)\b/, 6],
      [/\bc\+\+ (developer|engineer)\b/, 6],
    ],
    related: ['embedded', 'platform', 'software_engineer'],
  },
  {
    id: 'game_dev',
    label: 'Game Developer',
    group: 'engineering',
    patterns: [
      [/\bgame(play)? (developer|programmer|engineer|designer|development|artist)\b/, 9],
      [/\b(unity|unreal)( engine)? (developer|engineer)\b/, 9],
      [/\bgaming\b/, 5],
    ],
    related: ['ar_vr', 'motion_designer'],
  },
  {
    id: 'devops',
    label: 'DevOps Engineer',
    group: 'engineering',
    patterns: [
      [/\bdevops\b|\bdevsecops\b/, 9],
      [/\b(build and release|release|build) engineer\b/, 7],
      [/\bci ?\/ ?cd\b/, 6],
    ],
    related: ['sre', 'cloud', 'platform', 'security'],
  },
  {
    id: 'sre',
    label: 'Site Reliability Engineer',
    group: 'engineering',
    patterns: [
      [/\bsre\b|\bsite reliability\b/, 9],
      [/\breliability engineer\b/, 8],
    ],
    related: ['devops', 'platform', 'cloud'],
  },
  {
    id: 'cloud',
    label: 'Cloud Engineer',
    group: 'engineering',
    patterns: [
      [/\bcloud (engineer|architect|developer|support|operations|infrastructure|consultant)\b/, 8],
      [/\b(aws|azure|gcp|google cloud) (engineer|architect|developer|consultant)\b/, 8],
    ],
    related: ['devops', 'sre', 'platform', 'network', 'backend'],
  },
  {
    id: 'platform',
    label: 'Platform / Infrastructure Engineer',
    group: 'engineering',
    patterns: [[/\b(platform|infrastructure|infra) (engineer|engineering|developer)\b/, 8]],
    related: ['devops', 'sre', 'cloud', 'backend'],
  },
  {
    id: 'security',
    label: 'Security Engineer',
    group: 'engineering',
    patterns: [
      [
        /\bcyber ?security\b|\binfosec\b|\bappsec\b|\bsecurity (engineer|analyst|researcher|architect|consultant|operations)\b/,
        9,
      ],
      [
        /\b(penetration|pen) test(er|ing)?\b|\bethical hack(er|ing)\b|\bsoc analyst\b|\bred team\b|\bblue team\b/,
        9,
      ],
      [/\bsecurity\b/, 6],
    ],
    related: ['network', 'devops', 'cloud', 'blockchain'],
  },
  {
    id: 'network',
    label: 'Network Engineer',
    group: 'engineering',
    patterns: [
      [/\bnetwork (engineer|administrator|admin|architect|operations|support)\b/, 9],
      [/\bnetworking\b/, 5],
    ],
    related: ['it_support', 'cloud', 'security'],
  },
  {
    id: 'it_support',
    label: 'IT Support / Sysadmin',
    group: 'engineering',
    patterns: [
      [/\bsystems? administrator\b|\bsysadmin\b|\bdesktop support\b/, 9],
      [/\bit (support|helpdesk|help desk|technician|administrator|analyst|executive|intern)\b/, 9],
    ],
    related: ['network', 'support_engineer'],
  },
  {
    id: 'dba',
    label: 'Database Engineer / DBA',
    group: 'engineering',
    patterns: [
      [
        /\bdatabase (administrator|admin|engineer|developer|architect)\b|\bdba\b|\bsql developer\b/,
        9,
      ],
    ],
    related: ['backend', 'data_engineer'],
  },
  {
    id: 'qa',
    label: 'QA / Test Engineer',
    group: 'engineering',
    patterns: [
      [/\bsdet\b|\bsoftware development engineer in test\b/, 10],
      [
        /\b(qa|quality assurance|quality analyst|qe|quality engineer|test engineer|test automation|automation test(ing|er)?|tester|software testing|manual testing)\b/,
        8,
      ],
    ],
    related: ['software_engineer', 'devops'],
  },
  {
    id: 'blockchain',
    label: 'Blockchain / Web3 Engineer',
    group: 'engineering',
    patterns: [[/\b(blockchain|web3|smart contracts?|solidity|defi|crypto(currency)?)\b/, 8]],
    related: ['backend', 'security'],
  },
  {
    id: 'ar_vr',
    label: 'AR / VR Developer',
    group: 'engineering',
    patterns: [
      [
        /\b(ar ?\/ ?vr|augmented reality|virtual reality|mixed reality|xr) (developer|engineer|designer)?\b/,
        8,
      ],
    ],
    related: ['game_dev', 'computer_vision'],
  },
  {
    id: 'robotics',
    label: 'Robotics Engineer',
    group: 'engineering',
    patterns: [
      [/\brobotics?\b/, 8],
      [/\bros (developer|engineer)\b|\bautonomous (systems|vehicles?|driving)\b/, 8],
    ],
    related: ['embedded', 'mechanical', 'computer_vision', 'hardware'],
  },
  {
    id: 'hardware',
    label: 'Hardware / VLSI Engineer',
    group: 'engineering',
    patterns: [
      [
        /\b(vlsi|asic|fpga|rtl|soc design|chip design|physical design|design verification|verification engineer|pcb|analog design|digital design)\b/,
        9,
      ],
      [/\b(hardware|electronics|semiconductor)\b/, 7],
    ],
    related: ['embedded', 'electrical', 'robotics'],
  },
  {
    id: 'electrical',
    label: 'Electrical Engineer',
    group: 'engineering',
    patterns: [
      [/\belectrical (engineer|engineering|design)\b|\bpower (systems?|electronics) engineer\b/, 8],
    ],
    related: ['hardware', 'embedded'],
  },
  {
    id: 'mechanical',
    label: 'Mechanical Engineer',
    group: 'engineering',
    patterns: [
      [/\bmechanical\b|\bmechatronics\b/, 8],
      [/\b(automotive|manufacturing|production|design|cad|aerospace) engineer\b/, 6],
    ],
    related: ['robotics', 'civil'],
  },
  {
    id: 'civil',
    label: 'Civil / Structural Engineer',
    group: 'engineering',
    patterns: [
      [
        /\bcivil (engineer|engineering)\b|\bstructural engineer\b|\bsite engineer\b|\bconstruction engineer\b/,
        8,
      ],
    ],
    related: ['mechanical'],
  },
  {
    id: 'chemical',
    label: 'Chemical / Process Engineer',
    group: 'engineering',
    patterns: [[/\bchemical (engineer|engineering)\b|\bprocess engineer\b/, 8]],
    related: ['life_sciences'],
  },
  {
    id: 'solutions_engineer',
    label: 'Solutions / Sales Engineer',
    group: 'engineering',
    patterns: [
      [
        /\b(solutions?|sales|pre ?sales|field|customer|forward deployed) (engineer|architect|consultant)\b/,
        9,
      ],
    ],
    related: ['sales', 'support_engineer', 'cloud'],
  },
  {
    id: 'support_engineer',
    label: 'Technical Support Engineer',
    group: 'engineering',
    patterns: [
      [/\b(technical|application|product|production) support\b/, 9],
      [/\bsupport engineer\b/, 9],
    ],
    related: ['it_support', 'customer_success', 'solutions_engineer'],
  },
  {
    id: 'devrel',
    label: 'Developer Relations',
    group: 'engineering',
    patterns: [
      [
        /\bdeveloper (relations|advocate|evangelist|experience)\b|\bdevrel\b|\bdeveloper community\b/,
        9,
      ],
    ],
    related: ['technical_writer', 'open_source', 'social_media'],
  },
  {
    id: 'technical_writer',
    label: 'Technical Writer',
    group: 'engineering',
    patterns: [
      [
        /\btechnical (writer|writing|content|author)\b|\bdocumentation (engineer|writer|specialist)\b/,
        10,
      ],
    ],
    related: ['devrel', 'content'],
  },
  {
    id: 'open_source',
    label: 'Open-source Contributor',
    group: 'engineering',
    patterns: [
      [
        /\b(gsoc|google summer of code|lfx|linux foundation mentorship|mlh fellowship|outreachy|hacktoberfest|season of docs|summer of bitcoin)\b/,
        10,
      ],
      [
        /\bopen ?source (contributor|developer|program|programme|fellow|fellowship|mentee|mentorship)\b/,
        9,
      ],
      [/\bopen ?source\b/, 6],
    ],
    related: ['software_engineer', 'devrel'],
  },
  {
    id: 'engineering_manager',
    label: 'Engineering Manager',
    group: 'engineering',
    patterns: [
      [
        /\bengineering manager\b|\bhead of engineering\b|\b(vp|director) (of )?engineering\b|\bcto\b|\btech lead\b/,
        9,
      ],
    ],
    related: ['software_engineer', 'program_manager'],
  },

  // ── Data & AI ──────────────────────────────────────────────────────────────
  {
    id: 'data_scientist',
    label: 'Data Scientist',
    group: 'data',
    patterns: [
      [/\bdata scien(ce|tist|tists)\b/, 9],
      [/\bdecision scien(ce|tist)\b/, 8],
    ],
    related: [
      'data_analyst',
      'ml_engineer',
      'research_scientist',
      'statistician',
      'nlp',
      'computer_vision',
      'quant',
    ],
  },
  {
    id: 'data_analyst',
    label: 'Data Analyst',
    group: 'data',
    patterns: [
      [/\bdata analy(st|sts|tics|sis)\b/, 9],
      [/\b(product|reporting|insights|analytics|operations|people) analyst\b/, 7],
      [/\banalytics\b/, 5],
      [/\banalyst\b/, 3],
    ],
    related: ['bi_analyst', 'business_analyst', 'analytics_engineer', 'data_scientist'],
  },
  {
    id: 'bi_analyst',
    label: 'BI Analyst / Developer',
    group: 'data',
    patterns: [
      [
        /\b(business intelligence|bi) (analyst|developer|engineer|consultant)\b|\b(power bi|tableau|looker) developer\b/,
        10,
      ],
    ],
    related: ['data_analyst', 'analytics_engineer'],
  },
  {
    id: 'data_engineer',
    label: 'Data Engineer',
    group: 'data',
    patterns: [
      [/\bdata engineer(ing)?\b/, 9],
      [
        /\b(etl|elt|big data|data platform|data pipeline|data warehouse|spark|hadoop) (engineer|developer)\b/,
        9,
      ],
    ],
    related: ['analytics_engineer', 'mlops', 'backend', 'dba'],
  },
  {
    id: 'analytics_engineer',
    label: 'Analytics Engineer',
    group: 'data',
    patterns: [[/\banalytics engineer(ing)?\b/, 10]],
    related: ['data_engineer', 'data_analyst', 'bi_analyst'],
  },
  {
    id: 'ml_engineer',
    label: 'ML / AI Engineer',
    group: 'data',
    patterns: [
      [/\bmachine learning (engineer|developer|scientist|intern|engineering)\b/, 9],
      [
        /\b(artificial intelligence|ai|genai|generative ai|llm|deep learning) (engineer|developer|intern|engineering|specialist)\b/,
        9,
      ],
      [/\b(generative ai|genai|llm|large language models?|deep learning)\b/, 8],
      [/\bmachine learning\b/, 7],
      [/\b(artificial intelligence|ai)\b/, 5],
    ],
    related: ['mlops', 'nlp', 'computer_vision', 'research_scientist', 'data_scientist'],
  },
  {
    id: 'mlops',
    label: 'MLOps Engineer',
    group: 'data',
    patterns: [[/\bmlops\b|\bmachine learning (ops|operations|platform|infrastructure)\b/, 10]],
    related: ['ml_engineer', 'data_engineer', 'devops', 'platform'],
  },
  {
    id: 'nlp',
    label: 'NLP Engineer',
    group: 'data',
    patterns: [
      [
        /\b(nlp|natural language processing|computational linguistics|speech recognition|conversational ai)\b/,
        9,
      ],
    ],
    related: ['ml_engineer', 'data_scientist', 'research_scientist'],
  },
  {
    id: 'computer_vision',
    label: 'Computer Vision Engineer',
    group: 'data',
    patterns: [
      [/\bcomputer vision\b|\b(image processing|perception) (engineer|intern|researcher)\b/, 9],
    ],
    related: ['ml_engineer', 'robotics', 'research_scientist', 'ar_vr'],
  },
  {
    id: 'research_scientist',
    label: 'Research Scientist (Industry)',
    group: 'data',
    patterns: [
      [
        /\b(machine learning|ai|artificial intelligence|nlp|vision) research(er|ers| scientist| engineer| intern)?\b/,
        10,
      ],
      [/\b(research|applied) scientist\b|\bresearch engineer\b/, 9],
    ],
    related: ['ml_engineer', 'data_scientist', 'research_assistant', 'nlp', 'computer_vision'],
  },
  {
    id: 'quant',
    label: 'Quantitative Analyst / Researcher',
    group: 'data',
    patterns: [
      [
        /\bquant(itative)?( (analyst|researcher|developer|trader|research|trading|strategist|engineer))?\b|\balgorithmic trading\b/,
        9,
      ],
    ],
    related: ['data_scientist', 'investment_banking', 'finance'],
  },
  {
    id: 'statistician',
    label: 'Statistician / Actuary',
    group: 'data',
    patterns: [
      [
        /\bstatistician\b|\bbiostatistic(s|ian)\b|\bactuar(y|ial)\b|\bstatistical (analyst|programmer)\b/,
        9,
      ],
    ],
    related: ['data_scientist', 'data_analyst', 'risk_compliance'],
  },

  // ── Design ─────────────────────────────────────────────────────────────────
  {
    id: 'product_designer',
    label: 'Product Designer (UX/UI)',
    group: 'design',
    patterns: [
      [/\bproduct design(er|ers)?\b/, 10],
      [
        /\b(ux|ui|ux ?\/ ?ui|ui ?\/ ?ux|ux ui|ui ux|user experience|user interface|interaction|visual|web|experience) design(er|ers)?\b/,
        9,
      ],
      [/\bux\b|\bui ?\/ ?ux\b|\bux ?\/ ?ui\b/, 7],
      [/\bdesign(er)? (intern|internship|trainee)\b/, 5],
      [/\bdesigner\b/, 4],
    ],
    related: [
      'ux_researcher',
      'graphic_designer',
      'motion_designer',
      'frontend',
      'product_manager',
    ],
  },
  {
    id: 'ux_researcher',
    label: 'UX Researcher',
    group: 'design',
    patterns: [[/\b(ux|user|design|usability) research(er|ers)?\b/, 10]],
    related: ['product_designer', 'research_assistant'],
  },
  {
    id: 'graphic_designer',
    label: 'Graphic / Brand Designer',
    group: 'design',
    patterns: [
      [
        /\b(graphic|brand|communication|visual communication|packaging|print) design(er|ers)?\b/,
        10,
      ],
      [/\billustrat(or|ors|ion)\b/, 8],
    ],
    related: ['product_designer', 'motion_designer', 'marketing'],
  },
  {
    id: 'motion_designer',
    label: 'Motion / 3D Designer',
    group: 'design',
    patterns: [
      [/\b(motion|3d|animation|vfx) (designer|artist|graphics)\b|\banimator\b|\bvideo editor\b/, 9],
    ],
    related: ['graphic_designer', 'game_dev', 'content'],
  },

  // ── Product & delivery ─────────────────────────────────────────────────────
  {
    id: 'product_manager',
    label: 'Product Manager',
    group: 'product',
    patterns: [
      [/\bassociate product manager\b|\bapm\b/, 10],
      [/\bproduct (manager|management|owner|lead)\b/, 9],
      [/\bproduct (intern|analyst|internship|associate)\b/, 7],
      [/\bpm\b/, 6],
    ],
    related: ['program_manager', 'project_manager', 'business_analyst', 'product_designer'],
  },
  {
    id: 'program_manager',
    label: 'Program Manager',
    group: 'product',
    patterns: [[/\b(technical )?program (manager|management|coordinator|lead)\b|\btpm\b/, 9]],
    related: ['product_manager', 'project_manager', 'operations', 'engineering_manager'],
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    group: 'product',
    patterns: [
      [
        /\bproject (manager|management|coordinator|lead|associate)\b|\bscrum master\b|\bpmo\b|\bagile coach\b/,
        9,
      ],
    ],
    related: ['program_manager', 'product_manager', 'operations'],
  },

  // ── Business ───────────────────────────────────────────────────────────────
  {
    id: 'business_analyst',
    label: 'Business Analyst',
    group: 'business',
    patterns: [
      [/\bbusiness analyst\b|\bbusiness analysis\b/, 10],
      [/\bba (intern|associate|role)\b/, 7],
    ],
    related: ['data_analyst', 'consulting', 'strategy', 'product_manager'],
  },
  {
    id: 'consulting',
    label: 'Consultant',
    group: 'business',
    patterns: [
      [/\b(strategy|management|business|technology|it) consult(ant|ing|ants)\b/, 9],
      [/\bconsult(ant|ing|ants)\b/, 7],
    ],
    related: ['strategy', 'business_analyst'],
  },
  {
    id: 'strategy',
    label: 'Strategy & Business Operations',
    group: 'business',
    patterns: [
      [
        /\b(strategy|corporate development|bizops|business operations|founder'?s office|chief of staff)( (analyst|associate|manager|intern))?\b/,
        8,
      ],
    ],
    related: ['consulting', 'operations', 'business_analyst'],
  },
  {
    id: 'sales',
    label: 'Sales',
    group: 'business',
    patterns: [
      [
        /\b(account executive|sales development|business development representative|inside sales|sdr|bdr)\b/,
        9,
      ],
      [/\bsales\b/, 7],
    ],
    related: ['business_development', 'customer_success', 'solutions_engineer'],
  },
  {
    id: 'business_development',
    label: 'Business Development',
    group: 'business',
    patterns: [
      [
        /\bbusiness development\b|\bbd (associate|manager|executive|intern)\b|\bpartnerships?\b|\balliances\b/,
        9,
      ],
    ],
    related: ['sales', 'strategy'],
  },
  {
    id: 'customer_success',
    label: 'Customer Success',
    group: 'business',
    patterns: [
      [
        /\bcustomer (success|experience|service|support|care)\b|\baccount manager\b|\bclient (success|servicing|relations)\b/,
        8,
      ],
    ],
    related: ['sales', 'support_engineer', 'operations'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    group: 'business',
    patterns: [
      [
        /\b(product|digital|brand|performance|growth|content|email|event|field|influencer) marketing\b/,
        9,
      ],
      [/\bmarketing\b|\bbrand (manager|associate|intern)\b/, 7],
    ],
    related: ['growth', 'content', 'social_media', 'pr_comms', 'graphic_designer'],
  },
  {
    id: 'growth',
    label: 'Growth',
    group: 'business',
    patterns: [
      [
        /\bgrowth\b|\b(seo|sem|ppc|aso)( (specialist|analyst|executive|intern|manager))?\b|\buser acquisition\b/,
        8,
      ],
    ],
    related: ['marketing', 'data_analyst', 'product_manager'],
  },
  {
    id: 'content',
    label: 'Content & Writing',
    group: 'business',
    patterns: [
      [
        /\bcontent (writer|writing|creator|strategist|strategy|intern|developer|editor)\b|\bcopywrit(er|ing)\b|\beditor(ial)?\b|\bjournalis(t|m)\b|\bblog(ger| writer)\b|\bscript ?writer\b/,
        9,
      ],
    ],
    related: ['marketing', 'social_media', 'technical_writer'],
  },
  {
    id: 'social_media',
    label: 'Social Media & Community',
    group: 'business',
    patterns: [
      [
        /\bsocial media\b|\bcommunity (manager|management|lead|associate|intern)\b|\binfluencer\b/,
        9,
      ],
    ],
    related: ['marketing', 'content', 'devrel'],
  },
  {
    id: 'pr_comms',
    label: 'PR & Communications',
    group: 'business',
    patterns: [
      [
        /\bpublic relations\b|\b(corporate )?communications? (manager|associate|intern|specialist|executive)\b|\bpr (manager|associate|intern|executive)\b/,
        9,
      ],
    ],
    related: ['marketing', 'content'],
  },
  {
    id: 'finance',
    label: 'Finance',
    group: 'business',
    patterns: [
      [
        /\bfinanc(e|ial) (analyst|associate|intern|manager|planning|controller|operations)\b|\bfp ?& ?a\b|\btreasury\b/,
        9,
      ],
      [/\bfinance\b|\bfintech\b/, 6],
    ],
    related: ['accounting', 'investment_banking', 'risk_compliance', 'quant'],
  },
  {
    id: 'accounting',
    label: 'Accounting & Audit',
    group: 'business',
    patterns: [
      [
        /\baccount(ant|ants|ancy|ing)\b|\baudit(or|ing)?\b|\btax (analyst|associate|consultant|intern)\b|\bchartered accountant\b|\barticleship\b|\bbookkeep(er|ing)\b/,
        9,
      ],
    ],
    related: ['finance', 'risk_compliance'],
  },
  {
    id: 'investment_banking',
    label: 'Investment Banking & Markets',
    group: 'business',
    patterns: [
      [/\binvestment bank(ing|er)?\b/, 10],
      [
        /\b(m ?& ?a|equity research|private equity|venture capital|vc (analyst|associate|fellow)|asset management|wealth management|capital markets|sales (and|&) trading|global markets)\b/,
        9,
      ],
    ],
    related: ['finance', 'quant', 'consulting'],
  },
  {
    id: 'risk_compliance',
    label: 'Risk & Compliance',
    group: 'business',
    patterns: [
      [
        /\b(risk|compliance|credit|aml|kyc|fraud|regulatory) (analyst|associate|manager|officer|intern|analytics)\b/,
        9,
      ],
    ],
    related: ['finance', 'accounting', 'legal', 'statistician'],
  },
  {
    id: 'operations',
    label: 'Operations',
    group: 'business',
    patterns: [
      [/\b(operations|ops) (associate|manager|intern|analyst|executive|lead|coordinator)\b/, 8],
      [/\boperations\b/, 6],
    ],
    related: ['supply_chain', 'strategy', 'program_manager', 'customer_success'],
  },
  {
    id: 'supply_chain',
    label: 'Supply Chain & Logistics',
    group: 'business',
    patterns: [
      [
        /\b(supply chain|logistics|procurement|sourcing|inventory|warehouse|fulfil?ment|category) (analyst|associate|manager|intern|executive|operations|management)?\b/,
        9,
      ],
    ],
    related: ['operations'],
  },
  {
    id: 'hr',
    label: 'HR & Talent',
    group: 'business',
    patterns: [
      [
        /\bhuman resources?\b|\bhr\b|\bhrbp\b|\bpeople (operations|partner|team|ops)\b|\btalent (acquisition|management|partner)\b|\brecruit(er|ers|ing|ment)\b/,
        9,
      ],
    ],
    related: ['operations'],
  },
  {
    id: 'legal',
    label: 'Legal',
    group: 'business',
    patterns: [
      [
        /\blegal\b|\blawyer\b|\battorney\b|\b(legal |general |in house )?counsel\b|\bparalegal\b|\blaw (intern|clerk|associate|firm)\b|\badvocate\b/,
        9,
      ],
    ],
    related: ['risk_compliance', 'policy'],
  },

  // ── Research & other ───────────────────────────────────────────────────────
  {
    id: 'research_assistant',
    label: 'Research (Academic)',
    group: 'research',
    patterns: [
      [
        /\bresearch (assistant|associate|intern|internship|fellow|fellowship|scholar|trainee|programme|program)\b|\bsummer research\b|\bjunior research fellow\b|\bjrf\b|\bsrf\b/,
        8,
      ],
      [/\b(phd|ph d|doctoral|postdoc|post doctoral|postdoctoral)\b/, 8],
      [/\bresearch\b/, 5],
    ],
    related: ['research_scientist', 'ux_researcher', 'teaching'],
  },
  {
    id: 'teaching',
    label: 'Teaching & Mentoring',
    group: 'other',
    patterns: [
      [
        /\bteaching (assistant|fellow|associate)\b|\btutor\b|\bteacher\b|\binstructor\b|\blecturer\b|\bfaculty\b|\beducator\b|\bacademic (counsellor|counselor)\b/,
        9,
      ],
    ],
    related: ['research_assistant', 'content'],
  },
  {
    id: 'life_sciences',
    label: 'Life Sciences & Healthcare',
    group: 'other',
    patterns: [
      [
        /\b(biotech(nology)?|bioinformatics|biolog(y|ist|ical)|chemist(ry)?|lab (assistant|technician)|clinical (research|trial|data)|pharma(ceutical|cist)?|healthcare|medical|genomics|neuroscience)\b/,
        8,
      ],
    ],
    related: ['research_assistant', 'chemical', 'data_scientist'],
  },
  {
    id: 'policy',
    label: 'Public Policy & Social Impact',
    group: 'other',
    patterns: [
      [
        /\b(public )?policy\b|\bgovernment\b|\bgovernance\b|\bcivic\b|\bngo\b|\bsocial impact\b|\bdevelopment sector\b|\bnon ?profit\b/,
        8,
      ],
    ],
    related: ['legal', 'research_assistant'],
  },
  {
    id: 'campus_ambassador',
    label: 'Campus Ambassador',
    group: 'other',
    patterns: [
      [
        /\b(campus|student|brand|college|university) (ambassador|representative|lead|champion|partner)\b|\bambassador program(me)?\b/,
        10,
      ],
    ],
    related: ['marketing', 'social_media'],
  },
];

// ── Derived public data ──────────────────────────────────────────────────────

const relatedMap = new Map<string, Set<string>>();
for (const def of DEFS) relatedMap.set(def.id, new Set());
for (const def of DEFS) {
  for (const other of def.related ?? []) {
    if (!relatedMap.has(other) || other === def.id) continue;
    relatedMap.get(def.id)?.add(other);
    relatedMap.get(other)?.add(def.id);
  }
}

export const ROLE_FAMILIES: readonly RoleFamily[] = Object.freeze(
  DEFS.map((def) =>
    Object.freeze({
      id: def.id,
      label: def.label,
      group: def.group,
      related: Object.freeze([...(relatedMap.get(def.id) ?? [])].sort()),
    }),
  ),
);

const byId = new Map(ROLE_FAMILIES.map((family) => [family.id, family]));
const byLabel = new Map(ROLE_FAMILIES.map((family) => [family.label.toLowerCase(), family.id]));

/** Lowercase, strip emoji/diacritics/punctuation and expand common abbreviations. */
function normaliseRoleTitle(title: string): string {
  return (
    ` ${title} `
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/\p{Extended_Pictographic}|️|‍/gu, ' ')
      .replace(/&/g, ' & ')
      .replace(/(^|\s)\.net\b/g, '$1dotnet ')
      .replace(/\b(node|react|vue|next|nest|express|angular)\.js\b/g, '$1js')
      .replace(/[^\p{L}\p{N}+#.&/'\s]/gu, ' ')
      .replace(/(?<=\s)\.|\.(?=\s)/g, ' ')
      // hyphenated / spaced compounds
      .replace(/\bfront\s+end\b/g, 'frontend')
      .replace(/\bback\s+end\b/g, 'backend')
      .replace(/\bfull\s+stack\b/g, 'fullstack')
      .replace(/\bdev\s+ops\b/g, 'devops')
      .replace(/\bcyber\s+security\b/g, 'cybersecurity')
      // abbreviations
      .replace(/\b(sde|swe|sdes|swes)(\s*(i{1,3}|[1-3]))?\b/g, 'software engineer')
      .replace(/\bml\b/g, 'machine learning')
      .replace(/\bengg\b|\bengr\b/g, 'engineer')
      .replace(/\bdevs?\b/g, 'developer')
      .replace(/\bmgr\b/g, 'manager')
      .replace(/\bsr\b|\bjr\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function confidenceFor(weight: number): number {
  if (weight >= 8) return 0.9;
  if (weight >= 5) return 0.75;
  return 0.55;
}

/** Classify a job/program title into a role family, or null when nothing matches. */
export function classifyRole(title: string): RoleMatch | null {
  const text = normaliseRoleTitle(title);
  if (!text) return null;
  let best: { def: RoleFamilyDef; weight: number } | null = null;
  for (const def of DEFS) {
    for (const [pattern, weight] of def.patterns) {
      if (weight > (best?.weight ?? 0) && pattern.test(text)) {
        best = { def, weight };
      }
    }
  }
  if (!best) return null;
  return {
    family: best.def.id,
    label: best.def.label,
    group: best.def.group,
    confidence: confidenceFor(best.weight),
  };
}

export function getRoleFamily(id: string): RoleFamily | undefined {
  return byId.get(id);
}

/** Resolve a family id, a family label, or any free-text title to a family id. */
export function resolveRoleFamily(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const asId = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (byId.has(asId)) return asId;
  const asLabel = byLabel.get(trimmed.toLowerCase());
  if (asLabel) return asLabel;
  return classifyRole(trimmed)?.family ?? null;
}

/** True when two family ids are adjacent in the taxonomy (not when equal). */
export function areRolesRelated(a: string, b: string): boolean {
  return a !== b && (relatedMap.get(a)?.has(b) ?? false);
}
