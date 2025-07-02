import * as vscode from 'vscode';
import { WebviewManager } from './webviewManager';
import { TemplateManager } from './templateManager';
import * as path from 'path';
import * as fs from 'fs';
import Handlebars from 'handlebars';
import { StatusResult } from 'simple-git';

export class CommitEditor {
  private readonly webviewManager: WebviewManager;
  private readonly templateManager: TemplateManager;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.webviewManager = new WebviewManager(context);
    this.templateManager = new TemplateManager(context);
    Handlebars.registerPartial('styles', fs.readFileSync(path.join(this.templateManager.getMediaDir(), 'commit-editor.css'), 'utf8'));
    
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
    const panel = vscode.window.createWebviewPanel(
      'commitMessage',
      'Commit Message',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.templateManager.getTemplates().commitEditor({
      files: status.map(f => f.resourceUri.fsPath)
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

      panel.webview.onDidReceiveMessage(message => {
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
