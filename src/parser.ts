interface ComponentBase {
  componentName: string;
  originalText: string;
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

    for (const line of frontmatterContent.split("\n")) {
      const match = line.match(/^(\w+):\s*(.*)/);
      if (match) {
        const [, key, value] = match;
        attributes[key] = value.replace(/^['"](.*)['"]$/, "$1").trim();
      }
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
      originalText: match[0],
      isBlock: false,
    };
  }

  private createBlockComponent(match: RegExpExecArray): BlockComponent {
    return {
      componentName: match[1],
      attributes: match[2] ? this.parseComponentAttributes(match[2]) : {},
      originalText: match[0],
      isBlock: true,
      children: [],
    };
  }

  private getNextMatch(
    text: string,
    lastIndex: number
  ): RegExpExecArray | null {
    const inlinePattern = /:([\w-]+)\{([\s\S]*?)\}/g;
    const blockPattern = /::(?!::)([\w-]+)(?:\{([\s\S]*?)\})?|\:\:/g; // Объединённый паттерн

    inlinePattern.lastIndex = lastIndex;
    blockPattern.lastIndex = lastIndex;

    const inlineMatch = inlinePattern.exec(text);
    const blockMatch = blockPattern.exec(text);

    if (!inlineMatch && !blockMatch) return null;
    if (!inlineMatch) return blockMatch;
    if (!blockMatch) return inlineMatch;

    return inlineMatch.index < blockMatch.index ? inlineMatch : blockMatch;
  }

  private handleComponentStructure(
    componentName: string,
    originalText: string,
    isClosing: boolean,
    stack: BlockComponent[],
    components: ParseResult
  ) {
    // обработка универсального закрывающего тега
    if (originalText === "::") {
      if (stack.length === 0) {
        this.addErrorComponent("", originalText, components, stack);
        return;
      }
      const lastName = stack[stack.length - 1].componentName;
      if (!this.closeComponent(lastName, stack, components)) {
        this.addErrorComponent(lastName, originalText, components, stack);
      }
      return;
    }

    const attributesMatch = originalText.match(/\{(.*?)\}/);
    let attributes = {};
    if (attributesMatch) {
      attributes = this.parseComponentAttributes(attributesMatch[1]);
    }

    if (isClosing) {
      if (!this.closeComponent(componentName, stack, components)) {
        this.addErrorComponent(componentName, originalText, components, stack);
      }
    } else {
      const fakeMatch = {
        0: originalText,
        1: componentName,
        index: 0,
        input: originalText,
        groups: undefined,
        length: 2,
      } as unknown as RegExpExecArray;

      const component = this.createBlockComponent(fakeMatch);
      if (originalText.includes("{")) {
        const attributesMatch = originalText.match(/\{(.*?)\}/);
        if (attributesMatch) {
          component.attributes = this.parseComponentAttributes(
            attributesMatch[1]
          );
        }
      }
      stack.push(component);
    }
  }

  private closeComponent(
    tagName: string,
    stack: BlockComponent[],
    components: ParseResult
  ): boolean {
    const index = stack.findIndex((c) => c.componentName === tagName);
    if (index === -1) return false;

    const closedComponent = stack.splice(index, 1)[0];
    const target =
      stack.length > 0 ? stack[stack.length - 1].children : components;
    target.push(closedComponent);
    return true;
  }

  private addErrorComponent(
    tagName: string,
    originalText: string,
    components: ParseResult,
    stack: BlockComponent[]
  ) {
    this.addComponentToContext(
      {
        componentName: tagName,
        attributes: {},
        originalText,
        isBlock: false,
        error: `Неправильная структура: тег '${originalText}'`,
      },
      components,
      stack
    );
  }
  parseComponents(text: string): ParseResult {
    const result: ParseResult = [];
    const stack: Array<{component: BlockComponent, startIndex: number}> = [];
    let lastIndex = 0;

    while (true) {
      const match = this.getNextMatch(text, lastIndex);
      if (!match) break;

      // Добавляем текст между компонентами
      if (match.index > lastIndex) {
        this.addTextToContext(text.slice(lastIndex, match.index), result, stack.map(s => s.component));
      }

      if (match[0] === '::') { // Закрывающий тег
        if (stack.length > 0) {
          const {component, startIndex} = stack.pop()!;
          component.originalText = text.slice(startIndex, match.index + 2); // +2 для '::'
          this.addComponentToContext(component, result, stack.map(s => s.component));
        }
      } else { // Открывающий тег
        const component = match[0].startsWith('::') 
          ? this.createBlockComponent(match)
          : this.createInlineComponent(match);
        
        if (component.isBlock) {
          stack.push({component: component as BlockComponent, startIndex: match.index});
        } else {
          this.addComponentToContext(component, result, stack.map(s => s.component));
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Добавляем оставшийся текст
    if (lastIndex < text.length) {
      this.addTextToContext(text.slice(lastIndex), result, stack.map(s => s.component));
    }

    return result;
  }
}
