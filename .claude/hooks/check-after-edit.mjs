#!/usr/bin/env node
/**
 * PostToolUse hook (Edit|Write): after a code edit, lint the file and, for
 * extension/test changes, run the smoke test. Failures go back to Claude
 * (exit 2 + stderr) so they get fixed right away; success is silent.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { tool_input: ti = {}, tool_response: tr = {} } = JSON.parse(input || '{}');
const file = ti.file_path || tr.filePath;
if (!file) process.exit(0);

const rel = path.relative(root, path.resolve(root, file));
if (rel.startsWith('..') || !/\.(m?js)$/.test(rel) && !rel.startsWith('test/fixtures/')) process.exit(0);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 90000 });
    return null;
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`.trim() || String(e.message);
  }
};

const problems = [];
if (/\.(m?js)$/.test(rel)) {
  const out = run('npx', ['eslint', '--no-warn-ignored', rel]);
  if (out) problems.push(`ESLint (${rel}):\n${out}`);
}
if (/^(extension\/|test\/fixtures\/|test\/run-fixers\.mjs$)/.test(rel)) {
  const out = run('npm', ['test', '--silent']);
  if (out) {
    const failing = out.split('\n').filter((l) => l.startsWith('✗') || /check\(s\) failed|Error/.test(l));
    problems.push(`npm test failed after editing ${rel}:\n${(failing.length ? failing : out.split('\n').slice(-20)).join('\n')}`);
  }
}
if (problems.length) {
  process.stderr.write(problems.join('\n\n') + '\n');
  process.exit(2);
}
