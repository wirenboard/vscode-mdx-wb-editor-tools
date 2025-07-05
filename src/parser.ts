interface ComponentBase {
    componentName: string;
    originalText: string;
  error?: string;
}

interface InlineComponent extends ComponentBase {
  isBlock: false;
  attributes: Record<string, string>;
}

export interface BlockComponent extends ComponentBase {
  isBlock: true;
  attributes: Record<string, string>;
  children: Array<string | Component>;
}

export type Component = InlineComponent | BlockComponent;
type ParseResult = Array<string | Component>;

export class MarkdownParser {
  parseFrontmatter(text: string): { content: string; attributes: Record<string, string> } | null {
    const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---(\s*\n)?/);
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

  parseComponents(text: string): ParseResult {
    const inlinePattern = /:([\w-]+)\{([\s\S]*?)\}/g;
    const blockOpenPattern = /::([\w-]+)(?:\{([\s\S]*?)\})?/g;
    const components: ParseResult = [];
    const stack: BlockComponent[] = [];
    let lastIndex = 0;

    while (lastIndex < text.length) {
      const inlineMatch = inlinePattern.exec(text);
      const blockOpenMatch = blockOpenPattern.exec(text);

      let match;
      if (inlineMatch && blockOpenMatch) {
        match = inlineMatch.index < blockOpenMatch.index ? inlineMatch : blockOpenMatch;
      } else {
        match = inlineMatch || blockOpenMatch;
      }

      if (!match) break;

      if (match.index > lastIndex) {
        const textBetween = text.slice(lastIndex, match.index);
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(textBetween);
        } else {
          components.push(textBetween);
      }
    }

      if (match === inlineMatch) {
        const inlineComponent: InlineComponent = {
          componentName: match[1],
          attributes: this.parseComponentAttributes(match[2]),
          originalText: match[0],
          isBlock: false
        };

        if (stack.length > 0) {
          stack[stack.length - 1].children.push(inlineComponent);
        } else {
          components.push(inlineComponent);
    }
      } else {
        const blockComponent: BlockComponent = {
          componentName: match[1],
          attributes: match[2] ? this.parseComponentAttributes(match[2]) : {},
          originalText: match[0],
          isBlock: true,
          children: []
        };

        stack.push(blockComponent);
  }

      lastIndex = match.index + match[0].length;
      inlinePattern.lastIndex = lastIndex;
      blockOpenPattern.lastIndex = lastIndex;
    }

    while (stack.length > 0) {
      const unclosed = stack.pop();
      if (!unclosed) continue;

      const errorComponent: InlineComponent = {
        componentName: unclosed.componentName,
        attributes: {},
        originalText: unclosed.originalText,
        isBlock: false,
          error: `Unclosed block component '${unclosed.componentName}'`
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(errorComponent);
      } else {
        components.push(errorComponent);
      }
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      components.push(remainingText);
    }

    return components;
  }
}
