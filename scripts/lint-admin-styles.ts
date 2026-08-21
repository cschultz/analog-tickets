/**
 * Admin Style Guide Linter
 * 
 * Scans admin directories for style guide violations.
 * Run with: npx tsx scripts/lint-admin-styles.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ADMIN_DIRS = [
  'src/modules/admin/pages',
  'src/components/admin', 
  'src/components/social',
];

const VIOLATIONS = {
  // Raw HTML elements that should use Admin primitives
  rawElements: [
    { pattern: /<label\s+className/g, message: 'Use <AdminLabel> instead of <label>' },
    { pattern: /<button\s+className(?!.*variant)/g, message: 'Use <AdminButton> instead of raw <button>' },
  ],
  
  // Shadcn primitives that should use Admin wrappers
  shadcnPrimitives: [
    { pattern: /from ["']@\/components\/ui\/dialog["']/g, message: 'Use AdminDialog from @/components/admin/AdminDialog' },
    { pattern: /<Dialog[\s>]/g, message: 'Use <AdminDialog> instead of <Dialog>' },
    { pattern: /<DialogContent/g, message: 'Use <AdminDialogContent> instead of <DialogContent>' },
    { pattern: /<Badge[\s>]/g, message: 'Use <AdminBadge> instead of <Badge>' },
  ],
  
  // Direct color classes (non-semantic)
  directColors: [
    { pattern: /className="[^"]*text-red-\d+/g, message: 'Use text-[hsl(var(--admin-error))] instead of text-red-*' },
    { pattern: /className="[^"]*text-green-\d+/g, message: 'Use text-[hsl(var(--admin-success))] instead of text-green-*' },
    { pattern: /className="[^"]*text-blue-\d+/g, message: 'Use text-[hsl(var(--admin-info))] instead of text-blue-*' },
    { pattern: /className="[^"]*text-yellow-\d+/g, message: 'Use text-[hsl(var(--admin-warning))] instead of text-yellow-*' },
    { pattern: /className="[^"]*bg-red-\d+/g, message: 'Use bg-[hsl(var(--admin-error))] instead of bg-red-*' },
    { pattern: /className="[^"]*bg-green-\d+/g, message: 'Use bg-[hsl(var(--admin-success))] instead of bg-green-*' },
  ],
};

interface Violation {
  file: string;
  line: number;
  message: string;
  snippet: string;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (const category of Object.values(VIOLATIONS)) {
    for (const rule of category) {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            message: rule.message,
            snippet: line.trim().slice(0, 80),
          });
        }
        // Reset regex lastIndex for global patterns
        rule.pattern.lastIndex = 0;
      });
    }
  }
  
  return violations;
}

function scanDirectory(dir: string): Violation[] {
  const violations: Violation[] = [];
  
  if (!fs.existsSync(dir)) {
    return violations;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      violations.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      violations.push(...scanFile(fullPath));
    }
  }
  
  return violations;
}

function main() {
  console.log('🔍 Scanning admin directories for style guide violations...\n');
  
  const allViolations: Violation[] = [];
  
  for (const dir of ADMIN_DIRS) {
    allViolations.push(...scanDirectory(dir));
  }
  
  if (allViolations.length === 0) {
    console.log('✅ No style guide violations found!\n');
    process.exit(0);
  }
  
  console.log(`❌ Found ${allViolations.length} violation(s):\n`);
  
  // Group by file
  const byFile = allViolations.reduce((acc, v) => {
    if (!acc[v.file]) acc[v.file] = [];
    acc[v.file].push(v);
    return acc;
  }, {} as Record<string, Violation[]>);
  
  for (const [file, fileViolations] of Object.entries(byFile)) {
    console.log(`📁 ${file}`);
    for (const v of fileViolations) {
      console.log(`   Line ${v.line}: ${v.message}`);
      console.log(`   └─ ${v.snippet}...`);
    }
    console.log('');
  }
  
  console.log('See ADMIN_STYLE_GUIDE.md for correct usage.\n');
  process.exit(1);
}

main();
