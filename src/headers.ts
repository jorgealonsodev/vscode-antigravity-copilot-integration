import * as vscode from 'vscode';

export function buildHeaders(githubToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${githubToken}`,
    'Copilot-Integration-Id': 'vscode-chat',
    'VScode-SessionId': vscode.env.sessionId,
    'VScode-MachineId': vscode.env.machineId,
    'Editor-Version': `vscode/${vscode.version}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}
