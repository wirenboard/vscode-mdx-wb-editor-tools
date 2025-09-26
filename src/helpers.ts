import MarkdownIt from 'markdown-it';
import { HelperDelegate, SafeString } from "handlebars";

const md = new MarkdownIt({ html: true });

const helpers: Record<string, HelperDelegate> = {
  md: (text: string) => new SafeString(md.render(text)),
  isTitle: (key: string) => key === 'title',
  isCover: (key: string) => ['cover'].includes(String(key)),
  isLogo: (key: string) => ['logo'].includes(String(key)),
  formatDate: (date: string) => {
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(date));
    } catch {
      return date;
    }
  },
  gridCols: (links: any[]) => {
    if (!Array.isArray(links)) return 1;
    const n = links.length;
    return n >= 4 ? 4 : n;
  },
};

export default helpers;
