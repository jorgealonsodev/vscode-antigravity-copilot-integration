import * as vscode from 'vscode';

import { getGitHubToken } from './auth';
import { buildHeaders } from './headers';

interface RawCopilotModel {
  id: string;
  name?: string;
  vendor?: string;
  version?: string;
  family?: string;
  capabilities?: {
    type?: string;
    limits?: {
      max_prompt_tokens?: number;
      max_output_tokens?: number;
    };
  };
}

export interface CopilotModel extends vscode.LanguageModelChatInformation {
  vendor: string;
}

export function normalizeCopilotModels(rawModels: RawCopilotModel[]): CopilotModel[] {
  return rawModels
    .filter((model) => model.capabilities?.type === 'chat' || !model.capabilities?.type)
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      vendor: model.vendor ?? 'github',
      version: model.version ?? '1',
      family: model.family ?? model.id,
      maxInputTokens: model.capabilities?.limits?.max_prompt_tokens ?? 8192,
      maxOutputTokens: model.capabilities?.limits?.max_output_tokens ?? 4096,
      capabilities: {
        toolCalling: false,
      },
    }));
}

/** Fetch available Copilot chat models. */
export async function fetchCopilotModels(context: vscode.ExtensionContext): Promise<CopilotModel[]> {
  const token = await getGitHubToken(context);
  const headers = buildHeaders(token);

  const res = await fetch('https://api.githubcopilot.com/models', { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch Copilot models: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { data?: RawCopilotModel[] };
  return normalizeCopilotModels(data.data ?? []);
}
