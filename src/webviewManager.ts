import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MarkdownRenderer } from './renderer';

export class WebviewManager {
  private previewPanel: vscode.WebviewPanel | undefined;
  private previewDocumentUri: vscode.Uri | undefined;
  private readonly renderer: MarkdownRenderer;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.renderer = new MarkdownRenderer(context);
    this.setupWebviewListeners();
  }

    private loadStyles(context: vscode.ExtensionContext): string {
      try {
        return fs.readFileSync(
          path.join(context.extensionPath, 'media', 'styles.css'),
          'utf8'
        );
      } catch (error) {
        console.error('Error loading styles:', error);
        return '';
      }
    }

  public initialize() {
    const previewCommand = vscode.commands.registerCommand(
      'vscode-mdx-wb-editor-tools.showPreview',
      () => this.showPreview()
    );
    this.context.subscriptions.push(previewCommand);
  }

  public showPreview() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Нет открытого MD-файла');
      return;
    }
    this.createPreviewPanel(editor.document);
  }

  public showCustomForm(title: string) {
    this.createBasicPreviewPanel(title);
  }  

  private setupWebviewListeners() {
    this.context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.previewPanel && this.previewDocumentUri?.toString() === document.uri.toString()) {
          this.updateWebviewContentFromUri(document.uri);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && this.previewPanel) {
          const doc = editor.document;
          this.previewDocumentUri = doc.uri;
          this.previewPanel.title = `Preview: ${path.basename(doc.fileName)}`;
          this.previewPanel.reveal(vscode.ViewColumn.Beside, true);
          this.updateWebviewContentFromUri(doc.uri);
        }
      })
    );

    const cssWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        path.join(this.context.extensionPath, 'media'),
        '*.css'
      )
    );
    cssWatcher.onDidChange(() => {
      this.updateWebviewContentFromUri(this.previewDocumentUri);
    });
    this.context.subscriptions.push(cssWatcher);
  }

  private createBasicPreviewPanel(title: string) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.previewPanel = vscode.window.createWebviewPanel(
      'mdxPreview',
      `Preview: ${title}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(ws ?? '', 'public')),
          vscode.Uri.file(path.join(ws ?? '', 'content'))
        ]
      }
    );

    this.previewPanel.onDidDispose(() => {
      this.previewPanel = undefined;
      this.previewDocumentUri = undefined;
    });
  }

  private createPreviewPanel(document: vscode.TextDocument) {
    this.createBasicPreviewPanel(path.basename(document.fileName));
    this.previewDocumentUri = document.uri;
    this.updateWebviewContentFromUri(document.uri);
  }

  private updateWebviewContent(document: vscode.TextDocument) {
    if (!this.previewPanel) return;

    try {
      this.previewPanel.webview.html = this.renderer.render(
        document.getText(),
        this.previewPanel.webview,
        document.uri,
        this.loadStyles(this.context)
      );
    } catch (error) {
      console.error('Preview update error:', error);
    }
  }

  private updateWebviewContentFromUri(uri: vscode.Uri | undefined) {
    if (!uri) return;
    vscode.workspace
      .openTextDocument(uri)
      .then(doc => this.updateWebviewContent(doc));
  }
}
