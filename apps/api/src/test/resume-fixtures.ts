import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const SAMPLE_RESUME_LINES = [
  'Priya Sharma',
  'Full-stack Developer Intern',
  'priya.sharma@example.com | +91 98765 43210 | github.com/priyasharma | linkedin.com/in/priya-sharma | https://priya.dev',
  'Summary',
  'Final-year computer science student who builds web apps with React and Node.js.',
  'Education',
  'Indian Institute of Technology Bombay',
  'B.Tech in Computer Science and Engineering, 2022 - 2026',
  'CGPA: 8.7/10',
  'Experience',
  'Software Engineering Intern at Razorpay',
  'May 2025 - Jul 2025',
  '• Built a payments dashboard in React and TypeScript',
  '• Reduced API latency by 30% with Redis caching',
  'Projects',
  'Beacon Clone | React, Node.js, MongoDB',
  '• Aggregated 5,000 listings with a ranking engine',
  '• Deployed on AWS with Docker',
  'Chess Engine - Python',
  '• Minimax search with alpha-beta pruning',
  'Skills',
  'Languages: JavaScript, TypeScript, Python, C++',
  'Frameworks: React, Express, Node.js, TensorFlow',
  'Tools: Git, Docker, Kubernetes, PostgreSQL',
  'Languages Known',
  'English (Fluent), Hindi (Native)',
];

export const SAMPLE_RESUME_TEXT = SAMPLE_RESUME_LINES.join('\n');

/** Text-based PDF (one text run per line). */
export async function makePdf(lines: readonly string[] = SAMPLE_RESUME_LINES): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    page.drawText(line.replace(/[•]/g, '-'), { x: 40, y, size: 10, font });
    y -= 16;
  }
  return Buffer.from(await pdf.save());
}

/** Image-only PDF: shapes but no text layer (what a scanner produces). */
export async function makeScannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  for (let i = 0; i < 40; i += 1) page.drawRectangle({ x: 40, y: 800 - i * 18, width: 400, height: 8 });
  return Buffer.from(await pdf.save());
}

export async function makeDocx(lines: readonly string[] = SAMPLE_RESUME_LINES): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })) }],
  });
  return Packer.toBuffer(doc);
}
