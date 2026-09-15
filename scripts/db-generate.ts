import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

execSync('bunx drizzle-kit generate', { stdio: 'inherit' });

const drizzleDir = join(__dirname, '../drizzle');
for (const file of readdirSync(drizzleDir)) {
  if (file.endsWith('.sql')) {
    const fullPath = join(drizzleDir, file);
    const content = readFileSync(fullPath, 'utf8');
    const cleaned = content.replace(/REFERENCES "public"\./g, 'REFERENCES ');
    if (cleaned !== content) {
      writeFileSync(fullPath, cleaned, 'utf8');
    }
  }
}
