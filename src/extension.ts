import * as vscode from 'vscode';

import { clearGitHubToken, getGitHubToken } from './auth';
import { fetchCopilotModels } from './models';
import { CopilotLanguageModelProvider } from './provider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('GitHub Copilot');
  context.subscriptions.push(output);
  output.appendLine('[copilot-models-antigravity] Extension activated.');
  const provider = new CopilotLanguageModelProvider([], context);
  const lmDisposable = (vscode.lm as any).registerLanguageModelChatProvider('copilot', provider) as vscode.Disposable;
  context.subscriptions.push(provider, lmDisposable);

  const formatError = (err: unknown): string => {
    if (err instanceof Error) {
      return err.stack ?? err.message;
    }

    return String(err);
  };

  const log = (message: string, err?: unknown) => {
    output.appendLine(`[copilot-models-antigravity] ${message}`);
    if (err !== undefined) {
      output.appendLine(formatError(err));
    }
  };

  const registerModels = async () => {
    try {
      await getGitHubToken(context);
    } catch {
      provider.updateModels([]);
      log('No token available — waiting for Sign In.');
      return;
    }

    try {
      const models = await fetchCopilotModels(context);
      if (models.length === 0) {
        provider.updateModels([]);
        log('No chat models returned.');
        return;
      }

      provider.updateModels(models);

      log(`Registered ${models.length} model(s): ${models.map(m => m.id).join(', ')}`);
    } catch (err) {
      provider.updateModels([]);
      log(`Failed to register models: ${(err as Error).message}`, err);
      void vscode.window.showErrorMessage(
        `GitHub Copilot: could not load models — ${(err as Error).message}`
      );
      output.show(true);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-models.signIn', async () => {
      try {
        await getGitHubToken(context);
        log('Sign in succeeded.');
        void vscode.window.showInformationMessage('GitHub Copilot: signed in successfully.');
        await registerModels();
      } catch (err) {
        log(`Sign in failed: ${(err as Error).message}`, err);
        output.show(true);
        const message = `GitHub Copilot: sign in failed — ${(err as Error).message}`;
        void vscode.window.showErrorMessage(message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-models.signOut', async () => {
      await clearGitHubToken(context);
      provider.updateModels([]);
      log('Signed out.');
      void vscode.window.showInformationMessage('GitHub Copilot: signed out.');
    })
  );

  await registerModels();
}

export function deactivate(): void {
  // VS Code disposes context.subscriptions automatically.
}
