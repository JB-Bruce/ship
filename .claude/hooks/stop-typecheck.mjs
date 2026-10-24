// Stop : si du TypeScript a changé (fichiers modifiés non commités), lance `npm run typecheck` une fois en fin de tour.
// En cas d'erreur, Claude est renvoyé au travail avec la sortie de tsc (une seule fois : pas de boucle).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.stop_hook_active) process.exit(0);
const dir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
if (!existsSync(join(dir, 'node_modules', '.bin'))) process.exit(0);

const run = (cmd) => execSync(cmd, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let changed = '';
try {
  changed = run('git status --porcelain -- "*.ts" tsconfig.json package.json');
} catch {
  process.exit(0);
}
if (!changed.trim()) process.exit(0);

try {
  run('npm run typecheck --silent');
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(0, 40).join('\n');
  console.log(JSON.stringify({ decision: 'block', reason: `npm run typecheck échoue :\n${out}` }));
}
