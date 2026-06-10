import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { workflowConfig } from './config.mjs';
import { git, hasFlag } from './run.mjs';

function normalizeRemote(value) {
  return String(value || '')
    .trim()
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/\.git$/i, '')
    .replace(/\/$/i, '')
    .toLowerCase();
}

function gitIn(cwd, args, options = {}) {
  return git(args, { cwd, ...options });
}

function splitRoots(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultRoots(repoRoot) {
  const repoName = path.basename(repoRoot);
  return [
    path.resolve(repoRoot, '.worktrees'),
    path.resolve(path.dirname(repoRoot), `${repoName}-clones`),
  ];
}

function isGitRepo(dir) {
  return existsSync(path.join(dir, '.git'));
}

function findReposUnder(root) {
  if (!existsSync(root)) return [];
  if (!statSync(root).isDirectory()) return [];
  if (isGitRepo(root)) return [root];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter(isGitRepo);
}

function isAncestor(cwd, ancestor, descendant) {
  try {
    gitIn(cwd, ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function short(cwd, ref) {
  return gitIn(cwd, ['rev-parse', '--short', ref]);
}

function resolveMainRef(config) {
  for (const branch of config.mainBranches || ['main']) {
    try {
      git(['rev-parse', '--verify', branch], { stdio: 'ignore' });
      return branch;
    } catch {
      // Try the next configured main branch.
    }
  }
  return 'HEAD';
}

export function runIsolationWorkspaceGuard(options = {}) {
  const config = options.config ?? workflowConfig;
  const guardConfig = config.isolationGuard ?? {};
  if (!guardConfig.enabled && !options.force) return;

  const repoRoot = path.resolve(options.cwd ?? process.cwd());
  const args = options.args ?? process.argv.slice(2);
  const strict = options.strict ?? (hasFlag(args, '--strict') ? true : guardConfig.strict !== false);
  const quiet = options.quiet ?? hasFlag(args, '--quiet');
  const allowEnv = guardConfig.allowEnv || 'ALLOW_ISOLATED_WORKSPACES';

  if (process.env[allowEnv] === '1') {
    if (!quiet) console.log(`Isolation workspace guard skipped: ${allowEnv}=1`);
    return;
  }

  const mainRemote = normalizeRemote(git(['remote', 'get-url', config.defaultRemote || 'origin'], { cwd: repoRoot }));
  const configuredRoots = splitRoots(process.env.ISOLATION_WORKSPACE_ROOTS).concat(guardConfig.roots || []);
  const roots = (configuredRoots.length ? configuredRoots : defaultRoots(repoRoot))
    .map((item) => path.resolve(repoRoot, item));
  const candidates = roots.flatMap(findReposUnder);
  const sameOriginRepos = [];

  for (const candidate of candidates) {
    if (path.resolve(candidate).toLowerCase() === repoRoot.toLowerCase()) continue;

    let remote;
    try {
      remote = normalizeRemote(gitIn(candidate, ['remote', 'get-url', config.defaultRemote || 'origin']));
    } catch {
      continue;
    }

    if (remote === mainRemote) sameOriginRepos.push(candidate);
  }

  if (!sameOriginRepos.length) {
    if (!quiet) console.log('Isolation workspace guard: no same-origin clones/worktrees found.');
    return;
  }

  const mainRef = resolveMainRef(config);
  const problems = [];
  const leftovers = [];

  for (const repo of sameOriginRepos) {
    const branch = gitIn(repo, ['branch', '--show-current']) || '(detached)';
    const head = gitIn(repo, ['rev-parse', 'HEAD']);
    const dirty = gitIn(repo, ['status', '--porcelain']).trim();
    const mergedIntoMain = isAncestor(repoRoot, head, mainRef);

    if (dirty) {
      problems.push(`- ${repo} (${branch}) has uncommitted changes; commit/stash/merge before testing from ${repoRoot}.`);
      continue;
    }

    if (!mergedIntoMain) {
      problems.push(`- ${repo} (${branch}@${short(repo, 'HEAD')}) is not contained in local ${mainRef}@${short(repoRoot, mainRef)}.`);
      continue;
    }

    leftovers.push(`- ${repo} (${branch}@${short(repo, 'HEAD')}) is already contained in ${mainRef}; remove this clone/worktree to keep one correct project folder.`);
  }

  if (problems.length) {
    throw new Error([
      'Isolation workspace guard failed.',
      '',
      'A same-origin clone/worktree has work that is not safely reflected in the main project folder.',
      '',
      ...problems,
    ].join('\n'));
  }

  if (strict && leftovers.length) {
    throw new Error([
      'Isolation workspace guard failed.',
      '',
      'Merged same-origin clones/worktrees still exist. Delete them before using the main project for tests.',
      '',
      ...leftovers,
      '',
      `Temporary bypass for intentional isolation work: ${allowEnv}=1`,
    ].join('\n'));
  }

  if (!quiet) console.log('Isolation workspace guard: same-origin isolation workspaces are merged.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runIsolationWorkspaceGuard({ force: true });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
