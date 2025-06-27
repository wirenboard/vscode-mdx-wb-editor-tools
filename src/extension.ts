import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocUri: vscode.Uri | undefined;

let mainTpl: string;
let photoTpl: string;
let galleryTpl: string;

export function activate(context: vscode.ExtensionContext) {
  const tdir = path.join(context.extensionPath, 'templates');
  mainTpl = fs.readFileSync(path.join(tdir, 'main.html'), 'utf8');
  photoTpl = fs.readFileSync(path.join(tdir, 'photo.html'), 'utf8');
  galleryTpl = fs.readFileSync(path.join(tdir, 'gallery.html'), 'utf8');

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (previewPanel && previewDocUri?.toString() === doc.uri.toString()) {
        updatePreview(doc, context);
      }
    })
  );

  const cmd = vscode.commands.registerCommand(
    'mdx-preview.showPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Нет открытого MD-файла');
        return;
      }
      previewDocUri = editor.document.uri;
      previewPanel = vscode.window.createWebviewPanel(
        'mdxPreview',
        'MDX Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(previewDocUri, '..'),
            vscode.Uri.file(path.join(context.extensionPath, 'media')),
            vscode.Uri.file(path.join(context.extensionPath, 'templates'))
          ]
        }
      );
      updatePreview(editor.document, context);
    }
  );
  context.subscriptions.push(cmd);
}

function updatePreview(doc: vscode.TextDocument, context: vscode.ExtensionContext) {
  if (!previewPanel) return;
  previewPanel.webview.html = renderWithComponents(
    doc.getText(),
    previewPanel.webview,
    doc.uri,
    context
  );
}

type ComponentRenderer = (
  attrs: Record<string, string>,
  webview: vscode.Webview,
  docUri: vscode.Uri
) => string;

const renderers: Record<string, ComponentRenderer> = {
  photo: (attrs, webview, docUri) => {
    const srcUri = attrs.src
      ? webview.asWebviewUri(vscode.Uri.joinPath(docUri, '..', attrs.src)).toString()
      : '';
    return renderTemplate(photoTpl, {
      src: srcUri,
      alt: attrs.alt || '',
      caption: attrs.caption,
      style: attrs.width ? `style="width:${attrs.width}"` : '',
      floatClass: attrs.float ? `float-${attrs.float}` : ''
    });
  },
  gallery: (attrs, webview, docUri) => {
    const rawImages = JSON.parse(attrs.data || '[]');
    const images = rawImages.map((img: any) => ({
      src: img[0] ? webview.asWebviewUri(vscode.Uri.joinPath(docUri, '..', img[0])).toString() : '',
      alt: img[1] || '',
      caption: img[1] || '' // Подпись берется из второго элемента массива
    }));
    return renderTemplate(galleryTpl, { images });
  }
};

function renderTemplate(tpl: string, data: Record<string, any>): string {
  let result = tpl;

  result = result.replace(/{{#each (\w+)}}([\s\S]*?){{\/each}}/g, (_, key, content) => {
    const items = data[key] || [];
    return items.map((item: any) => {
      let html = content;
      for (const [k, v] of Object.entries(item)) {
        html = html.replace(new RegExp(`{{${k}}}`, 'g'), v);
      }
      return html;
    }).join('');
  });

  result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (_, key, content) =>
    data[key] ? content : ''
  );

  for (const [key, val] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), val);
  }

  return result;
}

function preprocess(
  text: string,
  webview: vscode.Webview,
  docUri: vscode.Uri
): string {
  return text.replace(/:(\w+)\{([\s\S]*?)\}/g, (_m, name, inner) => {
    const renderer = renderers[name];
    if (!renderer) return _m;
    const attrs: Record<string, string> = {};
    for (const [, key, v1, v2] of inner.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[key] = v1 ?? v2 ?? '';
    }
    return renderer(attrs, webview, docUri);
  });
}

function renderWithComponents(
  md: string,
  webview: vscode.Webview,
  docUri: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const processed = preprocess(md, webview, docUri);
  const body = new MarkdownIt({ html: true }).render(processed);
  const styles = fs.readFileSync(
    path.join(context.extensionPath, 'media', 'styles.css'),
    'utf8'
  );
  return mainTpl
    .replace('{{styles}}', styles)
    .replace('{{content}}', body);
}

export function deactivate() { }
