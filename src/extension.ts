import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import * as Handlebars from 'handlebars';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocumentUri: vscode.Uri | undefined;

let mainTemplate: HandlebarsTemplateDelegate;
let photoTemplate: HandlebarsTemplateDelegate;
let galleryTemplate: HandlebarsTemplateDelegate;
let videoPlayerTemplate: HandlebarsTemplateDelegate;
let videoGalleryTemplate: HandlebarsTemplateDelegate

export function activate(context: vscode.ExtensionContext) {
  const templatesDir = path.join(context.extensionPath, 'templates');
  mainTemplate = Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'main.html'), 'utf8'));
  photoTemplate = Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'photo.html'), 'utf8'));
  galleryTemplate = Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'gallery.html'), 'utf8'));
  videoPlayerTemplate = Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'video-player.html'), 'utf8'));
  videoGalleryTemplate = Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'video-gallery.html'), 'utf8'));

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (previewPanel && previewDocumentUri?.toString() === document.uri.toString()) {
        updatePreview(document, context);
      }
    })
  );

  const previewCommand = vscode.commands.registerCommand(
    'mdx-preview.showPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Нет открытого MD-файла');
        return;
      }
      previewDocumentUri = editor.document.uri;
      previewPanel = vscode.window.createWebviewPanel(
        'mdxPreview',
        'MDX Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(previewDocumentUri, '..'),
            vscode.Uri.file(path.join(context.extensionPath, 'media')),
            vscode.Uri.file(path.join(context.extensionPath, 'templates'))
          ]
        }
      );
      updatePreview(editor.document, context);
    }
  );
  context.subscriptions.push(previewCommand);
}

function updatePreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
  if (!previewPanel) return;
  previewPanel.webview.html = renderWithComponents(
    document.getText(),
    previewPanel.webview,
    document.uri,
    context
  );
}

type ComponentRenderer = (
  attributes: Record<string, string>,
  webview: vscode.Webview,
  documentUri: vscode.Uri
) => string;

/**
 * Преобразует относительный путь в абсолютный URI для использования в WebView.
 * Если передан пустой путь, возвращает пустую строку.
 *
 * @param webview - Экземпляр WebView, для которого генерируется URI
 * @param documentUri - URI документа, относительно которого вычисляется путь
 * @param relativePath - Относительный путь к ресурсу
 * @returns Строковое представление URI ресурса или пустая строка
 */
function resolveRelativePath(webview: vscode.Webview, documentUri: vscode.Uri, relativePath: string): string {
  return relativePath
    ? webview.asWebviewUri(vscode.Uri.joinPath(documentUri, '..', relativePath)).toString()
    : '';
}

const componentRenderers: Record<string, ComponentRenderer> = {
  photo: (attrs, webview, docUri) => {
    return photoTemplate({
      src: resolveRelativePath(webview, docUri, attrs.src),
      alt: attrs.alt || '',
      caption: attrs.caption,
      width: attrs.width,
      floatClass: attrs.float ? `float-${attrs.float}` : ''
    });
  },

  gallery: (attrs, webview, docUri) => {
    const rawImages = JSON.parse(attrs.data || '[]');
    const images = rawImages.map(([src, alt]: [string, string]) => ({
      src: resolveRelativePath(webview, docUri, src),
      alt: alt || '',
      caption: alt
    }));
    return galleryTemplate({ images });
  },

  'video-player': (attrs, webview, docUri) => {
    return videoPlayerTemplate({
      url: attrs.url,
      width: normalizeSize(attrs.width, '500px'),
      height: normalizeSize(attrs.height, '280px'),
      floatClass: attrs.float ? `float-${attrs.float}` : '',
      cover: attrs.cover ? resolveRelativePath(webview, docUri, attrs.cover) : '',
      coverIsSet: !!attrs.cover
    });
  },

  'video-gallery': (attrs, webview, docUri) => {
    try {
      const rawItems = JSON.parse(attrs.data || '[]') as Array<[string, string, string?]>;
      const videos = rawItems.map(([url, caption, cover]) => ({
        url: String(url),
        caption: caption ? String(caption) : '',
        cover: cover ? resolveRelativePath(webview, docUri, String(cover)) : '',
        coverIsSet: !!cover
      }));
      return videoGalleryTemplate({ videos });
    } catch (error) {
      console.error('Invalid video gallery data:', error);
      return videoGalleryTemplate({ videos: [] });
    }
  }
};


function normalizeSize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /\d$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function preprocessMarkdown(
  text: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri
): string {
  return text.replace(/:([\w-]+)\{([\s\S]*?)\}/g, (_match, componentName, inner) => {
    const renderer = componentRenderers[componentName];
    if (!renderer) return _match;

    const attributes: Record<string, string> = {};
    for (const match of inner.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*))/g)) {
      const [, key, doubleQuoted, singleQuoted, unquoted] = match;
      attributes[key] = (doubleQuoted ?? singleQuoted ?? unquoted).trim();
    }
    return renderer(attributes, webview, documentUri);
  });
}

function renderWithComponents(
  markdown: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const processedMarkdown = preprocessMarkdown(markdown, webview, documentUri);
  const renderedBody = new MarkdownIt({ html: true }).render(processedMarkdown);
  const styles = fs.readFileSync(
    path.join(context.extensionPath, 'media', 'styles.css'),
    'utf8'
  );
  
  // Используем тройные фигурные скобки в шаблоне для raw HTML
  return mainTemplate({
    styles: styles,
    content: new Handlebars.SafeString(renderedBody) // Помечаем как безопасный HTML
  });
}

export function deactivate() { }