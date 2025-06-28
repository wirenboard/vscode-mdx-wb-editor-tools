export class MarkdownParser {
  parseFrontmatter(text: string): { content: string; attributes: Record<string, string> } | null {
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

  parseComponentAttributes(inner: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const match of inner.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*))/g)) {
      const [, key, doubleQuoted, singleQuoted, unquoted] = match;
      attributes[key] = (doubleQuoted ?? singleQuoted ?? unquoted).trim();
    }
    return attributes;
  }
}
