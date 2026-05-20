import * as vscode from 'vscode';
import { execSync } from 'child_process';

const SECRET_KEY = 'github-token';

/**
 * Get a GitHub OAuth token.
 * Strategy:
 *   1. Check SecretStorage (previously saved token)
 *   2. Fall back to `gh auth token` (GitHub CLI)
 * Throws if no token is available.
 */
export async function getGitHubToken(context: vscode.ExtensionContext): Promise<string> {
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored) {
    return stored;
  }

  try {
    const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
    if (token) {
      await context.secrets.store(SECRET_KEY, token);
      return token;
    }
  } catch {
    // gh not available or not authenticated
  }

  throw new Error('No GitHub token available. Run `gh auth login` in your terminal first.');
}

/** Clear the stored token (sign out). */
export async function clearGitHubToken(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
}
