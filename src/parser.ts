import * as path from 'path';
import * as vscode from 'vscode';

export function resolveRelativePath(
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

export function normalizeSize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /\d$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

export function parseFrontmatter(text: string): { content: string; attributes: Record<string, string> } | null {
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

export function parseComponentAttributes(inner: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of inner.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*))/g)) {
    const [, key, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[key] = (doubleQuoted ?? singleQuoted ?? unquoted).trim();
  }
  return attributes;
}