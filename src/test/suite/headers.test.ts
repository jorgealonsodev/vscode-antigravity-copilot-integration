import * as assert from 'assert';
import * as vscode from 'vscode';

import { buildHeaders } from '../../headers';

suite('buildHeaders', () => {
  test('includes all required headers', () => {
    const token = 'test-copilot-token';
    const headers = buildHeaders(token);

    assert.strictEqual(headers.Authorization, `Bearer ${token}`);
    assert.strictEqual(headers['Copilot-Integration-Id'], 'vscode-chat');
    assert.strictEqual(headers['VScode-SessionId'], vscode.env.sessionId);
    assert.strictEqual(headers['VScode-MachineId'], vscode.env.machineId);
    assert.strictEqual(headers['Editor-Version'], `vscode/${vscode.version}`);
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers.Accept, 'application/json');
  });
});
