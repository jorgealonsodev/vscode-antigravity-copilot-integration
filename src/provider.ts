import * as vscode from 'vscode';

import { getGitHubToken } from './auth';
import { buildHeaders } from './headers';
import type { CopilotModel } from './models';

interface OpenAIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SSEChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
}

function toOpenAIMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    let content = '';

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        content += part.value;
      }
    }

    return {
      role:
        message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
      content,
    };
  });
}

function createLanguageModelError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export class CopilotLanguageModelProvider
  implements vscode.LanguageModelChatProvider<CopilotModel>
{
  private readonly onDidChangeLanguageModelChatInformationEmitter =
    new vscode.EventEmitter<void>();

  readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeLanguageModelChatInformationEmitter.event;

  constructor(
    private models: readonly CopilotModel[],
    private readonly context: vscode.ExtensionContext
  ) {}

  dispose(): void {
    this.onDidChangeLanguageModelChatInformationEmitter.dispose();
  }

  updateModels(models: readonly CopilotModel[]): void {
    this.models = models;
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
  }

  private getDefaultModelIndex(): number {
    const preferredIds = ['claude-sonnet-4.6', 'gpt-4o'];

    for (const preferredId of preferredIds) {
      const exactMatchIndex = this.models.findIndex((model) => model.id === preferredId);
      if (exactMatchIndex >= 0) {
        return exactMatchIndex;
      }

      const prefixMatchIndex = this.models.findIndex((model) => model.id.startsWith(preferredId));
      if (prefixMatchIndex >= 0) {
        return prefixMatchIndex;
      }
    }

    return 0;
  }

  provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<CopilotModel[]> {
    const defaultModelIndex = this.getDefaultModelIndex();

    return this.models.map((model, index) =>
      ({
        id: model.id,
        name: model.name,
        family: model.family ?? model.id,
        version: model.version ?? '1',
        maxInputTokens: model.maxInputTokens ?? 8192,
        maxOutputTokens: model.maxOutputTokens ?? 4096,
        tooltip: model.id,
        detail: 'GitHub Copilot',
        capabilities: {
          toolCalling: true,
          imageInput: false,
        },
        vendor: model.vendor,
        isUserSelectable: true,
        isDefault: index === defaultModelIndex,
      }) as any
    );
  }

  async provideLanguageModelChatResponse(
    model: CopilotModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    let githubToken: string;
    try {
      githubToken = await getGitHubToken(this.context);
    } catch (error) {
      throw createLanguageModelError((error as Error).message, 'AuthError');
    }

    if (token.isCancellationRequested) {
      return;
    }

    const controller = new AbortController();
    const cancellationSubscription = token.onCancellationRequested(() => controller.abort());

    try {
      const res = await fetch('https://api.githubcopilot.com/chat/completions', {
        method: 'POST',
        headers: buildHeaders(githubToken),
        body: JSON.stringify({
          model: model.id,
          messages: toOpenAIMessages(messages),
          stream: true,
          max_tokens: options.modelOptions?.['max_tokens'] ?? model.maxOutputTokens,
          temperature: options.modelOptions?.['temperature'] ?? 0.2,
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        throw createLanguageModelError(
          'Copilot authentication expired. Please retry.',
          'AuthExpired'
        );
      }

      if (!res.ok) {
        throw createLanguageModelError(
          `Copilot API error: ${res.status} ${res.statusText}`,
          'ApiError'
        );
      }

      if (!res.body) {
        throw createLanguageModelError('Empty response body from Copilot API', 'EmptyResponse');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          if (token.isCancellationRequested) {
            await reader.cancel();
            return;
          }

          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) {
              continue;
            }

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              return;
            }

            let chunk: SSEChunk;
            try {
              chunk = JSON.parse(data) as SSEChunk;
            } catch {
              continue;
            }

            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              progress.report(new vscode.LanguageModelTextPart(content));
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted || token.isCancellationRequested) {
          return;
        }

        throw createLanguageModelError(`Stream error: ${(error as Error).message}`, 'StreamError');
      }
    } catch (error) {
      if (controller.signal.aborted || token.isCancellationRequested) {
        return;
      }

      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw createLanguageModelError(`Network error: ${(error as Error).message}`, 'NetworkError');
    } finally {
      cancellationSubscription.dispose();
    }
  }

  async provideTokenCount(
    _model: CopilotModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') {
      return Math.ceil(text.length / 4);
    }

    let total = 0;
    for (const part of text.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        total += Math.ceil(part.value.length / 4);
      }
    }

    return total;
  }
}
