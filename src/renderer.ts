import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Templates, initializeTemplates } from './templateManager';
import {
  parseFrontmatter,
  parseComponentAttributes,
  normalizeSize,
  resolveRelativePath
} from './parser';

type ComponentRenderer = (
  attributes: Record<string, string>,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  templates: Templates
) => string;

const componentRenderers: Record<string, ComponentRenderer> = {
    photo: (attrs, webview, docUri, templates) => {
        return templates.photo({
          src: resolveRelativePath(webview, docUri, attrs.src),
          alt: attrs.alt || '',
          caption: attrs.caption,
          width: normalizeSize(attrs.width, '100%'),
          floatClass: attrs.float ? `float-${attrs.float}` : '',
          error: null
        });
      },

      gallery: (attrs, webview, docUri, templates) => {
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

      'video-player': (attrs, webview, docUri, templates) => {
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

      'video-gallery': (attrs, webview, docUri, templates) => {
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

      frontmatter: (attrs, webview, docUri, templates) => {
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

function processComponents(text: string, webview: vscode.Webview, documentUri: vscode.Uri, templates: Templates): string {
  return text.replace(/:([\w-]+)\{([\s\S]*?)\}/g, (match, componentName, inner) => {
    const renderer = componentRenderers[componentName];
    if (!renderer) return match;

    const attributes = parseComponentAttributes(inner);
    return renderer(attributes, webview, documentUri, templates);
  });
}

function preprocessMarkdown(
  text: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  templates: Templates
): string {
  const frontmatterData = parseFrontmatter(text);
  const processedText = frontmatterData?.content || text;

  let frontmatterHtml = '';
  if (frontmatterData && componentRenderers.frontmatter) {
    frontmatterHtml = componentRenderers.frontmatter(
      frontmatterData.attributes,
      webview,
      documentUri,
      templates
    );
  }

  return frontmatterHtml + processComponents(processedText, webview, documentUri, templates);
}

export function renderWithComponents(
  markdown: string,
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const templates = initializeTemplates(context);
  const processedMarkdown = preprocessMarkdown(markdown, webview, documentUri, templates);  
  const styles = fs.readFileSync(
    path.join(context.extensionPath, 'media', 'styles.css'),
    'utf8'
  );
  return templates.main({
    styles,
    content: processedMarkdown
  });
}
