import * as vscode from 'vscode';
import { WebviewManager } from './webviewManager';
import { WBCompletionProvider } from './providers/wbCompletionProvider';
import { WBHoverProvider } from './providers/wbHoverProvider';
import { UpdateManager } from './updateManager';
import { GitManager } from './gitManager';


export function activate(context: vscode.ExtensionContext) {
  const webviewManager = new WebviewManager(context);
  webviewManager.initialize();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      new WBCompletionProvider(),
      ':' // Trigger by colon
    ),
    vscode.languages.registerHoverProvider(
      [
        { language: 'markdown', scheme: 'file' },
        { language: 'yaml', scheme: 'file' }
      ],
      new WBHoverProvider()
    )
  );

  const gitManager = new GitManager(context);
  context.subscriptions.push(gitManager);

  const updater = new UpdateManager(context);
  updater.checkForUpdates();
}

export function deactivate() { }