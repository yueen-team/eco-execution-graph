import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// 返回跨平台 pnpm 调用方式。
export function pnpmCommand(args) {
  const pnpmCli = process.env.npm_execpath;

  if (pnpmCli) {
    return {
      command: process.execPath,
      args: [pnpmCli, ...args],
      shell: false,
    };
  }

  // 命令名不带扩展名:winget 安装的是 pnpm.exe,npm 安装的是 pnpm.cmd,
  // Windows 下交给 shell 按 PATHEXT 解析两者皆可。
  return {
    command: 'pnpm',
    args,
    shell: process.platform === 'win32',
  };
}

// 执行 pnpm 脚本。dryRun 用于 main:ship 演练。
export function runPnpm(args, options = {}) {
  const command = pnpmCommand(args);

  if (options.dryRun) {
    console.log(`[dry-run] pnpm ${args.join(' ')}`);
    return '';
  }

  return execFileSync(command.command, command.args, {
    cwd: process.cwd(),
    encoding: options.encoding,
    stdio: options.stdio ?? 'inherit',
    env: options.env ? { ...process.env, ...options.env } : process.env,
    shell: command.shell,
  });
}

// 执行 git 命令。默认捕获 stdout，便于脚本判断。
export function git(args, options = {}) {
  if (options.dryRun) {
    console.log(`[dry-run] git ${args.join(' ')}`);
    return '';
  }

  const output = execFileSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });

  if (typeof output !== 'string') {
    return '';
  }

  return output.trim();
}

export function currentBranch() {
  return git(['branch', '--show-current']);
}

export function readTextIfExists(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8');
}

export function isProtectedBranch(branch, config) {
  return (
    config.protectedBranches.includes(branch) ||
    config.protectedBranchPrefixes.some((prefix) => branch.startsWith(prefix))
  );
}

export function assertCleanWorkingTree() {
  const status = git(['status', '--porcelain']);

  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes before shipping main.');
  }
}

export function assertBranchExists(branch) {
  git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore' });
}

export function assertBranchMerged(branch, target = 'HEAD') {
  const mergedBranches = git(['branch', '--merged', target, '--format', '%(refname:short)'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!mergedBranches.includes(branch)) {
    throw new Error(`Branch "${branch}" is not merged into ${target}. Refusing to delete it.`);
  }
}

export function assertRemoteIsNotAhead(upstreamRef) {
  const [behindText] = git(['rev-list', '--left-right', '--count', `${upstreamRef}...HEAD`]).split(
    /\s+/,
  );
  const behind = Number(behindText);

  if (behind > 0) {
    throw new Error(`Current branch is behind or diverged from ${upstreamRef}. Pull/rebase first.`);
  }
}

export function parseValueArg(args, name) {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

export function hasFlag(args, name) {
  return args.includes(name);
}

export function stagedFiles() {
  return git(['diff', '--cached', '--name-only'])
    .split('\n')
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

export function assertWorktreePathInsideRoot(worktreePath, config) {
  const resolvedRoot = path.resolve(process.cwd(), config.worktreeRoot);
  const resolvedPath = path.resolve(process.cwd(), worktreePath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove worktree outside ${config.worktreeRoot}: ${worktreePath}`);
  }
}
