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

function dedent(html: string): string {
  // убирать любые ведущие пробелы в каждой строке
  return html.replace(/^[ \t]+/gm, '');
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

function renderTemplate(
  tpl: string,
  data: Record<string, any>
): string {
  let output = tpl;

  // 1. Обработка всех блоков {{#each key}}…{{/each}}
  const eachRe = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
  output = output.replace(eachRe, (_match, key: string, block: string) => {
    const arr = Array.isArray(data[key]) ? data[key] as any[] : [];
    return arr
      .map(item => {
        // контекст для подстановки: элемент плюс корневые данные
        const ctx: Record<string, any> = { ...data, ...item };

        // 1.1. локальные if внутри блока
        let part = block.replace(
          /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g,
          (_m2, prop: string, inner: string) =>
            ctx[prop] ? inner : ''
        );

        // 1.2. подстановка всех {{var}}
        part = part.replace(
          /{{(\w+)}}/g,
          (_m3, varName: string) =>
            ctx[varName] != null ? String(ctx[varName]) : ''
        );

        return part;
      })
      .join('');
  });

  // 2. Глобальные условные блоки {{#if key}}…{{/if}} для data.key
  output = output.replace(
    /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g,
    (_match, key: string, inner: string) =>
      data[key] ? inner : ''
  );

  // 3. Обычная подстановка {{var}} из корневого data
  output = output.replace(
    /{{(\w+)}}/g,
    (_m, varName: string) =>
      data[varName] != null ? String(data[varName]) : ''
  );

  return dedent(output).trim();
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
