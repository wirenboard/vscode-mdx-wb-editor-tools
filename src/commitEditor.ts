import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { StatusResult } from 'simple-git';

export class CommitEditor {
  private readonly template: Handlebars.TemplateDelegate;

  constructor(private context: vscode.ExtensionContext) {
    const htmlPath = path.join(context.extensionPath, 'templates/commit-editor.html');
    const cssPath = path.join(context.extensionPath, 'templates/commit-editor.css');
    
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const css = fs.readFileSync(cssPath, 'utf-8');
    
    this.template = Handlebars.compile(html);
    Handlebars.registerPartial('styles', css);
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

    const script = `
      const vscode = acquireVsCodeApi();
      document.getElementById('submit').addEventListener('click', () => {
        const text = document.querySelector('textarea').value;
        vscode.postMessage({ command: 'submit', text });
      });
      document.getElementById('cancel').addEventListener('click', () => {
        vscode.postMessage({ command: 'cancel' });
      });
    `;

    panel.webview.html = this.template({
      files: status.map(f => f.resourceUri.fsPath)
    }).replace('</body>', `<script>${script}</script></body>`);

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
