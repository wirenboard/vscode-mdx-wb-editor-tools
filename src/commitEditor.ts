import * as vscode from 'vscode';
import { WebviewManager } from './webviewManager';
import * as path from 'path';
import { StatusResult } from 'simple-git';

export class CommitEditor {
  private readonly webviewManager: WebviewManager;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.webviewManager = new WebviewManager(context);
  }
  public initialize() {
    const commitEditorCommand = vscode.commands.registerCommand(
      'extension.showCommitEditor',
      () => this.showCommitEditor()
    );
    this.context.subscriptions.push(commitEditorCommand);
  }

  private async showCommitEditor() {
    this.webviewManager.showCustomForm('commitMessage');    
  }

  
  async show(status: vscode.SourceControlResourceState[]): Promise<string | undefined> {
    const { panel, onMessage } = this.webviewManager.createFormPanel<{
      command: 'submit' | 'cancel';
      text?: string;
    }>({
      title: 'Commit Message',
      templateName: 'commitEditor',
      values: {
        files: status.map(f => f.resourceUri.fsPath)
      },
      styleFileName: 'commit-editor.css'
    });
  
    return new Promise<string | undefined>((resolve) => {
      let resolved = false;
  
      const complete = (result?: string) => {
        if (!resolved) {
          resolved = true;
          panel.dispose();
          resolve(result);
        }
      };
  
      onMessage(message => {
        switch(message.command) {
          case 'submit':
            if (message.text?.trim()) {
              complete(message.text.trim());
            } else {
              vscode.window.showErrorMessage('Сообщение коммита не может быть пустым');
            }
            break;
          case 'cancel':
            complete();
            break;
        }
      });
  
      panel.onDidDispose(() => complete());
    });
  }

  async showFromStatus(status: StatusResult, repoPath: string): Promise<string | undefined> {
    return this.show(
      status.files.map(f => ({
        resourceUri: vscode.Uri.file(path.join(repoPath, f.path))
      }))
    );
  }
}
