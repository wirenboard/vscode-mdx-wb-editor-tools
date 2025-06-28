import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import * as Handlebars from 'handlebars';

const md = new MarkdownIt({ html: true });
Handlebars.registerHelper('md', (text: string) => {
  const html = md.render(text);
  return new Handlebars.SafeString(html);
});

export type Templates = {
  main: HandlebarsTemplateDelegate;
  photo: HandlebarsTemplateDelegate;
  gallery: HandlebarsTemplateDelegate;
  videoPlayer: HandlebarsTemplateDelegate;
  videoGallery: HandlebarsTemplateDelegate;
  frontmatter: HandlebarsTemplateDelegate;
};

export function initializeTemplates(context: vscode.ExtensionContext): Templates {
  const templatesDir = path.join(context.extensionPath, 'templates');
  
  Handlebars.registerHelper('isTitle', (key) => key === 'title');
  Handlebars.registerHelper('isCover', (key) => ['cover', 'logo'].includes(String(key)));

  return {
    main: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'main.html'), 'utf8')),
    photo: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'photo.html'), 'utf8')),
    gallery: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'gallery.html'), 'utf8')),
    videoPlayer: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'video-player.html'), 'utf8')),
    videoGallery: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'video-gallery.html'), 'utf8')),
    frontmatter: Handlebars.compile(fs.readFileSync(path.join(templatesDir, 'frontmatter.html'), 'utf8'))
  };
}