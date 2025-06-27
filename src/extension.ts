import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocumentUri: vscode.Uri | undefined;

let mainTemplate: string;
let photoTemplate: string;
let galleryTemplate: string;
let videoPlayerTemplate: string;

export function activate(context: vscode.ExtensionContext) {
  const templatesDir = path.join(context.extensionPath, 'templates');
  mainTemplate = fs.readFileSync(path.join(templatesDir, 'main.html'), 'utf8');
  photoTemplate = fs.readFileSync(path.join(templatesDir, 'photo.html'), 'utf8');
  galleryTemplate = fs.readFileSync(path.join(templatesDir, 'gallery.html'), 'utf8');
  videoPlayerTemplate = fs.readFileSync(path.join(templatesDir, 'video-player.html'), 'utf8');

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

function dedent(html: string): string {
  return html.replace(/^[ \t]+/gm, '');
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
  photo: (attributes, webview, documentUri) => {
    const imageSource = resolveRelativePath(webview, documentUri, attributes.src);
    return renderTemplate(photoTemplate, {
      src: imageSource,
      alt: attributes.alt || '',
      caption: attributes.caption,
      style: attributes.width ? `style="width:${attributes.width}"` : '',
      floatClass: attributes.float ? `float-${attributes.float}` : ''
    });
  },
  gallery: (attributes, webview, documentUri) => {
    const rawImages = JSON.parse(attributes.data || '[]');
    const images = rawImages.map((image: any) => ({
      src: resolveRelativePath(webview, documentUri, image[0]),
      alt: image[1] || '',
      caption: image[1] || ''
    }));
    return renderTemplate(galleryTemplate, { images });
  },
  'video-player': (attrs: Record<string, string>, webview: vscode.Webview, docUri: vscode.Uri) => {
    const width = attrs.width || '500px';
    const height = attrs.height || '280px';
    const floatClass = attrs.float ? `float-${attrs.float}` : '';

    return renderTemplate(videoPlayerTemplate, {
      url: attrs.url,
      width: width.includes('%') ? width : `${parseInt(width)}px`,
      height: height.includes('%') ? height : `${parseInt(height)}px`,
      floatClass,
      cover: attrs.cover ? resolveRelativePath(webview, docUri, attrs.cover) : ''
    });
  }  
};

function renderTemplate(
  template: string,
  data: Record<string, any>
): string {
  let output = template;

  // Обработка блоков {{#each key}}…{{/each}}
  const eachPattern = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
  output = output.replace(eachPattern, (_match, key: string, block: string) => {
    const items = Array.isArray(data[key]) ? data[key] as any[] : [];
    return items
      .map(item => {
        const context = { ...data, ...item };

        // Обработка if-else внутри each
        let processedBlock = block.replace(
          /{{#if\s+(\w+)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g,
          (_ifMatch, property: string, ifBlock: string, elseBlock: string) =>
            context[property] ? ifBlock : (elseBlock || '')
        );

        processedBlock = processedBlock.replace(
          /{{(\w+)}}/g,
          (_varMatch, variableName: string) =>
            context[variableName] != null ? String(context[variableName]) : ''
        );

        return processedBlock;
      })
      .join('');
  });

  // Обработка if-else в основном шаблоне
  output = output.replace(
    /{{#if\s+(\w+)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g,
    (_match, key: string, ifBlock: string, elseBlock: string) =>
      data[key] ? ifBlock : (elseBlock || '')
  );

  output = output.replace(
    /{{(\w+)}}/g,
    (_match, variableName: string) =>
      data[variableName] != null ? String(data[variableName]) : ''
  );

  return dedent(output).trim();
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
  return mainTemplate
    .replace('{{styles}}', styles)
    .replace('{{content}}', renderedBody);
}

export function deactivate() { }