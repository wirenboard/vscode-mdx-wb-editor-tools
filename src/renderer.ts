import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TemplateManager } from './templateManager';
import { MarkdownParser } from './parser';
type ComponentRenderer = (
  attributes: Record<string, string>,
  webview: vscode.Webview,
  documentUri: vscode.Uri
) => string;

export class MarkdownRenderer {
  private readonly componentRenderers: Record<string, ComponentRenderer>;
  private readonly templateManager: TemplateManager;
  private readonly parser = new MarkdownParser();

  constructor(context: vscode.ExtensionContext) {
    this.templateManager = new TemplateManager(context);
    this.componentRenderers = this.createComponentRenderers();
  }

  private resolveRelativePath(
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    relativePath: string
  ): string {
    if (!relativePath) return '';

    const normalizedPath = relativePath.replace(/\\/g, '/');

    const imgPathRegex = /^\/?img\//;
    if (imgPathRegex.test(normalizedPath)) {
      const assetPath = normalizedPath.replace(imgPathRegex, '');
      const wf = vscode.workspace.workspaceFolders?.[0];
      if (!wf) {
        console.error('No workspace folder to resolve /img path');
        return '';
      }
      const absFs = path.join(
        wf.uri.fsPath,
        'public',
        'img',
        ...assetPath.split('/').filter(Boolean)
      );
      const fileUri = vscode.Uri.file(absFs);
      return webview.asWebviewUri(fileUri).toString();
    }

    const docFs = documentUri.fsPath;
    const docDir = path.dirname(docFs);
    const absFs = path.join(
      docDir,
      ...normalizedPath.split('/').filter(Boolean)
    );
    const fileUri = vscode.Uri.file(absFs);
    return webview.asWebviewUri(fileUri).toString();
  }

  private normalizeSize(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    const trimmed = value.trim();
    return /\d$/.test(trimmed) ? `${trimmed}px` : trimmed;
  }

  private createComponentRenderers(): Record<string, ComponentRenderer> {
    return {
      photo: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().photo({
          src: this.resolveRelativePath(webview, docUri, attrs.src),
          alt: attrs.alt || '',
          caption: attrs.caption,
          width: this.normalizeSize(attrs.width, '100%'),
          floatClass: attrs.float ? `float-${attrs.float}` : '',
          error: null
        });
      },

      gallery: (attrs, webview, docUri) => {
        try {
          const rawImages = JSON.parse(attrs.data || '[]');
          const images = rawImages.map(([src, alt]: [string, string]) => ({
            src: this.resolveRelativePath(webview, docUri, src),
            alt: alt || '',
            caption: alt
          }));
          return this.templateManager.getTemplates().gallery({ images, error: null });
        } catch (error) {
          console.error('Gallery component error:', error);
          return this.templateManager.getTemplates().gallery({
            error: 'Invalid gallery data format'
          });
        }
      },

      'video-player': (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().videoPlayer({
          url: attrs.url,
          width: this.normalizeSize(attrs.width, '500px'),
          height: this.normalizeSize(attrs.height, '280px'),
          floatClass: attrs.float ? `float-${attrs.float}` : '',
          cover: attrs.cover ? this.resolveRelativePath(webview, docUri, attrs.cover) : '',
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
            cover: cover ? this.resolveRelativePath(webview, docUri, String(cover)) : '',
            coverIsSet: !!cover,
            hasCaption: !!caption
          }));
          return this.templateManager.getTemplates().videoGallery({ videos, error: null });
        } catch (error) {
          console.error('Video gallery component error:', error);
          return this.templateManager.getTemplates().videoGallery({
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
              ? this.resolveRelativePath(webview, docUri, value)
              : value;
          }
        }

        return this.templateManager.getTemplates().frontmatter({
          title,
          cover: attrs.cover ? this.resolveRelativePath(webview, docUri, attrs.cover) : '',
          items,
          error: null
        }) + '\n\n';
      }
    };
  }

  public render(
    markdown: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    context: vscode.ExtensionContext
  ): string {
    const processedMarkdown = this.preprocessMarkdown(markdown, webview, documentUri);
    const styles = fs.readFileSync(
      path.join(context.extensionPath, 'media', 'styles.css'),
      'utf8'
    );
    return this.templateManager.getTemplates().main({
      styles,
      content: processedMarkdown
    });
  }

  private preprocessMarkdown(
    text: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri
  ): string {
    const frontmatterData = this.parser.parseFrontmatter(text);
    let processedText = frontmatterData?.content || text;

    if (frontmatterData && (!processedText.trim() || processedText.trim() === text.trim())) {
      processedText = '';
    }

    let frontmatterHtml = '';
    if (frontmatterData) {
      frontmatterHtml = this.componentRenderers.frontmatter(
        frontmatterData.attributes,
        webview,
        documentUri
      );
    }

    return frontmatterHtml + this.processComponents(processedText, webview, documentUri);
  }

  private processComponents(
    text: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri
  ): string {
    return text.replace(/:([\w-]+)\{([\s\S]*?)\}/g, (match, componentName, inner) => {
      const renderer = this.componentRenderers[componentName];
      if (!renderer) return match;

      const attributes = this.parser.parseComponentAttributes(inner);
      return renderer(attributes, webview, documentUri);
    });
  }
}
