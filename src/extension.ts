import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocUri: vscode.Uri | undefined;

let mainTpl: string;
let photoTpl: string;
let galleryTpl: string;

// Загрузка шаблонов один раз
export function activate(context: vscode.ExtensionContext) {
  const tdir = path.join(context.extensionPath, 'templates');
  mainTpl    = fs.readFileSync(path.join(tdir, 'main.html'), 'utf8');
  photoTpl   = fs.readFileSync(path.join(tdir, 'photo.html'), 'utf8');
  galleryTpl = fs.readFileSync(path.join(tdir, 'gallery.html'), 'utf8');

  // Авто-обновление по сохранению
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (previewPanel && previewDocUri?.toString() === doc.uri.toString()) {
        updatePreview(doc, context);
      }
    })
  );

  // Команда предпросмотра
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

type Renderer = (
  attrs: Record<string,string>,
  webview: vscode.Webview,
  docUri: vscode.Uri
) => string;

const renderers: Record<string, Renderer> = {
  photo: (attrs, webview, docUri) => {
    const src     = attrs.src ?? '';
    const caption = attrs.caption ?? '';
    const width   = attrs.width ? (attrs.width.endsWith('%') ? attrs.width : `${parseInt(attrs.width,10)}px`) : '';
    const float   = attrs.float ?? 'none';

    const imgPath = vscode.Uri.joinPath(docUri, '..', src);
    const uri     = webview.asWebviewUri(imgPath).toString();

    const captionBlock = caption
      ? `<figcaption class="mdx-photo-caption">${caption}</figcaption>`
      : '';

    return renderTemplate(photoTpl, {
      src: uri,
      captionBlock,
      width,
      float
    });
  },

  gallery: (attrs, webview, docUri) => {
    let items: [string,string][];
    try {
      items = JSON.parse(attrs.data ?? '[]');
    } catch {
      return '<p><em>Invalid gallery data</em></p>';
    }
    const html = items.map(([src,cap]) => {
      const imgPath = vscode.Uri.joinPath(docUri, '..', src);
      const uri     = webview.asWebviewUri(imgPath).toString();
      return `<figure>
  <img src="${uri}" loading="lazy" />
  <figcaption>${cap}</figcaption>
</figure>`;
    }).join('\n');
    return renderTemplate(galleryTpl, { items: html });
  }
};

// Универсальный рендер шаблона
function renderTemplate(tpl: string, data: Record<string,string>): string {
  let result = tpl;
  for (const [key, val] of Object.entries(data)) {
    // global replace via RegExp, безопасно для любых версий TS/JS
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), val);
  }
  return result;
}

// Препроцессинг MD — вставляем HTML-компоненты
function preprocess(
  text: string,
  webview: vscode.Webview,
  docUri: vscode.Uri
): string {
  return text.replace(/:(\w+)\{([\s\S]*?)\}/g, (_m,name,inner) => {
    const R = renderers[name];
    if (!R) return _m;
    const attrs: Record<string,string> = {};
    for (const [,key,v1,v2] of inner.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[key] = v1 ?? v2 ?? '';
    }
    return R(attrs, webview, docUri);
  });
}

// Собираем финальную страницу
function renderWithComponents(
  md: string,
  webview: vscode.Webview,
  docUri: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const processed = preprocess(md, webview, docUri);
  const body      = new MarkdownIt({ html: true }).render(processed);
  const styles    = fs.readFileSync(
    path.join(context.extensionPath, 'media', 'styles.css'),
    'utf8'
  );
  return mainTpl
    .replace('{{styles}}', styles)
    .replace('{{content}}', body);
}

export function deactivate() {}
