import * as vscode from 'vscode';
import * as path from 'path';
import { renderWithComponents } from './renderer';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocumentUri: vscode.Uri | undefined;


export function initializeWebviewManager(context: vscode.ExtensionContext) {
  setupWebviewListeners(context);

  const previewCommand = vscode.commands.registerCommand(
    'mdx-preview.showPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Нет открытого MD-файла');
        return;
      }
      createPreviewPanel(editor.document, context);
    }
  );
  context.subscriptions.push(previewCommand);
}

function setupWebviewListeners(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const stylePath = path.join(context.extensionPath, 'media', 'styles.css');
      const isStyleChange = document.uri.fsPath === stylePath;
      if (previewPanel && (isStyleChange || previewDocumentUri?.toString() === document.uri.toString())) {
        updateWebviewContentFromUri(
          isStyleChange ? previewDocumentUri : document.uri,
          context
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && previewPanel) {
        const doc = editor.document;
        previewDocumentUri = doc.uri;
        previewPanel.title = `Preview: ${path.basename(doc.fileName)}`;
        previewPanel.reveal(vscode.ViewColumn.Beside, true);
        updateWebviewContentFromUri(doc.uri, context);
      }
    })
  );

  const cssWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      path.join(context.extensionPath, 'media'),
      'styles.css'
    )
  );
  cssWatcher.onDidChange(() => {
    updateWebviewContentFromUri(previewDocumentUri, context);
  });
  context.subscriptions.push(cssWatcher);
}

export function createPreviewPanel(document: vscode.TextDocument, context: vscode.ExtensionContext) {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  previewPanel = vscode.window.createWebviewPanel(
    'mdxPreview',
    `Preview: ${path.basename(document.fileName)}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(ws ?? '', 'public')),
        vscode.Uri.file(path.join(ws ?? '', 'content'))
      ]
    }
  );

  previewPanel.onDidDispose(() => {
    previewPanel = undefined;
    previewDocumentUri = undefined;
  });

  previewDocumentUri = document.uri;
  updateWebviewContentFromUri(document.uri, context);
}

function updateWebviewContent(document: vscode.TextDocument, context: vscode.ExtensionContext) {
  if (!previewPanel) return;
 
  try {
    previewPanel.webview.html = renderWithComponents(
      document.getText(),
      previewPanel.webview,
      document.uri,
      context
    );
  } catch (error) {
    console.error('Preview update error:', error);
  }
}

export function updateWebviewContentFromUri(uri: vscode.Uri | undefined, context: vscode.ExtensionContext) {
  if (!uri) return;
  vscode.workspace
    .openTextDocument(uri)
    .then(doc => updateWebviewContent(doc, context));
}
