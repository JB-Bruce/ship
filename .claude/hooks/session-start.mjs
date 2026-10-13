// SessionStart : installe les dépendances dans les sessions cloud (conteneur neuf, sans node_modules),
// pour que `npm run typecheck` et `npm run build` marchent tout de suite. Rien à faire en local.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (process.env.CLAUDE_CODE_REMOTE === 'true' && !existsSync(join(dir, 'node_modules', '.bin', 'tsc'))) {
  execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
}
