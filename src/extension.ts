import * as vscode from 'vscode';
import { initializeWebviewManager } from './webviewManager';

export function activate(context: vscode.ExtensionContext) {  
  initializeWebviewManager(context);
}
export function deactivate() {}
