import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownRenderer } from './renderer';

export class WebviewManager {
  private previewPanel: vscode.WebviewPanel | undefined;
  private previewDocumentUri: vscode.Uri | undefined;
  private readonly renderer: MarkdownRenderer;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.renderer = new MarkdownRenderer(context);
    this.setupWebviewListeners();
  }

  public initialize() {
    const previewCommand = vscode.commands.registerCommand(
      'vscode-mdx-wb-editor-tools.showPreview',
      () => this.showPreview()
    );
    this.context.subscriptions.push(previewCommand);
  }

  private showPreview() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Нет открытого MD-файла');
      return;
    }
    this.createPreviewPanel(editor.document);
  }

  private setupWebviewListeners() {
    this.context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        const stylePath = path.join(this.context.extensionPath, 'media', 'styles.css');
        const isStyleChange = document.uri.fsPath === stylePath;
        if (this.previewPanel && (isStyleChange || this.previewDocumentUri?.toString() === document.uri.toString())) {
          this.updateWebviewContentFromUri(
            isStyleChange ? this.previewDocumentUri : document.uri
          );
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
        'styles.css'
      )
    );
    cssWatcher.onDidChange(() => {
      this.updateWebviewContentFromUri(this.previewDocumentUri);
    });
    this.context.subscriptions.push(cssWatcher);
  }

  private createPreviewPanel(document: vscode.TextDocument) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const localResourceRoots = [
          vscode.Uri.file(path.join(ws ?? '', 'public')),
      vscode.Uri.file(path.join(ws ?? '', 'content')),
      vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
    ];

    if (process.platform === 'darwin') {
      localResourceRoots.push(
        vscode.Uri.file('/'),
        vscode.Uri.file(path.dirname(document.uri.fsPath))
      );
  }

    this.previewPanel = vscode.window.createWebviewPanel(
      'mdxPreview',
      `Preview: ${path.basename(document.fileName)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots,
        enableCommandUris: true
      }
    );

    this.previewPanel.onDidDispose(() => {
      this.previewPanel = undefined;
      this.previewDocumentUri = undefined;
    });

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
        this.context
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
