import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import { TemplateManager } from "./templateManager";
import { MarkdownParser, Component, BlockComponent } from "./parser";
type ComponentRenderer = (
  attributes: Record<string, string>,
  webview: vscode.Webview,
  documentUri: vscode.Uri
) => string;

export class MarkdownRenderer {
  private readonly componentRenderers: Record<string, ComponentRenderer>;
  private readonly templateManager: TemplateManager;
  private readonly parser = new MarkdownParser();
  private readonly md: MarkdownIt;

  private wrapError(error: string): string {
    return `<div class="component-error">${error}</div>`;
  }

  constructor(context: vscode.ExtensionContext) {
    this.templateManager = new TemplateManager(context);
    this.componentRenderers = this.createComponentRenderers();
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
    });
  }

  private resolveRelativePath(
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    relativePath: string
  ): string {
    if (!relativePath) return "";

    try {
      const normalizedPath = relativePath.replace(/\\/g, "/");

      const imgPathRegex = /^\/?img\//;
      if (imgPathRegex.test(normalizedPath)) {
        const assetPath = normalizedPath.replace(imgPathRegex, "");
        const wf = vscode.workspace.workspaceFolders?.[0];
        if (!wf) {
          console.error("No workspace folder to resolve /img path");
          return "";
        }
        const absFs = path.join(
          wf.uri.fsPath,
          "public",
          "img",
          ...assetPath.split("/").filter(Boolean)
        );
        return this.createWebviewUri(webview, absFs);
      }

      const docDir = path.dirname(documentUri.fsPath);
      const absFs = path.join(
        docDir,
        ...normalizedPath.split("/").filter(Boolean)
      );
      return this.createWebviewUri(webview, absFs);
    } catch (error) {
      console.error("Error resolving path:", error);
      return "";
    }
  }

  private createWebviewUri(webview: vscode.Webview, fsPath: string): string {
    try {
      if (!fs.existsSync(fsPath)) {
        console.error("File not found:", fsPath);
        return "";
      }
      const fileUri = vscode.Uri.file(fsPath);
      return webview.asWebviewUri(fileUri).toString();
    } catch (error) {
      console.error("Error creating webview URI:", error);
      return "";
    }
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
          alt: attrs.alt || "",
          caption: attrs.caption,
          width: this.normalizeSize(attrs.width, "100%"),
          floatClass: attrs.float ? `float-${attrs.float}` : "",
          error: null,
        });
      },

      gallery: (attrs, webview, docUri) => {
        try {
          console.debug("Gallery component attrs", attrs);
          const rawImages = JSON.parse(attrs.data || "[]");
          const images = rawImages.map(([src, alt]: [string, string]) => ({
            src: this.resolveRelativePath(webview, docUri, src),
            alt: alt || "",
            caption: alt,
          }));
          return this.templateManager
            .getTemplates()
            .gallery({ images, error: null });
        } catch (error) {
          console.error("Gallery component error:", error, "attrs:", attrs);
          return this.templateManager.getTemplates().gallery({
            error: "Invalid gallery data format",
          });
        }
      },

      "video-player": (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().videoPlayer({
          url: attrs.url,
          width: this.normalizeSize(attrs.width, "500px"),
          height: this.normalizeSize(attrs.height, "280px"),
          floatClass: attrs.float ? `float-${attrs.float}` : "",
          cover: attrs.cover
            ? this.resolveRelativePath(webview, docUri, attrs.cover)
            : "",
          coverIsSet: !!attrs.cover,
          error: null,
        });
      },

      "video-gallery": (attrs, webview, docUri) => {
        try {
          const rawItems = JSON.parse(attrs.data || "[]") as Array<
            [string, string?, string?]
          >;
          const videos = rawItems.map(([url, caption, cover]) => ({
            url: String(url),
            caption: caption || "",
            cover: cover
              ? this.resolveRelativePath(webview, docUri, String(cover))
              : "",
            coverIsSet: !!cover,
            hasCaption: !!caption,
          }));
          return this.templateManager
            .getTemplates()
            .videoGallery({ videos, error: null });
        } catch (error) {
          console.error("Video gallery component error:", error);
          return this.templateManager.getTemplates().videoGallery({
            videos: [],
            error: "Invalid video gallery format",
          });
        }
      },

      frontmatter: (attrs, webview, docUri) => {
        const items: Record<string, string> = {};
        let title = "";

        for (const [key, value] of Object.entries(attrs)) {
          if (key === "title") {
            title = value;
          } else {
            items[key] = ["cover", "logo"].includes(key)
              ? this.resolveRelativePath(webview, docUri, value)
              : value;
          }
        }

        return (
          this.templateManager.getTemplates().frontmatter({
            title,
            cover: attrs.cover
              ? this.resolveRelativePath(webview, docUri, attrs.cover)
              : "",
            items,
            error: null,
          }) + "\n\n"
        );
      },

      product: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().product({
          content: attrs.content || "",
          error: null,
        });
      },

      "product-section": (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().productSection({
          title: attrs.title || "",
          content: attrs.content || "",
          error: null,
        });
      },
      description: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().description({
          content: attrs.content || "",
          error: null,
        });
      },

      info: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().info({
          content: attrs.content || "",
          error: null,
        });
      },

      include: (attrs, webview, docUri) => {
        try {
          const includePath = attrs.path;
          if (!includePath) {
            return this.wrapError("Include path is missing");
          }
      
          // Получаем абсолютный путь к корню проекта из текущего файла
          const docPath = docUri.fsPath;
          const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!projectRoot) {
            return this.wrapError("Workspace root not found");
          }
      
          // Строим абсолютный путь к инклюду
          const absPath = path.join(
            projectRoot,
            "content",
            docPath.split(path.sep).includes("ru") ? "ru" : "en",
            ...includePath.replace(/^\//, "").split("/").filter(Boolean)
          ) + ".md";
      
          if (!fs.existsSync(absPath)) {
            return this.wrapError(`Include file not found: ${absPath}`);
          }
      
          const content = fs.readFileSync(absPath, "utf8");
          // Передаем путь к инклюду как базовый для обработки медиа
          return this.processMarkdownWithComponents(content, webview, vscode.Uri.file(absPath));
        } catch (error) {
          return this.wrapError(`Include error: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      spoiler: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().spoiler({
          content: attrs.content || "",
          error: null,
        });
      },
      summary: (attrs, webview, docUri) => {
        // Полностью ручная обработка контента без markdown-it
        const content = attrs.content 
          ? attrs.content
              .replace(/<\/?p>/g, '') // Удаляем все теги p
              .trim()
          : "";
          
        return this.templateManager.getTemplates().summary({
          content,
          error: null,
        });
      },
      content: (attrs, webview, docUri) => {
        return this.templateManager.getTemplates().content({
          content: attrs.content || "",
          error: null,
        });
      },     
    };
  }

  private processMarkdownWithComponents(
    text: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri
  ): string {
    const parsed = this.parser.parseComponents(text);
  
    const processNode = (node: string | Component): string => {
      if (typeof node === "string") {
        return this.md.render(node);
      } else {
        const renderer = this.componentRenderers[node.componentName];
        if (!renderer) {
          return this.wrapError(`Render not found for component: ${node.componentName}`);
        }
  
        // Рекурсивно обрабатываем детей для блочных компонентов
        if (node.isBlock && "children" in node) {
          const childrenContent = node.children.map(processNode).join("");
          return renderer(
            { ...node.attributes, content: childrenContent },
            webview,
            documentUri
          );
        }
  
        return renderer(node.attributes, webview, documentUri);
      }
    };
  
    return parsed.map(processNode).join("");
  }

  public render(
    markdown: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    context: vscode.ExtensionContext
  ): string {
    try {
      const processedMarkdown = this.preprocessMarkdown(markdown, webview, documentUri);
      const stylesPath = path.join(context.extensionPath, "media", "styles.css");
      const styles = fs.existsSync(stylesPath)
        ? fs.readFileSync(stylesPath, "utf8")
        : "/* Styles not found */";

      const content = this.processMarkdownWithComponents(
        processedMarkdown,
        webview,
        documentUri
      );

      return this.templateManager.getTemplates().main({ styles, content });
    } catch (error) {
      console.error("Rendering error:", error);
      return this.templateManager.getTemplates().main({
        styles: "",
        error: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private preprocessMarkdown(
    text: string,
    webview: vscode.Webview,
    documentUri: vscode.Uri
  ): string {
    const frontmatterData = this.parser.parseFrontmatter(text);
    let processedText = frontmatterData?.content || text;
    if (
      frontmatterData &&
      (!processedText.trim() || processedText.trim() === text.trim())
    ) {
      processedText = "";
    }

    let frontmatterHtml = "";
    let additionalComponents = "";

    if (frontmatterData) {
      const attributes = { ...frontmatterData.attributes };

      if (attributes.images) {
        additionalComponents += this.createComponentFromFrontmatter(
          "images",
          "gallery",
          attributes.images,
          "Фото"
        );
        delete attributes.images;
      }

      if (attributes.video) {
        additionalComponents += this.createComponentFromFrontmatter(
          "video",
          "video-gallery",
          attributes.video,
          "Видео"
        );
        delete attributes.video;
      }

      if (attributes.use_cases) {
        let useCases: string[];
        if (Array.isArray(attributes.use_cases)) {
          useCases = attributes.use_cases;
        } else if (attributes.use_cases.startsWith("[")) {
          useCases = JSON.parse(attributes.use_cases);
        } else {
          useCases = attributes.use_cases
            .split(/\n|,/)
            .map((item) => item.replace(/^[\s-]*|[\s-]*$/g, ""))
            .filter((item) => item);
        }

        const currentDir = vscode.Uri.joinPath(documentUri, "../..");
        const solutionsDir = vscode.Uri.joinPath(currentDir, "solutions");

        attributes.use_cases = `<ul>${useCases.map((caseName: string) => {
          const trimmedCaseName = caseName.trim();
          const filePath = vscode.Uri.joinPath(solutionsDir, `${trimmedCaseName}.md`);
          const fileExists = fs.existsSync(filePath.fsPath);
          const colorClass = fileExists ? 'valid-use-case' : 'invalid-use-case';
          return `<li><span class="${colorClass}">${trimmedCaseName}</span></li>`;
        }).join('')}</ul>`;
      }

      console.log("Generated additional components:", additionalComponents);

      frontmatterHtml = this.componentRenderers.frontmatter(
        attributes,
        webview,
        documentUri
      );
    }

    return frontmatterHtml + processedText + additionalComponents;
  }

  private createComponentFromFrontmatter(
    attributeName: string,
    componentName: string,
    value: string,
    title: string = attributeName
  ): string {
    try {
      const data = JSON.parse(value);
      return `<h2>${title}\n</h2>\n<div class="frontmatter-${attributeName}">\n:${componentName}{:data='${JSON.stringify(
        data
      )}'}\n</div>\n`;
    } catch (error) {
      console.error(`Frontmatter attribute "${attributeName}" error:`, error);
      return this.wrapError(
        `Invalid format in frontmatter attribute <b>"${attributeName}"</b>: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}


