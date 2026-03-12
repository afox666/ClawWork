import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import simpleGit from 'simple-git';
import { DB_FILE_NAME } from '@clawwork/shared';

const GITIGNORE_CONTENT = `# ClawWork workspace
${DB_FILE_NAME}
${DB_FILE_NAME}-journal
${DB_FILE_NAME}-wal
.DS_Store
`;

export async function initWorkspace(workspacePath: string): Promise<void> {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  const gitDir = join(workspacePath, '.git');
  if (!existsSync(gitDir)) {
    const git = simpleGit(workspacePath);
    await git.init();
    console.log(`[workspace] git init at ${workspacePath}`);
  }

  const gitignorePath = join(workspacePath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
    console.log('[workspace] created .gitignore');
  }
}

export function ensureTaskDir(workspacePath: string, taskId: string): string {
  const taskDir = join(workspacePath, taskId);
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true });
  }
  return taskDir;
}
