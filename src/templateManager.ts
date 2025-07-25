import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import * as Handlebars from 'handlebars';

const md = new MarkdownIt({ html: true });

export class TemplateManager {
  private readonly templates: {
    main: Handlebars.TemplateDelegate;
    photo: Handlebars.TemplateDelegate;
    gallery: Handlebars.TemplateDelegate;
    videoPlayer: Handlebars.TemplateDelegate;
    videoGallery: Handlebars.TemplateDelegate;
    frontmatter: Handlebars.TemplateDelegate;
    product: Handlebars.TemplateDelegate;
    productSection: Handlebars.TemplateDelegate;
    description: Handlebars.TemplateDelegate;
    info: Handlebars.TemplateDelegate;
    spoiler: Handlebars.TemplateDelegate;
    summary: Handlebars.TemplateDelegate;
    content: Handlebars.TemplateDelegate;
  };

  constructor(context: vscode.ExtensionContext) {
    const templatesDir = path.join(context.extensionPath, 'templates');

    Handlebars.registerHelper('md', (text: string) => {
      return new Handlebars.SafeString(md.render(text));
    });
    Handlebars.registerHelper('isTitle', (key) => key === 'title');
    Handlebars.registerHelper('isCover', (key) => ['cover'].includes(String(key)));
    Handlebars.registerHelper('isLogo', (key) => ['logo'].includes(String(key)));

    this.templates = {
      main: this.compileTemplate(path.join(templatesDir, 'main.hbs')),
      photo: this.compileTemplate(path.join(templatesDir, 'photo.hbs')),
      gallery: this.compileTemplate(path.join(templatesDir, 'gallery.hbs')),
      videoPlayer: this.compileTemplate(path.join(templatesDir, 'video-player.hbs')),
      videoGallery: this.compileTemplate(path.join(templatesDir, 'video-gallery.hbs')),
      frontmatter: this.compileTemplate(path.join(templatesDir, 'frontmatter.hbs')),
      product: this.compileTemplate(path.join(templatesDir, 'product.hbs')),
      productSection: this.compileTemplate(path.join(templatesDir, 'product-section.hbs')),
      description: this.compileTemplate(path.join(templatesDir, 'description.hbs')),
      info: this.compileTemplate(path.join(templatesDir, 'info.hbs')),
      spoiler: this.compileTemplate(path.join(templatesDir, 'spoiler.hbs')),
      summary: this.compileTemplate(path.join(templatesDir, 'summary.hbs')),
      content: this.compileTemplate(path.join(templatesDir, 'content.hbs'))
    };
  }

  private compileTemplate(path: string): Handlebars.TemplateDelegate {
    return Handlebars.compile(fs.readFileSync(path, 'utf8'));
  }

  getTemplates() {
    return this.templates;
  }
}
