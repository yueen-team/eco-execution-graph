import { existsSync } from 'node:fs';
import process from 'node:process';
import { workflowConfig } from './config.mjs';
import {
  assertBranchExists,
  assertBranchMerged,
  assertCleanWorkingTree,
  assertRemoteIsNotAhead,
  assertWorktreePathInsideRoot,
  currentBranch,
  git,
  hasFlag,
  isProtectedBranch,
  parseValueArg,
  runPnpm,
} from './run.mjs';
import { runIsolationWorkspaceGuard } from './guard-isolated-workspaces.mjs';

// main:ship 用于“人类已批准并合并到本地主干”后的机械收尾。
// 它不会替代人类批准，只减少重复确认和手工清理。
const args = process.argv.slice(2);
const cleanupBranch = parseValueArg(args, '--cleanup-branch');
const cleanupWorktree = parseValueArg(args, '--cleanup-worktree');
const dryRun = hasFlag(args, '--dry-run');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const branch = currentBranch();

if (!workflowConfig.mainBranches.includes(branch)) {
  fail(`main:ship must run from ${workflowConfig.mainBranches.join(' or ')}. Current: ${branch}`);
}

if (cleanupBranch) {
  if (cleanupBranch === branch) {
    fail(`Refusing to delete current branch "${cleanupBranch}".`);
  }

  if (isProtectedBranch(cleanupBranch, workflowConfig)) {
    fail(`Refusing to delete protected branch "${cleanupBranch}".`);
  }

  assertBranchExists(cleanupBranch);
  assertBranchMerged(cleanupBranch, 'HEAD');
}

if (cleanupWorktree) {
  assertWorktreePathInsideRoot(cleanupWorktree, workflowConfig);

  if (!existsSync(cleanupWorktree)) {
    fail(`Worktree path does not exist: ${cleanupWorktree}`);
  }
}

assertCleanWorkingTree();

runIsolationWorkspaceGuard({ config: workflowConfig });

let upstream;

try {
  upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
} catch {
  upstream = `${workflowConfig.defaultRemote}/${branch}`;
}

assertRemoteIsNotAhead(upstream);

runPnpm(workflowConfig.verifyAllCommand, { dryRun });

git(['push', workflowConfig.defaultRemote, branch], {
  dryRun,
  stdio: 'inherit',
  env: { GIT_WORKFLOW_MAIN_SHIP: '1' },
});
console.log(`git push ${workflowConfig.defaultRemote} ${branch}`);

if (cleanupWorktree) {
  git(['worktree', 'remove', cleanupWorktree], { dryRun, stdio: 'inherit' });
}

if (cleanupBranch) {
  git(['branch', '-d', cleanupBranch], { dryRun, stdio: 'inherit' });
}
