/**
 * Skill taxonomy: canonical skill names, aliases and categories, plus a fast
 * alias-aware extractor for free text (resumes, job descriptions).
 *
 * Matching rules
 * - Aliases are case-insensitive unless listed under `cs` (case-sensitive), which is
 *   reserved for ambiguous English words ("Go", "React", "Excel", "Spring") and
 *   single-letter languages ("C", "R"). Case-sensitive patterns may also carry guards.
 * - Word boundaries are Unicode-aware and treat `+`, `#` and `.x` as word characters, so
 *   "c" never matches inside "c++"/"c#", "js" never matches inside "node.js", and
 *   ".net" never matches inside "asp.net".
 * - Spaces and hyphens inside an alias match any run of spaces/hyphens
 *   ("react native" = "react-native" = "React  Native").
 * - The longest alias wins at a position ("React Native" beats "React").
 */

export const SKILL_CATEGORIES = [
  'language',
  'frontend',
  'backend',
  'mobile',
  'database',
  'cloud',
  'devops',
  'data',
  'ml',
  'security',
  'testing',
  'tools',
  'systems',
  'blockchain',
  'gamedev',
  'hardware',
  'design',
  'product',
  'business',
  'finance',
  'marketing',
  'research',
  'operations',
  'soft',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export interface SkillDefinition {
  /** Canonical display name, e.g. "JavaScript". */
  name: string;
  category: SkillCategory;
  /** Every alias (case-insensitive and case-sensitive ones). */
  aliases: readonly string[];
}

export interface ExtractedSkill {
  canonical: string;
  /** Alias (as defined in the taxonomy) or canonical name of the first occurrence. */
  matchedAlias: string;
  /** Total occurrences across all aliases. */
  count: number;
}

// ── Data definition helpers ──────────────────────────────────────────────────

interface Guard {
  /** Reject when the text right after the match matches (anchor with ^). */
  notBefore?: RegExp;
  /** Reject when the text right before the match matches (anchor with $). */
  notAfter?: RegExp;
  /** Reject at the start of the text or right after ". ! ?" … */
  notSentenceStart?: boolean;
  /** … unless the following text matches this (e.g. "Go developer"). */
  startOk?: RegExp;
}

interface SkillOptions extends Guard {
  /** Case-sensitive aliases. */
  cs?: readonly string[];
  /** Match the canonical name case-sensitively only. */
  nameCs?: boolean;
}

interface SkillEntry {
  def: SkillDefinition;
  ci: readonly string[];
  cs: readonly string[];
  guard: Guard | null;
}

type Row = readonly [name: string, aliases?: readonly string[], options?: SkillOptions];

function group(category: SkillCategory, rows: readonly Row[]): SkillEntry[] {
  return rows.map(([name, aliases = [], options = {}]) => {
    const { cs = [], nameCs = false, ...guardFields } = options;
    const guard = Object.keys(guardFields).length > 0 ? guardFields : null;
    return {
      def: Object.freeze({ name, category, aliases: Object.freeze([...aliases, ...cs]) }),
      ci: nameCs ? [...aliases] : [name, ...aliases],
      cs: nameCs ? [name, ...cs] : [...cs],
      guard,
    };
  });
}

// ── Guards for ambiguous words ───────────────────────────────────────────────

/** "C" / "R": standalone uppercase letter only. Rejects C++, C#, C-suite, R&D, Plan C, Type-C … */
const SINGLE_LETTER: SkillOptions = {
  notBefore: /^(?:[+#&'/-]|\.\s*[A-Z]\.|\s+(?:suite|level|grade|series|corp|ltd)\b)/i,
  notAfter:
    /(?:[&/-]|\b(?:plan|section|sec|grade|type|vitamin|block|class|series|tower|wing|part|level|category|appendix|annexure|phase|round|option|group|team|building|floor|row|step|zone|sector|division|div|schedule|form|exhibit|note|tier|unit|gate|room|batch|semester|point|figure|table|sheet|paper|standard|hall|size|model|stage|track|slot|shift|rank|mark)\s+)$/i,
};

const GO_GUARD: SkillOptions = {
  notSentenceStart: true,
  startOk:
    /^\s*(?:[,;/|()]|(?:developer|developers|engineer|engineers|programming|language|lang|backend|microservices?|services|modules?|routines)\b)/i,
  notBefore:
    /^(?:-(?:to|live|getter|kart|green)\b|\s+(?:to|ahead|beyond|through|back|forth|further|live|green|big|far|out|get|above|deep|first|for it)\b)/i,
  notAfter: /\b(?:let's|lets|pokémon|pokemon|ready to|good to|to)\s+$/i,
};

// ── The taxonomy ─────────────────────────────────────────────────────────────

const LANGUAGE = group('language', [
  ['JavaScript', ['js', 'ecmascript', 'es6', 'es2015', 'vanilla js']],
  ['TypeScript', ['ts']],
  ['Python', ['python3', 'python 3']],
  ['Java', ['core java', 'java 8', 'java se', 'j2ee', 'java ee', 'jakarta ee']],
  ['C', ['c language', 'c programming', 'ansi c'], { nameCs: true, ...SINGLE_LETTER }],
  ['C++', ['cpp', 'c plus plus', 'modern c++']],
  ['C#', ['c sharp', 'csharp']],
  ['Go', ['golang', 'go lang', 'go language', 'go programming'], { nameCs: true, ...GO_GUARD }],
  ['Rust', ['rustlang'], { nameCs: true, notBefore: /^\s+belt\b/i }],
  ['Kotlin'],
  ['Swift', [], { nameCs: true, notAfter: /\btaylor\s+$/i }],
  ['Objective-C', ['objc', 'obj-c']],
  ['Ruby', [], { nameCs: true }],
  ['PHP', ['php7', 'php 8']],
  ['Scala'],
  ['R', ['r language', 'r programming', 'rstudio', 'r studio'], { nameCs: true, ...SINGLE_LETTER }],
  ['MATLAB'],
  ['Julia', [], { nameCs: true }],
  ['Perl'],
  ['Haskell'],
  ['Elixir'],
  ['Erlang'],
  ['Clojure'],
  ['F#', ['fsharp', 'f sharp']],
  ['Dart', [], { nameCs: true }],
  ['Lua'],
  ['Groovy', [], { nameCs: true }],
  ['Bash', ['bash scripting']],
  ['PowerShell'],
  ['Shell Scripting', ['shell script', 'shell scripts', 'unix shell']],
  ['Assembly Language', ['assembly programming', 'x86 assembly', 'arm assembly']],
  ['Fortran'],
  ['COBOL'],
  ['Visual Basic', ['vb.net']],
  ['VBA', ['excel vba', 'visual basic for applications']],
  ['Zig', [], { nameCs: true }],
  ['OCaml'],
  ['Prolog'],
  ['Lisp', ['common lisp']],
  ['Solidity'],
  ['ABAP'],
]);

const FRONTEND = group('frontend', [
  [
    'React',
    ['reactjs', 'react.js', 'react js'],
    {
      nameCs: true,
      notBefore:
        /^\s+(?:to|quickly|fast|swiftly|accordingly|appropriately|promptly|positively|calmly|well)\b/i,
    },
  ],
  [
    'Angular',
    ['angularjs', 'angular.js'],
    { nameCs: true, notBefore: /^\s+(?:momentum|velocity|acceleration|frequency|displacement)\b/i },
  ],
  ['Vue.js', ['vue', 'vuejs', 'vue js']],
  ['Svelte'],
  ['SvelteKit'],
  ['Next.js', ['nextjs', 'next js']],
  ['Nuxt.js', ['nuxt', 'nuxtjs']],
  ['HTML', ['html5']],
  ['CSS', ['css3']],
  ['Sass', ['scss']],
  ['Tailwind CSS', ['tailwind', 'tailwindcss']],
  ['Bootstrap', [], { nameCs: true }],
  ['jQuery'],
  ['Redux', ['redux toolkit']],
  ['Material UI', ['mui', 'material-ui']],
  ['Chakra UI'],
  ['shadcn/ui', ['shadcn']],
  ['Web Accessibility', ['accessibility', 'a11y', 'wcag']],
  ['Responsive Design', ['responsive web design', 'mobile-first design']],
  ['Three.js', ['threejs']],
  ['D3.js', ['d3', 'd3js']],
  ['WebGL'],
  ['WebAssembly', ['wasm']],
  ['Progressive Web Apps', ['pwa', 'pwas', 'progressive web app']],
  ['Gatsby', ['gatsbyjs']],
  ['Remix', [], { nameCs: true }],
  ['Astro', [], { nameCs: true }],
  ['Ember.js', ['emberjs'], { cs: ['Ember'] }],
  ['Backbone.js', ['backbonejs'], { cs: ['Backbone'], notBefore: /^\s+of\b/i }],
  ['Styled Components', ['styled-components']],
  ['Storybook'],
  ['TanStack Query', ['react query', 'tanstack']],
  ['Zustand'],
  ['MobX'],
  ['RxJS'],
  ['Web Performance', ['core web vitals', 'web vitals', 'frontend performance']],
  ['SolidJS', ['solid.js']],
  ['Alpine.js', ['alpinejs']],
  ['HTMX'],
  ['Web Components', ['custom elements']],
  ['DOM Manipulation', ['dom']],
  ['AJAX'],
  ['Framer Motion'],
  ['GSAP'],
  ['Electron', ['electron.js', 'electronjs'], { nameCs: true }],
  ['WordPress'],
  ['Webflow'],
  ['Frontend Development', ['front-end development', 'frontend engineering']],
]);

const BACKEND = group('backend', [
  ['Node.js', ['nodejs', 'node js'], { cs: ['Node'] }],
  [
    'Express',
    ['express.js', 'expressjs', 'express js'],
    {
      nameCs: true,
      notBefore:
        /^\s+(?:interest|your|yourself|ourselves|themselves|delivery|entry|lane|mail|consent|written|permission|checkout|shipping)\b/i,
      notAfter: /\b(?:to|please|american|orient|fedex|pizza)\s+$/i,
    },
  ],
  ['Django'],
  ['Django REST Framework', ['drf']],
  ['Flask', [], { nameCs: true }],
  ['FastAPI', ['fast api']],
  ['Spring Boot', ['springboot']],
  [
    'Spring',
    ['spring framework', 'spring mvc'],
    {
      nameCs: true,
      notBefore:
        /^\s*(?:'?\d{2,4}|semester|term|break|internship|intern|interns|season|quarter|cohort|session|batch|hiring|recruiting|co-?op)\b/i,
      notAfter: /\b(?:this|next|last|early|late|during|summer|fall|winter|autumn|upcoming)\s+$/i,
    },
  ],
  ['Ruby on Rails', ['ror'], { cs: ['Rails'] }],
  ['Laravel'],
  ['Symfony'],
  ['ASP.NET', ['asp.net core', 'asp.net mvc', 'aspnet']],
  ['.NET', ['dotnet', '.net core', '.net framework', 'dot net']],
  ['NestJS', ['nest.js']],
  ['GraphQL'],
  [
    'REST APIs',
    ['rest api', 'restful', 'restful api', 'restful apis', 'restful services'],
    { cs: ['REST'] },
  ],
  ['gRPC'],
  ['Microservices', ['microservice', 'microservices architecture']],
  ['RabbitMQ'],
  ['Celery', [], { nameCs: true }],
  ['System Design', ['systems design']],
  ['API Design', ['api development']],
  ['WebSockets', ['websocket', 'web sockets']],
  ['Hibernate', [], { nameCs: true }],
  ['Entity Framework', ['ef core', 'entity framework core']],
  ['Deno'],
  ['Bun', [], { nameCs: true }],
  ['Koa', [], { nameCs: true }],
  ['Fastify'],
  ['Strapi'],
  ['Socket.IO', ['socketio', 'socket io']],
  ['OAuth', ['oauth2', 'oauth 2.0']],
  ['JWT', ['json web token', 'json web tokens']],
  ['tRPC'],
  ['OpenAPI', ['swagger', 'openapi specification']],
  ['Webhooks', ['webhook']],
  ['Message Queues', ['message queue', 'message broker', 'message brokers']],
  ['Quarkus'],
  ['Ktor'],
  [
    'Backend Development',
    ['back-end development', 'backend engineering', 'server-side development'],
  ],
]);

const MOBILE = group('mobile', [
  ['Android', ['android development', 'android sdk']],
  ['iOS', ['ios development']],
  ['React Native'],
  ['Flutter'],
  ['SwiftUI'],
  ['Jetpack Compose'],
  ['Xamarin'],
  ['Ionic', [], { nameCs: true }],
  ['Apache Cordova', ['cordova', 'phonegap']],
  ['Kotlin Multiplatform', ['kmp', 'kmm']],
  ['UIKit'],
  ['Mobile App Development', ['mobile development', 'app development', 'mobile apps']],
  ['Android Jetpack', ['jetpack']],
  ['.NET MAUI', ['maui']],
]);

const DATABASE = group('database', [
  ['SQL'],
  ['NoSQL'],
  ['PostgreSQL', ['postgres', 'psql']],
  ['MySQL'],
  ['SQLite'],
  ['MongoDB', ['mongo', 'mongo db']],
  ['Redis'],
  ['Apache Cassandra', ['cassandra']],
  ['DynamoDB', ['amazon dynamodb']],
  ['Elasticsearch', ['elastic search', 'opensearch']],
  ['Oracle Database', ['oracle db', 'oracle sql']],
  ['Microsoft SQL Server', ['sql server', 'mssql', 'ms sql']],
  ['MariaDB'],
  ['Neo4j'],
  ['Firestore', ['cloud firestore']],
  ['Supabase'],
  ['CockroachDB'],
  ['Snowflake', [], { nameCs: true }],
  ['BigQuery', ['google bigquery']],
  ['Amazon Redshift', ['redshift']],
  ['ClickHouse'],
  ['InfluxDB'],
  ['Couchbase'],
  ['CouchDB'],
  ['Memcached'],
  ['Pinecone'],
  ['Vector Databases', ['vector database', 'vector db', 'vector store']],
  ['PL/SQL', ['plsql']],
  ['T-SQL', ['transact-sql']],
  ['Database Design', ['database modeling', 'schema design']],
  ['Prisma'],
  ['Mongoose', [], { nameCs: true }],
  ['Sequelize'],
  ['TypeORM'],
  ['Drizzle ORM', ['drizzle']],
  ['RDBMS', ['relational databases', 'relational database']],
]);

const CLOUD = group('cloud', [
  ['AWS', ['amazon web services']],
  ['Microsoft Azure', ['azure']],
  ['Google Cloud', ['gcp', 'google cloud platform']],
  ['Amazon EC2', ['ec2']],
  ['Amazon S3', [], { cs: ['S3'] }],
  ['Amazon RDS', ['rds']],
  ['Amazon SQS', ['sqs']],
  ['Firebase'],
  ['Heroku'],
  ['Vercel'],
  ['Netlify'],
  ['DigitalOcean', ['digital ocean']],
  ['Cloudflare', ['cloudflare workers']],
  ['Serverless', ['serverless computing', 'serverless architecture']],
  ['AWS CloudFormation', ['cloudformation']],
  ['Cloud Computing'],
  ['Oracle Cloud'],
  ['IBM Cloud'],
  ['Alibaba Cloud'],
  ['OpenStack'],
  ['Google Kubernetes Engine', ['gke']],
  ['Amazon EKS', ['eks']],
  ['Azure Kubernetes Service', ['aks']],
  ['Cloud Architecture', ['solutions architecture']],
  ['Google App Engine', ['app engine']],
]);

const DEVOPS = group('devops', [
  ['Docker', ['docker compose', 'docker-compose', 'dockerfile']],
  ['Kubernetes', ['k8s', 'kubectl']],
  ['Terraform'],
  ['Ansible'],
  ['Jenkins'],
  ['GitHub Actions'],
  ['GitLab CI', ['gitlab ci/cd', 'gitlab pipelines']],
  [
    'CI/CD',
    [
      'ci cd',
      'ci / cd',
      'cicd',
      'continuous integration',
      'continuous delivery',
      'continuous deployment',
    ],
  ],
  ['Helm'],
  ['Prometheus'],
  ['Grafana'],
  ['ELK Stack', ['elk', 'elastic stack']],
  ['Nginx'],
  ['Apache HTTP Server', ['apache httpd', 'httpd']],
  ['Argo CD', ['argocd']],
  ['Infrastructure as Code', ['iac']],
  ['Puppet', [], { nameCs: true, notBefore: /^\s+(?:show|shows|theatre|theater)\b/i }],
  ['Chef', [], { nameCs: true, notAfter: /\b(?:head|sous|pastry|master)\s+$/i }],
  ['Vagrant'],
  ['Istio'],
  ['Site Reliability Engineering', ['sre']],
  ['Datadog'],
  ['New Relic'],
  ['Splunk'],
  ['Observability'],
  ['Podman'],
  ['OpenShift'],
  ['CircleCI'],
  ['Travis CI'],
  ['Azure DevOps'],
  ['Pulumi'],
  ['HashiCorp Vault'],
  ['Linux Administration', ['linux admin', 'system administration', 'sysadmin']],
  ['Load Balancing', ['load balancer', 'load balancers']],
  ['DevOps', ['dev ops']],
  ['Docker Swarm'],
]);

const DATA = group('data', [
  ['Data Science'],
  ['Data Analysis', ['data analytics', 'data analyst skills']],
  ['Data Visualization', ['data visualisation', 'data viz', 'dataviz']],
  ['Pandas'],
  ['NumPy'],
  ['SciPy'],
  ['Matplotlib'],
  ['Seaborn'],
  ['Plotly'],
  ['Tableau'],
  ['Power BI', ['powerbi']],
  ['Looker', ['looker studio', 'google data studio']],
  [
    'Apache Spark',
    [],
    {
      cs: ['Spark'],
      notBefore: /^\s+(?:joy|interest|curiosity|conversations?|change|innovation|ideas?)\b/i,
    },
  ],
  ['PySpark'],
  ['Hadoop', ['hdfs', 'mapreduce']],
  ['Apache Hive', ['hive']],
  ['Apache Kafka', ['kafka']],
  ['Apache Airflow', [], { cs: ['Airflow'] }],
  ['dbt', ['data build tool']],
  ['ETL', ['elt', 'etl pipelines']],
  ['Data Warehousing', ['data warehouse', 'data warehouses']],
  ['Data Engineering'],
  ['Data Modeling', ['data modelling']],
  ['Statistics', ['statistical analysis', 'applied statistics']],
  ['Databricks'],
  ['Apache Flink', ['flink']],
  ['Data Mining'],
  ['Data Cleaning', ['data wrangling', 'data cleansing']],
  ['SAS', [], { nameCs: true }],
  ['SPSS'],
  ['Stata'],
  ['Big Data'],
  ['Business Intelligence'],
  ['Business Analytics'],
  ['Time Series Analysis', ['time-series analysis']],
  ['Regression Analysis', ['linear regression', 'logistic regression']],
  ['Hypothesis Testing'],
  ['Polars'],
  ['Dask'],
  ['Data Pipelines', ['data pipeline']],
  ['Apache Beam'],
  ['Trino', ['presto']],
  ['Qlik', ['qlikview', 'qlik sense']],
  ['Metabase'],
  ['Web Scraping', ['web crawling']],
  ['BeautifulSoup', ['beautiful soup', 'bs4']],
  ['Scrapy'],
  ['Excel Modelling', ['spreadsheet modelling', 'spreadsheet modeling']],
]);

const ML = group('ml', [
  ['Machine Learning', [], { cs: ['ML'] }],
  ['Deep Learning'],
  ['Natural Language Processing', ['nlp']],
  ['Computer Vision'],
  ['Artificial Intelligence', [], { cs: ['AI'] }],
  ['TensorFlow', ['tensorflow2', 'tf.keras']],
  ['PyTorch'],
  ['Keras'],
  ['scikit-learn', ['sklearn', 'scikit learn']],
  ['XGBoost'],
  ['LightGBM'],
  ['Hugging Face', ['huggingface', 'hugging face transformers']],
  ['Large Language Models', ['llm', 'llms', 'large language model']],
  ['Generative AI', ['genai', 'gen ai', 'generative artificial intelligence']],
  ['Prompt Engineering'],
  ['LangChain'],
  ['LlamaIndex'],
  ['Retrieval-Augmented Generation', [], { cs: ['RAG'] }],
  ['OpenCV'],
  ['Reinforcement Learning'],
  ['MLOps', ['ml ops']],
  ['MLflow'],
  ['Kubeflow'],
  ['Neural Networks', ['neural network', 'artificial neural networks']],
  ['Convolutional Neural Networks', [], { cs: ['CNN', 'CNNs'] }],
  ['Transformers Architecture', ['transformer models', 'attention mechanisms']],
  ['LLM Fine-Tuning', ['fine-tuning', 'peft'], { cs: ['LoRA'] }],
  ['Feature Engineering'],
  ['Model Deployment', ['model serving']],
  ['Recommender Systems', ['recommendation systems', 'recommendation engines']],
  ['Speech Recognition', ['asr', 'speech-to-text']],
  ['JAX'],
  ['ONNX'],
  ['Diffusion Models', ['stable diffusion']],
  ['Time Series Forecasting', ['forecasting models']],
  ['Anomaly Detection'],
  ['Bayesian Statistics', ['bayesian inference', 'bayesian methods']],
  ['Amazon SageMaker', ['sagemaker', 'aws sagemaker']],
  ['Vertex AI'],
  ['spaCy'],
  ['NLTK'],
  ['YOLO', [], { nameCs: true }],
  ['AutoML'],
  ['Weights & Biases', ['wandb']],
  ['Supervised Learning'],
  ['Unsupervised Learning', ['clustering']],
]);

const SECURITY = group('security', [
  ['Cybersecurity', ['cyber security', 'information security', 'infosec']],
  ['Network Security'],
  ['Penetration Testing', ['pentesting', 'pen testing', 'pentest']],
  ['Ethical Hacking'],
  ['OWASP', ['owasp top 10']],
  ['Cryptography', ['encryption']],
  ['Burp Suite'],
  ['Wireshark'],
  ['Metasploit'],
  ['Nmap'],
  ['Kali Linux'],
  ['SIEM'],
  ['Vulnerability Assessment', ['vapt', 'vulnerability management']],
  ['Identity and Access Management', ['iam']],
  ['Application Security', ['appsec']],
  ['Cloud Security'],
  ['Malware Analysis'],
  ['Digital Forensics', ['computer forensics']],
  ['Incident Response'],
  ['Threat Modeling', ['threat modelling']],
  ['ISO 27001'],
  ['SOC 2', ['soc2']],
  ['Zero Trust'],
  ['Reverse Engineering'],
  ['Capture the Flag', [], { cs: ['CTF', 'CTFs'] }],
  ['DevSecOps'],
  ['Security Auditing', ['security audits', 'security audit']],
]);

const TESTING = group('testing', [
  ['Unit Testing', ['unit tests', 'unit test']],
  ['Integration Testing', ['integration tests']],
  ['Test Automation', ['automation testing', 'automated testing']],
  ['Manual Testing'],
  ['Selenium', ['selenium webdriver']],
  ['Cypress'],
  ['Playwright'],
  ['Jest'],
  ['Mocha', [], { nameCs: true }],
  ['Chai', [], { nameCs: true }],
  ['JUnit'],
  ['pytest'],
  ['Vitest'],
  ['TestNG'],
  ['Appium'],
  ['Load Testing', ['performance testing', 'stress testing']],
  ['JMeter', ['apache jmeter']],
  ['Test-Driven Development', ['tdd']],
  ['Behavior-Driven Development', ['bdd', 'behaviour-driven development']],
  ['Cucumber', [], { nameCs: true }],
  ['React Testing Library', ['testing library']],
  ['Quality Assurance'],
  ['API Testing'],
  ['End-to-End Testing', ['e2e testing', 'e2e tests']],
]);

const TOOLS = group('tools', [
  ['Git'],
  ['GitHub'],
  ['GitLab'],
  ['Bitbucket'],
  ['Jira'],
  ['Confluence'],
  ['Postman'],
  ['Visual Studio Code', ['vs code', 'vscode']],
  ['Visual Studio'],
  ['Vim', ['neovim']],
  ['Microsoft Office', ['ms office', 'office 365', 'microsoft 365']],
  [
    'Excel',
    ['ms excel', 'microsoft excel', 'advanced excel'],
    { nameCs: true, notBefore: /^\s+(?:at|in|as)\b/i },
  ],
  ['PowerPoint', ['ms powerpoint', 'power point']],
  ['Microsoft Word', ['ms word']],
  ['Google Sheets'],
  ['Google Workspace', ['g suite', 'gsuite']],
  ['Trello'],
  ['Asana'],
  ['Notion', [], { nameCs: true, notBefore: /^\s+(?:of|that)\b/i }],
  ['Airtable'],
  ['Zapier'],
  ['Jupyter', ['jupyter notebook', 'jupyter notebooks', 'jupyterlab']],
  ['LaTeX'],
  ['Webpack'],
  ['Vite'],
  ['Babel'],
  ['npm'],
  ['Yarn', [], { nameCs: true }],
  ['pnpm'],
  ['ESLint'],
  ['Prettier', [], { nameCs: true }],
  ['IntelliJ IDEA', ['intellij']],
  ['Eclipse', [], { nameCs: true }],
  ['Android Studio'],
  ['Xcode'],
  ['Maven', [], { nameCs: true }],
  ['Gradle'],
  ['Bazel'],
  ['CMake'],
  ['Miro'],
  ['Slack', [], { nameCs: true }],
  ['Google Colab', ['colab']],
  ['Anaconda', ['conda']],
  ['Chrome DevTools', ['devtools']],
  ['Version Control', ['version control systems']],
]);

const SYSTEMS = group('systems', [
  ['Linux'],
  ['Unix'],
  ['Operating Systems', ['operating system']],
  ['Computer Networks', ['computer networking', 'networking fundamentals']],
  ['TCP/IP'],
  ['Data Structures and Algorithms', ['dsa', 'data structures', 'data structures & algorithms']],
  ['Algorithms', ['algorithm design']],
  ['Distributed Systems'],
  ['Multithreading', ['multi-threading', 'concurrency', 'concurrent programming']],
  ['Compilers', ['compiler design', 'compiler construction']],
  ['Linux Kernel', ['kernel development']],
  ['Systems Programming', ['system programming']],
  [
    'Object-Oriented Programming',
    ['oop', 'oops concepts', 'object-oriented design'],
    { cs: ['OOPs', 'OOPS'] },
  ],
  ['Functional Programming'],
  ['Design Patterns'],
  ['DBMS', ['database management systems']],
  ['Computer Architecture', ['computer organization']],
  ['Parallel Computing', ['parallel programming', 'hpc', 'high performance computing']],
  ['CUDA', ['cuda programming']],
  ['Low-Level Design', ['lld']],
  ['High-Level Design', ['hld']],
  ['Competitive Programming', ['competitive coding']],
  ['Virtualization', ['virtualisation', 'vmware', 'hypervisors']],
  ['Debugging'],
  ['Performance Optimization', ['performance optimisation', 'performance tuning']],
  ['Socket Programming'],
  ['Networking Protocols', ['network protocols']],
  ['Memory Management'],
]);

const BLOCKCHAIN = group('blockchain', [
  ['Blockchain', ['blockchain development']],
  ['Ethereum'],
  ['Smart Contracts', ['smart contract']],
  ['Web3', ['web3.js', 'web 3']],
  ['Hardhat'],
  ['Truffle', [], { nameCs: true }],
  ['Hyperledger Fabric', ['hyperledger']],
  ['DeFi', ['decentralized finance']],
  ['NFTs', ['nft']],
  ['Solana'],
  ['Bitcoin'],
  ['Cryptocurrency', ['crypto currency', 'cryptocurrencies']],
  ['Ethers.js', ['ethersjs']],
  ['Foundry', [], { nameCs: true }],
]);

const GAMEDEV = group('gamedev', [
  [
    'Unity',
    ['unity3d', 'unity 3d', 'unity engine'],
    {
      nameCs: true,
      notBefore: /^\s+(?:in|of|among|between|day)\b/i,
      notAfter: /\b(?:national|in|of|bring|promote|foster)\s+$/i,
    },
  ],
  ['Unreal Engine', ['ue4', 'ue5'], { cs: ['Unreal'] }],
  ['Godot', ['godot engine']],
  ['Game Design'],
  ['Game Development', ['game dev', 'gamedev']],
  ['OpenGL'],
  ['Vulkan'],
  ['DirectX'],
  ['Shader Programming', ['hlsl', 'glsl', 'shaders']],
  ['Pygame'],
  ['Level Design'],
  ['3D Modeling', ['3d modelling']],
  ['Blender'],
  ['Roblox Studio', ['roblox', 'luau']],
  ['Game Physics'],
]);

const HARDWARE = group('hardware', [
  ['Embedded Systems', ['embedded software', 'embedded development']],
  ['Embedded C'],
  ['Arduino'],
  ['Raspberry Pi', ['rpi']],
  ['Verilog'],
  ['SystemVerilog', ['system verilog']],
  ['VHDL'],
  ['FPGA', ['fpgas']],
  ['VLSI', ['vlsi design']],
  ['PCB Design', ['pcb', 'pcb layout']],
  ['Microcontrollers', ['microcontroller']],
  ['RTOS', ['freertos', 'real-time operating systems']],
  ['IoT', ['internet of things']],
  ['Signal Processing', ['dsp', 'digital signal processing']],
  ['Simulink'],
  ['AutoCAD'],
  ['SolidWorks', ['solid works']],
  ['CATIA'],
  ['ANSYS'],
  ['PLC Programming', ['plc', 'plcs']],
  ['Robotics'],
  ['ROS', ['robot operating system', 'ros2'], { nameCs: true }],
  ['Control Systems'],
  ['Power Electronics'],
  ['Analog Circuit Design', ['analog design', 'analog circuits']],
  ['Digital Electronics', ['digital logic', 'digital circuits']],
  ['Circuit Design'],
  ['LabVIEW'],
  ['3D Printing', ['additive manufacturing']],
  ['CAD', ['computer-aided design'], { nameCs: true }],
  ['Fusion 360', ['fusion360']],
  ['KiCad'],
  ['Altium Designer', ['altium']],
  ['Mechatronics'],
  ['Thermodynamics'],
  ['Fluid Mechanics'],
  ['Computational Fluid Dynamics', ['cfd']],
  ['Finite Element Analysis', ['fea']],
  ['Firmware Development', ['firmware']],
  ['Embedded Linux'],
  ['Mechanical Design'],
  ['STAAD.Pro', ['staad pro', 'staad']],
  ['Revit', ['autodesk revit']],
  ['ETABS'],
]);

const DESIGN = group('design', [
  ['Figma'],
  ['Adobe XD'],
  ['Sketch', [], { nameCs: true, notBefore: /^\s+(?:out|of|a|an|the|up|ideas?)\b/i }],
  ['Adobe Photoshop', ['photoshop']],
  ['Adobe Illustrator', [], { cs: ['Illustrator'] }],
  ['Adobe InDesign', ['indesign']],
  ['Adobe After Effects', ['after effects']],
  ['Adobe Premiere Pro', ['premiere pro']],
  ['UI Design', ['user interface design', 'ui designing'], { cs: ['UI'] }],
  ['UX Design', ['user experience design', 'ux designing'], { cs: ['UX'] }],
  ['User Research', ['user interviews', 'ux research']],
  ['Wireframing', ['wireframes', 'wireframe']],
  ['Prototyping', ['prototypes', 'rapid prototyping']],
  ['Interaction Design'],
  ['Visual Design'],
  ['Graphic Design'],
  ['Typography'],
  ['Design Systems', ['design system']],
  ['Usability Testing'],
  ['Information Architecture'],
  ['Motion Design', ['motion graphics']],
  ['Branding', ['brand identity', 'visual identity']],
  ['Illustration'],
  ['Canva'],
  ['Framer', [], { nameCs: true }],
  ['Design Thinking'],
  ['Human-Computer Interaction', ['hci']],
  ['Video Editing'],
  ['Photography'],
  ['Logo Design'],
  ['Product Design'],
  ['Zeplin'],
  ['InVision'],
  ['Procreate'],
  ['DaVinci Resolve'],
  ['Final Cut Pro'],
  ['CorelDRAW', ['corel draw']],
  ['Animation', ['2d animation', '3d animation']],
  ['User Flows', ['user flow', 'user journeys', 'journey mapping']],
]);

const PRODUCT = group('product', [
  ['Product Management'],
  ['Product Strategy'],
  ['Product Roadmapping', ['roadmapping', 'product roadmap', 'product roadmaps']],
  ['User Stories', ['user story']],
  ['Agile', ['agile methodology', 'agile methodologies']],
  ['Scrum'],
  ['Kanban'],
  ['A/B Testing', ['ab testing', 'split testing']],
  ['Product Analytics'],
  ['Competitive Analysis', ['competitor analysis']],
  ['Product Requirements', ['prd', 'prds', 'product requirements documents']],
  ['Go-to-Market Strategy', ['go-to-market', 'gtm', 'gtm strategy']],
  ['OKRs', ['okr']],
  ['Product Discovery'],
  ['Mixpanel'],
  ['Amplitude'],
  ['Prioritization', ['prioritisation']],
  ['Sprint Planning'],
  ['Program Management'],
  ['Product Lifecycle Management', ['product lifecycle']],
  ['Lean Startup'],
  ['Customer Journey Mapping'],
  ['Product Metrics', ['north star metric', 'kpi definition']],
]);

const BUSINESS = group('business', [
  ['Business Analysis', ['business analyst skills']],
  ['Requirements Gathering', ['requirements elicitation']],
  ['Stakeholder Management'],
  ['Management Consulting', ['consulting']],
  ['Business Strategy', ['corporate strategy']],
  ['Sales', ['inside sales']],
  ['B2B Sales'],
  ['Business Development'],
  ['CRM', ['customer relationship management']],
  ['Salesforce'],
  ['SAP', ['sap erp', 'sap s/4hana'], { nameCs: true }],
  ['ERP', ['enterprise resource planning']],
  ['Process Improvement', ['business process improvement']],
  ['Lean Six Sigma', ['six sigma']],
  ['Project Management'],
  ['PMP'],
  ['Entrepreneurship'],
  ['Customer Success'],
  ['Account Management', ['key account management']],
  ['Market Sizing'],
  ['Vendor Management'],
  ['Change Management'],
  ['Business Process Modeling', ['bpmn', 'business process modelling']],
  ['Microsoft Dynamics', ['dynamics 365']],
  ['Pitching', ['pitch decks', 'pitch deck']],
  ['Partnerships', ['strategic partnerships']],
  ['Pricing Strategy'],
]);

const FINANCE = group('finance', [
  ['Financial Modelling', ['financial modeling']],
  ['Financial Analysis'],
  ['Accounting'],
  ['Valuation', ['business valuation']],
  ['DCF Analysis', ['dcf', 'discounted cash flow']],
  ['Corporate Finance'],
  ['Investment Banking'],
  ['Equity Research'],
  ['Bookkeeping'],
  ['Budgeting'],
  ['Financial Forecasting'],
  ['Auditing', ['internal audit', 'statutory audit']],
  ['Taxation', ['income tax', 'direct tax']],
  ['GST', ['goods and services tax']],
  ['Tally', ['tally erp', 'tallyprime', 'tally erp 9'], { nameCs: true }],
  ['QuickBooks'],
  ['Bloomberg Terminal'],
  ['Risk Management'],
  ['Financial Reporting'],
  ['IFRS', ['ind as']],
  ['GAAP', ['us gaap']],
  ['Portfolio Management'],
  ['Derivatives'],
  ['Fixed Income'],
  ['Mergers and Acquisitions', ['m&a', 'mergers & acquisitions']],
  ['Private Equity'],
  ['Venture Capital'],
  ['Quantitative Finance', ['quant finance']],
  ['Credit Analysis', ['credit risk']],
  ['FP&A', ['financial planning and analysis']],
  ['Accounts Payable'],
  ['Accounts Receivable'],
  ['Cost Accounting'],
  ['Actuarial Science'],
  ['Economics'],
  ['Econometrics'],
  ['Cash Flow Management'],
  ['Financial Markets'],
]);

const MARKETING = group('marketing', [
  ['Digital Marketing'],
  ['SEO', ['search engine optimization', 'search engine optimisation']],
  ['SEM', ['search engine marketing']],
  ['Content Marketing'],
  ['Social Media Marketing', ['smm']],
  ['Email Marketing'],
  ['Google Ads', ['adwords', 'google adwords']],
  ['Meta Ads', ['facebook ads', 'instagram ads']],
  ['Google Analytics', ['ga4']],
  ['Google Tag Manager'],
  ['Copywriting'],
  ['Content Writing'],
  ['Brand Management'],
  ['Marketing Strategy'],
  ['Growth Marketing', ['growth hacking']],
  ['Performance Marketing'],
  ['Affiliate Marketing'],
  ['Influencer Marketing'],
  ['Public Relations', ['media relations']],
  ['Market Research'],
  ['Marketing Analytics'],
  ['HubSpot'],
  ['Mailchimp'],
  ['Semrush'],
  ['Ahrefs'],
  ['Conversion Rate Optimization', ['cro', 'conversion rate optimisation']],
  ['Product Marketing'],
  ['Community Management'],
  ['Shopify'],
  ['Marketing Automation'],
  ['Customer Segmentation'],
  ['Campaign Management'],
  ['Social Media Management'],
  ['App Store Optimization', ['aso']],
  ['Brand Strategy'],
  ['Video Marketing'],
]);

const RESEARCH = group('research', [
  ['Literature Review'],
  ['Academic Writing', ['scientific writing', 'research writing']],
  ['Research Methodology', ['research methods']],
  ['Experimental Design', ['design of experiments']],
  ['Qualitative Research'],
  ['Quantitative Research'],
  ['Survey Design'],
  ['Data Collection'],
  ['Grant Writing'],
  ['Technical Writing', ['documentation writing']],
  ['Bioinformatics'],
  ['Computational Biology'],
  ['Molecular Biology'],
  ['Linear Algebra'],
  ['Calculus'],
  ['Probability', ['probability theory']],
  ['Mathematical Optimization', ['convex optimization', 'optimization theory']],
  ['Operations Research'],
  ['Scientific Computing'],
  ['Quantum Computing'],
  ['Qiskit'],
  ['Genomics'],
  ['Clinical Research'],
  ['Policy Analysis', ['public policy']],
  ['Peer Review'],
  ['Simulation Modeling', ['simulation modelling', 'monte carlo simulation']],
  ['Discrete Mathematics'],
  ['Numerical Methods'],
  ['Physics'],
  ['Chemistry'],
]);

const OPERATIONS = group('operations', [
  ['Operations Management'],
  ['Supply Chain Management', ['supply chain', 'scm']],
  ['Logistics'],
  ['Inventory Management'],
  ['Procurement', ['purchasing']],
  ['Event Management', ['event planning']],
  ['Lean Manufacturing'],
  ['Human Resources', ['hr management', 'hrm']],
  ['Recruitment', ['recruiting', 'talent acquisition']],
  ['Payroll', ['payroll management']],
  ['Customer Support', ['customer service', 'customer care']],
  ['ITIL'],
  ['IT Support', ['technical support', 'helpdesk', 'help desk']],
  ['Data Entry'],
  ['Compliance', ['regulatory compliance']],
  ['Warehouse Management'],
  ['Demand Planning'],
  ['Contract Management'],
  ['Quality Management', ['quality control', 'total quality management']],
  ['Office Administration'],
  ['Employee Engagement'],
  ['Process Documentation', ['sop writing', 'standard operating procedures']],
]);

const SOFT = group('soft', [
  ['Communication', ['communication skills', 'verbal communication']],
  ['Written Communication', ['written communication skills', 'business writing']],
  ['Leadership', ['leadership skills', 'team leadership']],
  ['Teamwork', ['team work', 'team player', 'collaboration']],
  ['Problem Solving', ['problem-solving skills', 'problem solving skills']],
  ['Critical Thinking'],
  ['Time Management'],
  ['Public Speaking'],
  ['Presentation Skills'],
  ['Negotiation', ['negotiation skills']],
  ['Adaptability', ['adaptable']],
  ['Creativity', ['creative thinking']],
  ['Attention to Detail', ['detail-oriented', 'eye for detail']],
  ['Analytical Thinking', ['analytical skills', 'analytical mindset']],
  ['Mentoring', ['mentorship']],
  ['Coaching'],
  ['Conflict Resolution'],
  ['Emotional Intelligence'],
  ['Decision Making', ['decision-making skills']],
  ['Interpersonal Skills'],
  ['Organizational Skills', ['organisational skills', 'organization skills']],
  ['Multitasking', ['multi-tasking']],
  ['Active Listening'],
  ['Strategic Thinking'],
  ['Self-Motivation', ['self-motivated']],
  ['Work Ethic', ['strong work ethic']],
  ['Empathy'],
  ['Facilitation', ['workshop facilitation']],
  ['Cross-functional Collaboration', ['cross-functional teams']],
  ['Storytelling'],
  ['Accountability'],
  ['People Management', ['team management']],
  ['Delegation'],
  ['Persuasion'],
  ['Resilience'],
]);

const ENTRIES: readonly SkillEntry[] = [
  ...LANGUAGE,
  ...FRONTEND,
  ...BACKEND,
  ...MOBILE,
  ...DATABASE,
  ...CLOUD,
  ...DEVOPS,
  ...DATA,
  ...ML,
  ...SECURITY,
  ...TESTING,
  ...TOOLS,
  ...SYSTEMS,
  ...BLOCKCHAIN,
  ...GAMEDEV,
  ...HARDWARE,
  ...DESIGN,
  ...PRODUCT,
  ...BUSINESS,
  ...FINANCE,
  ...MARKETING,
  ...RESEARCH,
  ...OPERATIONS,
  ...SOFT,
];

export const SKILLS: readonly SkillDefinition[] = Object.freeze(ENTRIES.map((e) => e.def));

// ── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Lookup key: NFKC, lowercase, whitespace collapsed, then spaces . - _ / removed
 * ("Node.js" = "node js" = "nodejs"); `+` and `#` are kept ("C++" ≠ "C").
 */
export function skillKey(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[\s._\-/]+/g, '');
}

let lookup: Map<string, SkillDefinition> | undefined;

function getLookup(): Map<string, SkillDefinition> {
  if (lookup) return lookup;
  lookup = new Map();
  for (const def of SKILLS) {
    for (const term of [def.name, ...def.aliases]) {
      const key = skillKey(term);
      if (key && !lookup.has(key)) lookup.set(key, def);
    }
  }
  return lookup;
}

export function getSkill(nameOrAlias: string): SkillDefinition | undefined {
  return getLookup().get(skillKey(nameOrAlias));
}

/** "JS" → "JavaScript", "k8s" → "Kubernetes"; null when unknown. */
export function canonicaliseSkill(input: string): string | null {
  return getSkill(input)?.name ?? null;
}

/** Canonical names where known, otherwise the trimmed input; deduped case-insensitively. */
export function canonicaliseSkills(inputs: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const value = canonicaliseSkill(trimmed) ?? trimmed;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

// ── Extraction ───────────────────────────────────────────────────────────────

interface Pattern {
  canonical: string;
  alias: string;
  guard: Guard | null;
}

interface Matcher {
  regex: RegExp;
  byKey: Map<string, Pattern>;
  caseSensitive: boolean;
}

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_]|[\\p{L}\\p{N}]\\.)';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_+#]|\\.[\\p{L}\\p{N}])';
const SEPARATOR = /[\s-]+/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normaliseInput(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-');
}

function matchKey(text: string, caseSensitive: boolean): string {
  const collapsed = text.trim().split(SEPARATOR).join(' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}

function buildMatcher(caseSensitive: boolean): Matcher {
  const byKey = new Map<string, Pattern>();
  for (const entry of ENTRIES) {
    const terms = caseSensitive ? entry.cs : entry.ci;
    for (const alias of terms) {
      const key = matchKey(normaliseInput(alias), caseSensitive);
      if (!byKey.has(key)) {
        byKey.set(key, {
          canonical: entry.def.name,
          alias,
          guard: caseSensitive ? entry.guard : null,
        });
      }
    }
  }
  const sources = [...byKey.keys()]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((key) => key.split(' ').map(escapeRegExp).join('[\\s-]+'));
  const regex = new RegExp(
    `${BOUNDARY_BEFORE}(?:${sources.join('|')})${BOUNDARY_AFTER}`,
    caseSensitive ? 'gu' : 'giu',
  );
  return { regex, byKey, caseSensitive };
}

let matchers: readonly [Matcher, Matcher] | undefined;

function getMatchers(): readonly [Matcher, Matcher] {
  matchers ??= [buildMatcher(false), buildMatcher(true)];
  return matchers;
}

function isSentenceStart(input: string, start: number): boolean {
  const before = input.slice(0, start).trimEnd();
  return before === '' || /[.!?]["')\]]?$/.test(before);
}

function passesGuard(guard: Guard | null, input: string, start: number, end: number): boolean {
  if (!guard) return true;
  const after = input.slice(end, end + 40);
  if (guard.notBefore?.test(after)) return false;
  if (guard.notAfter?.test(input.slice(Math.max(0, start - 40), start))) return false;
  if (guard.notSentenceStart && isSentenceStart(input, start)) {
    return guard.startOk?.test(after) ?? false;
  }
  return true;
}

interface Hit {
  start: number;
  end: number;
  pattern: Pattern;
}

function collect(matcher: Matcher, input: string, hits: Hit[]): void {
  for (const match of input.matchAll(matcher.regex)) {
    const start = match.index;
    const end = start + match[0].length;
    const pattern = matcher.byKey.get(matchKey(match[0], matcher.caseSensitive));
    if (!pattern) continue;
    if (!passesGuard(pattern.guard, input, start, end)) continue;
    hits.push({ start, end, pattern });
  }
}

/**
 * Find taxonomy skills mentioned in free text. Overlapping matches resolve to the
 * longest one; results are sorted by count (desc) then canonical name.
 */
export function extractSkills(text: string): ExtractedSkill[] {
  if (!text.trim()) return [];
  const input = normaliseInput(text);
  const hits: Hit[] = [];
  for (const matcher of getMatchers()) collect(matcher, input, hits);
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const found = new Map<string, ExtractedSkill>();
  let lastEnd = -1;
  for (const hit of hits) {
    if (hit.start < lastEnd) continue;
    lastEnd = hit.end;
    const existing = found.get(hit.pattern.canonical);
    if (existing) existing.count += 1;
    else {
      found.set(hit.pattern.canonical, {
        canonical: hit.pattern.canonical,
        matchedAlias: hit.pattern.alias,
        count: 1,
      });
    }
  }
  return [...found.values()].sort(
    (a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical),
  );
}
