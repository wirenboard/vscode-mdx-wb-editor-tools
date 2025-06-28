import * as vscode from 'vscode';
import { WebviewManager } from './webviewManager';

export function activate(context: vscode.ExtensionContext) {
  const webviewManager = new WebviewManager(context);
  webviewManager.initialize();
}

export function deactivate() { }