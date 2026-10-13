// PostToolUse (Edit/Write) : rappels propres au projet, renvoyés à Claude comme contexte (jamais bloquants).
// - code écrit deux fois (TS et GLSL) : rappeler de modifier l'autre version ;
// - fichiers courts (~300 lignes, CLAUDE.md) : prévenir quand un fichier dépasse nettement.
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

/** Au-delà, on prévient (un peu de marge sur les « ~300 lignes »). */
const MAX_LINES = 320;
/** Fichiers longs par nature (réglages). */
const LONG_OK = new Set(['src/config.ts']);

/** Code à garder synchrone : fichier modifié → rappel. */
const TWINS = {
  'src/ocean/waves.ts': 'Formule de Gerstner : la version GLSL de src/ocean/oceanMesh.ts doit rester identique.',
  'src/ocean/oceanMesh.ts': 'Formule de Gerstner : la version TS de src/ocean/waves.ts doit rester identique (calme près des îles compris).',
  'src/world/island.ts': 'Îles : la formule TS (rayon, lobes, crique, sdf, calme) et ISLAND_GLSL (même fichier, utilisé par oceanMesh.ts) doivent rester identiques.',
  'src/ship/parts/hullShape.ts': 'WATERLINE_SAMPLES doit rester égal au float[8] du shader de src/ocean/wakeShaders.ts.',
  'src/ocean/wakeShaders.ts': 'Le float[8] du shader doit rester égal à WATERLINE_SAMPLES (src/ship/parts/hullShape.ts).',
};

const input = JSON.parse(readFileSync(0, 'utf8'));
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);
const dir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const rel = relative(dir, filePath).replaceAll('\\', '/');
if (!rel.startsWith('src/') || !existsSync(filePath)) process.exit(0);

const notes = [];
if (TWINS[rel]) notes.push(TWINS[rel]);
if (rel.endsWith('.ts') && !LONG_OK.has(rel)) {
  const lines = readFileSync(filePath, 'utf8').split('\n').length;
  if (lines > MAX_LINES) notes.push(`${rel} fait ${lines} lignes (> ~300) : envisager de le découper (un module par responsabilité).`);
}
if (notes.length) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') } }));
}
