interface ComponentBase {
  componentName: string;
  error?: string;
  isBlock: boolean;
  children?: Array<string | Component>;
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
  parseFrontmatter(
    text: string
  ): { content: string; attributes: Record<string, string> } | null {
    const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---(\s*\n)?/);
    if (!frontmatterMatch) return null;

    const attributes: Record<string, string> = {};
    const frontmatterContent = frontmatterMatch[1];
    let currentKey = '';
    let currentValue = '';

    for (const line of frontmatterContent.split("\n")) {
      const keyMatch = line.match(/^(\w+):\s*(.*)/);
      if (keyMatch) {
        if (currentKey) {
          attributes[currentKey] = currentValue.trim();
        }
        currentKey = keyMatch[1];
        currentValue = keyMatch[2];
      } else if (currentKey) {
        currentValue += '\n' + line;
      }
    }

    if (currentKey) {
      attributes[currentKey] = currentValue.trim();
    }

    for (const key in attributes) {
      attributes[key] = attributes[key].replace(/^['"](.*)['"]$/, '$1').trim();
    }

    return {
      content: text.slice(frontmatterMatch[0].length),
      attributes,
    };
  }

  parseComponentAttributes(inner: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const match of inner.matchAll(
      /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*))/g
    )) {
      const [, key, doubleQuoted, singleQuoted, unquoted] = match;
      attributes[key] = (doubleQuoted ?? singleQuoted ?? unquoted).trim();
    }
    return attributes;
  }

  private addTextToContext(
    text: string,
    context: ParseResult,
    stack: BlockComponent[]
  ) {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(text);
    } else {
      context.push(text);
    }
  }

  private addComponentToContext(
    component: InlineComponent | BlockComponent,
    context: ParseResult,
    stack: BlockComponent[]
  ) {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(component);
    } else {
      context.push(component);
    }
  }

  private createInlineComponent(match: RegExpExecArray): InlineComponent {
    return {
      componentName: match[1],
      attributes: this.parseComponentAttributes(match[2]),
      isBlock: false,
    };
  }

  private createBlockComponent(match: RegExpExecArray): BlockComponent {
    return {
      componentName: match[1],
      attributes: match[2] ? this.parseComponentAttributes(match[2]) : {},
      isBlock: true,
      children: [],
    };
  }

  private getNextMatch(
    text: string,
    lastIndex: number
  ): RegExpExecArray | null {
    const inlinePattern = /:([\w-]+)\{([\s\S]*?)\}/g;
    const blockPattern = /::(?!::)([\w-]+)(?:\{([\s\S]*?)\})?|\:\:/g;

    inlinePattern.lastIndex = lastIndex;
    blockPattern.lastIndex = lastIndex;

    const inlineMatch = inlinePattern.exec(text);
    const blockMatch = blockPattern.exec(text);

    if (!inlineMatch && !blockMatch) return null;
    if (!inlineMatch) return blockMatch;
    if (!blockMatch) return inlineMatch;

    return inlineMatch.index < blockMatch.index ? inlineMatch : blockMatch;
  }

  parseComponents(text: string): ParseResult {
    const result: ParseResult = [];
    const stack: Array<{ component: BlockComponent; startIndex: number }> = [];
    let lastIndex = 0;

    while (true) {
      const match = this.getNextMatch(text, lastIndex);
      if (!match) break;

      if (match.index > lastIndex) {
        this.addTextToContext(
          text.slice(lastIndex, match.index),
          result,
          stack.map((s) => s.component)
        );
      }

      if (match[0] === "::") {
        if (stack.length > 0) {
          const { component } = stack.pop()!;
          this.addComponentToContext(
            component,
            result,
            stack.map((s) => s.component)
          );
        }
      } else {
        const component = match[0].startsWith("::")
          ? this.createBlockComponent(match)
          : this.createInlineComponent(match);

        if (component.isBlock) {
          stack.push({
            component: component as BlockComponent,
            startIndex: match.index,
          });
        } else {
          this.addComponentToContext(
            component,
            result,
            stack.map((s) => s.component)
          );
        }
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      this.addTextToContext(
        text.slice(lastIndex),
        result,
        stack.map((s) => s.component)
      );
    }

    return result;
  }
}
