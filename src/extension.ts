import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { initializeTemplates, Templates } from './templateManager';
import { initializeWebviewManager } from './webviewManager';

let templates: Templates;
export function activate(context: vscode.ExtensionContext) {
  templates = initializeTemplates(context);
  initializeWebviewManager(context);
}

type ComponentRenderer = (
  attributes: Record<string, string>,
  webview: vscode.Webview,
  documentUri: vscode.Uri
) => string;

function resolveRelativePath(
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  relativePath: string
): string {
  if (!relativePath) return '';

  if (/^\/?img\//.test(relativePath)) {
    const assetPath = relativePath.replace(/^\/?img\//, '');
    const wf = vscode.workspace.workspaceFolders?.[0];
    if (!wf) {
      console.error('No workspace folder to resolve /img path');
      return '';
    }
    const absFs = path.join(wf.uri.fsPath, 'public', 'img', assetPath);
    const fileUri = vscode.Uri.file(absFs);
    return webview.asWebviewUri(fileUri).toString();
  }

  const docFs = documentUri.fsPath;
  const docDir = path.dirname(docFs);
  const absFs = path.join(docDir, relativePath);
  const fileUri = vscode.Uri.file(absFs);
  return webview.asWebviewUri(fileUri).toString();
}

const componentRenderers: Record<string, ComponentRenderer> = {
  photo: (attrs, webview, docUri) => {
    return templates.photo({
      src: resolveRelativePath(webview, docUri, attrs.src),
      alt: attrs.alt || '',
      caption: attrs.caption,
      width: normalizeSize(attrs.width, '100%'),
      floatClass: attrs.float ? `float-${attrs.float}` : '',
      error: null
    });
  },

  gallery: (attrs, webview, docUri) => {
    try {
      const rawImages = JSON.parse(attrs.data || '[]');
      const images = rawImages.map(([src, alt]: [string, string]) => ({
        src: resolveRelativePath(webview, docUri, src),
        alt: alt || '',
        caption: alt
      }));
      return templates.gallery({ images, error: null });
    } catch (error) {
      console.error('Gallery component error:', error);
      return templates.gallery({
        error: 'Invalid gallery data format'
      });
    }
  },

  'video-player': (attrs, webview, docUri) => {
    return templates.videoPlayer({
      url: attrs.url,
      width: normalizeSize(attrs.width, '500px'),
      height: normalizeSize(attrs.height, '280px'),
      floatClass: attrs.float ? `float-${attrs.float}` : '',
      cover: attrs.cover ? resolveRelativePath(webview, docUri, attrs.cover) : '',
      coverIsSet: !!attrs.cover,
      error: null
    });
  },

  'video-gallery': (attrs, webview, docUri) => {
    try {
      const rawItems = JSON.parse(attrs.data || '[]') as Array<[string, string?, string?]>;
      const videos = rawItems.map(([url, caption, cover]) => ({
        url: String(url),
        caption: caption || '',
        cover: cover ? resolveRelativePath(webview, docUri, String(cover)) : '',
        coverIsSet: !!cover,
        hasCaption: !!caption
      }));
      return templates.videoGallery({ videos, error: null });
    } catch (error) {
      console.error('Video gallery component error:', error);
      return templates.videoGallery({
        videos: [],
        error: 'Invalid video gallery format'
      });
    }
  },

  frontmatter: (attrs, webview, docUri) => {
    const items: Record<string, string> = {};
    let title = '';

    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'title') {
        title = value;
      } else {
        items[key] = ['cover', 'logo'].includes(key)
          ? resolveRelativePath(webview, docUri, value)
          : value;
      }
    }

    return templates.frontmatter({
      title,
      cover: attrs.cover ? resolveRelativePath(webview, docUri, attrs.cover) : '',
      items,
      error: null
    }) + '\n\n';
  }
};

function normalizeSize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /\d$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function parseFrontmatter(text: string): { content: string; attributes: Record<string, string> } | null {
  const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) return null;

  const attributes: Record<string, string> = {};
  const frontmatterContent = frontmatterMatch[1];

  for (const line of frontmatterContent.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)/);
    if (match) {
      const [, key, value] = match;
      attributes[key] = value.replace(/^['"](.*)['"]$/, '$1').trim();
    }
  }

  return {
    content: text.slice(frontmatterMatch[0].length),
    attributes
  };
}

function parseComponentAttributes(inner: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of inner.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*))/g)) {
    const [, key, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[key] = (doubleQuoted ?? singleQuoted ?? unquoted).trim();
  }
  return attributes;
}

function processComponents(text: string, webview: vscode.Webview, documentUri: vscode.Uri): string {
  return text.replace(/:([\w-]+)\{([\s\S]*?)\}/g, (match, componentName, inner) => {
    const renderer = componentRenderers[componentName];
    if (!renderer) return match;

    const attributes = parseComponentAttributes(inner);
    return renderer(attributes, webview, documentUri);
  });
}

function preprocessMarkdown(
  text: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri
): string {
  const frontmatterData = parseFrontmatter(text);
  const processedText = frontmatterData?.content || text;

  let frontmatterHtml = '';
  if (frontmatterData && componentRenderers.frontmatter) {
    frontmatterHtml = componentRenderers.frontmatter(
      frontmatterData.attributes,
      webview,
      documentUri
    );
  }

  const withComponents = processComponents(processedText, webview, documentUri);

  return frontmatterHtml + withComponents;
}

export function renderWithComponents(
  markdown: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const processedMarkdown = preprocessMarkdown(markdown, webview, documentUri);
  const styles = fs.readFileSync(
    path.join(context.extensionPath, 'media', 'styles.css'),
    'utf8'
  );
  return templates.main({
    styles,
    content: processedMarkdown
  });
}

export function deactivate() { }
