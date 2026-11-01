import katex from 'katex';
import 'katex/contrib/mhchem';
import Prism from 'prismjs';

// Disable Prism's automatic DOM scanner so it doesn't interfere with Angular's view
Prism.manual = true;

// Import Prism syntax highlighting languages
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

/**
 * Lightweight, memory-safe bounded LRU Cache to eliminate redundant re-parsing.
 * Automatically evicts oldest entries when reaching maxCapacity to prevent memory leaks.
 */
class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxCapacity = 250) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Refresh recency
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxCapacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }
}

// Bounded memoization caches
const markdownCache = new BoundedCache<string, string>(300);
const katexDisplayCache = new BoundedCache<string, string>(400);
const katexInlineCache = new BoundedCache<string, string>(400);
const chemCache = new BoundedCache<string, string>(200);
const codeHighlightCache = new BoundedCache<string, string>(200);

/**
 * Advanced rich content, Markdown, LaTeX math, chemistry, and code playground parser for Ja3far AI.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    if (/^(?:javascript|vbscript|data):/i.test(trimmed)) {
      return '#';
    }
    if (/^(?:https?:\/\/|mailto:)/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  } catch {
    return '#';
  }
}

export function renderWebsiteLink(textLabel: string, rawUrl: string): string {
  const cleanUrl = sanitizeUrl(rawUrl);
  if (cleanUrl === '#') {
    return escapeHtml(textLabel);
  }

  let domainHost = '';
  try {
    const parsed = new URL(cleanUrl);
    domainHost = parsed.hostname.replace(/^www\./, '');
  } catch {
    domainHost = '';
  }

  const safeLabel = escapeHtml(textLabel.trim());
  const safeUrl = escapeHtml(cleanUrl);
  const safeHost = escapeHtml(domainHost);

  const showHostBadge = Boolean(safeHost && safeHost !== safeLabel && !safeLabel.includes(safeHost));

  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="website-chip inline-flex items-center gap-1.5 px-2.5 py-1 my-1 rounded-xl bg-[#A994F7]/10 hover:bg-[#A994F7]/25 border border-[#A994F7]/30 hover:border-[#A994F7]/60 text-[#A994F7] dark:text-[#A994F7] light:text-[#6542D9] font-medium transition-all duration-150 cursor-pointer shadow-2xs group no-underline select-text hover:shadow-sm" title="${safeUrl}"><span class="material-icons text-[15px] text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 shrink-0 group-hover:scale-110 transition-transform">language</span><span class="font-medium underline decoration-[#A994F7]/40 underline-offset-3 group-hover:decoration-[#A994F7] transition-all">${safeLabel}</span>${showHostBadge ? `<span class="text-[10px] font-mono opacity-70 text-[#A6A2B3] dark:text-[#A6A2B3] light:text-stone-500 font-normal">(${safeHost})</span>` : ''}<span class="material-icons text-[12px] opacity-75 group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] transition-transform">open_in_new</span></a>`;
}

export function renderRawUrl(matchedUrl: string): string {
  const cleanUrl = sanitizeUrl(matchedUrl);
  if (cleanUrl === '#') return escapeHtml(matchedUrl);

  const safeUrl = escapeHtml(cleanUrl);
  const displayLabel = escapeHtml(matchedUrl.trim());

  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="website-chip-raw inline-flex items-center gap-1.5 px-2.5 py-0.5 my-0.5 rounded-lg bg-[#8BCFC2]/10 hover:bg-[#8BCFC2]/20 border border-[#8BCFC2]/25 hover:border-[#8BCFC2]/50 text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-800 font-mono text-xs transition-all duration-150 cursor-pointer shadow-2xs group no-underline select-text hover:shadow-sm" dir="ltr" title="${safeUrl}"><span class="material-icons text-[13px] text-[#A994F7] shrink-0 group-hover:scale-110 transition-transform">public</span><span class="underline decoration-[#8BCFC2]/40 underline-offset-2 group-hover:decoration-[#8BCFC2]">${displayLabel}</span><span class="material-icons text-[11px] opacity-75 group-hover:translate-x-[1px] transition-transform">open_in_new</span></a>`;
}

/**
 * Normalizes language names to Prism grammar keys
 */
function resolvePrismLanguage(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  switch (l) {
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'py':
    case 'python':
      return 'python';
    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return 'markup';
    case 'css':
      return 'css';
    case 'sh':
    case 'bash':
    case 'shell':
    case 'zsh':
      return 'bash';
    case 'json':
      return 'json';
    case 'sql':
      return 'sql';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cpp':
    case 'c++':
      return 'cpp';
    case 'cs':
    case 'csharp':
    case 'c#':
      return 'csharp';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'php':
      return 'clike';
    default:
      return Prism.languages[l] ? l : '';
  }
}

/**
 * Highlights code string using PrismJS with line numbering and bounded caching
 */
function highlightCode(code: string, language: string): string {
  const cacheKey = `${language}:::${code}`;
  const cached = codeHighlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const prismLang = resolvePrismLanguage(language);
  let highlighted = '';

  if (prismLang && Prism.languages[prismLang]) {
    try {
      highlighted = Prism.highlight(code, Prism.languages[prismLang], prismLang);
    } catch {
      highlighted = escapeHtml(code);
    }
  } else {
    highlighted = escapeHtml(code);
  }

  // Generate numbered lines for clean developer readability
  const lines = highlighted.split('\n');
  const numberedLinesHtml = lines
    .map((line, idx) => {
      const lineNum = idx + 1;
      return `<div class="code-line flex"><span class="code-line-num select-none text-[#A6A2B3]/40 dark:text-[#A6A2B3]/40 light:text-stone-400 font-mono text-[11px] w-8 shrink-0 text-right pr-3 pl-1 inline-block">${lineNum}</span><span class="code-line-content flex-1 pr-2">${line || ' '}</span></div>`;
    })
    .join('');

  codeHighlightCache.set(cacheKey, numberedLinesHtml);
  return numberedLinesHtml;
}

export function parseMarkdown(text: string): string {
  if (!text) return '';

  // Fast-path: return cached HTML immediately if full text was parsed previously
  const cachedHtml = markdownCache.get(text);
  if (cachedHtml !== undefined) {
    return cachedHtml;
  }

  const protectedPlaceholders: { placeholder: string; html: string }[] = [];
  let placeholderCounter = 0;

  // 0. Streaming tolerance: auto-close trailing open code fence if incomplete
  let workingText = text;
  const backtickMatches = workingText.match(/```/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    workingText += '\n```';
  }

  // 1. Extract and render multi-line code blocks ```lang ... ```
  let processed = workingText.replace(
    /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const language = (lang || 'code').trim();
      const rawCode = code.trimEnd();
      const lowerLang = language.toLowerCase();

      // Check if runnable in the Sandboxed Live Code Playground
      const isRunnable = [
        'html',
        'htm',
        'svg',
        'css',
        'js',
        'javascript',
        'ts',
        'typescript',
      ].includes(lowerLang);

      const highlightedHtml = highlightCode(rawCode, language);
      const encodedCode = encodeURIComponent(rawCode);

      const placeholder = `%%CODE_BLOCK_${placeholderCounter++}%%`;
      const blockHtml = `
<div class="code-block-container my-3.5 rounded-xl overflow-hidden border border-white/10 dark:border-white/10 light:border-black/10 bg-[#14141C] dark:bg-[#14141C] light:bg-[#F4F1EA] text-left shadow-sm" dir="ltr">
  <div class="flex items-center justify-between px-3.5 py-2 bg-[#1B1B26] dark:bg-[#1B1B26] light:bg-[#EAE5DC] border-b border-white/5 dark:border-white/5 light:border-black/5 text-xs text-[#A6A2B3] dark:text-[#A6A2B3] light:text-[#5E5A69]">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 pl-0.5">
        <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block shadow-2xs"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block shadow-2xs"></span>
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block shadow-2xs"></span>
      </div>
      <span class="font-mono font-semibold text-[11px] text-[#A994F7] uppercase tracking-wider">${escapeHtml(language)}</span>
    </div>
    <div class="flex items-center gap-1.5">
      ${
        isRunnable
          ? `<button type="button" class="preview-code-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-sans font-semibold bg-[#8BCFC2]/15 hover:bg-[#8BCFC2]/25 text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 border border-[#8BCFC2]/30 transition-all cursor-pointer shadow-2xs active:scale-95" data-code="${encodedCode}" data-lang="${escapeHtml(language)}" title="تشغيل في المنصة الحية">
              <span class="material-icons" style="font-size: 13px;">play_arrow</span>
              <span>معاينة / تشغيل</span>
            </button>`
          : ''
      }
      <button type="button" class="copy-code-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium text-[#E6E4EC] dark:text-[#E6E4EC] light:text-stone-800 hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-black/5 transition-colors cursor-pointer" data-code="${encodedCode}">
        <span class="material-icons" style="font-size: 13px;">content_copy</span>
        <span>نسخ</span>
      </button>
    </div>
  </div>
  <pre class="p-3 text-xs font-mono overflow-x-auto text-[#E6E4EC] dark:text-[#E6E4EC] light:text-stone-900 leading-relaxed font-code"><code class="block language-${escapeHtml(language)}">${highlightedHtml}</code></pre>
</div>`;
      protectedPlaceholders.push({ placeholder, html: blockHtml });
      return placeholder;
    }
  );

  // 2. Extract and render Chemical Equations with \ce{...} (mhchem) with caching
  processed = processed.replace(/\\ce\{([^{}]+)\}/g, (_, formula) => {
    const rawFormula = formula.trim();
    let rendered = chemCache.get(rawFormula);
    if (!rendered) {
      try {
        rendered = katex.renderToString(`\\ce{${rawFormula}}`, {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        rendered = `<span class="font-mono text-xs text-[#8BCFC2]">${escapeHtml(rawFormula)}</span>`;
      }
      chemCache.set(rawFormula, rendered);
    }
    const placeholder = `%%CHEM_INLINE_${placeholderCounter++}%%`;
    const html = `<span class="chem-badge inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-lg bg-[#8BCFC2]/10 border border-[#8BCFC2]/25 text-[#8BCFC2] text-xs font-mono align-middle" dir="ltr" title="معادلة كيميائية"><span class="material-icons text-[12px] opacity-75">science</span><span>${rendered}</span></span>`;
    protectedPlaceholders.push({ placeholder, html });
    return placeholder;
  });

  // 3. Extract and render LaTeX Block Equations: $$ equation $$ or \[ equation \] with caching
  processed = processed.replace(/(?:\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\])/g, (_, eq1, eq2) => {
    const rawEquation = (eq1 || eq2 || '').trim();
    let rendered = katexDisplayCache.get(rawEquation);
    if (!rendered) {
      try {
        rendered = katex.renderToString(rawEquation, {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        rendered = `<div class="font-mono text-center my-2 text-sm text-[#A994F7]">${escapeHtml(rawEquation)}</div>`;
      }
      katexDisplayCache.set(rawEquation, rendered);
    }
    const placeholder = `%%MATH_BLOCK_${placeholderCounter++}%%`;
    const html = `
<div class="my-3.5 py-3 px-4 overflow-x-auto rounded-xl bg-white/5 dark:bg-white/5 light:bg-black/5 border border-white/10 dark:border-white/10 light:border-black/10 text-center shadow-xs" dir="ltr">
  <div class="katex-display-container inline-block text-center max-w-full">${rendered}</div>
</div>`;
    protectedPlaceholders.push({ placeholder, html });
    return placeholder;
  });

  // 4. Extract and render LaTeX Inline Equations: $ equation $ or \( equation \) with caching
  processed = processed.replace(/(?:\$([^$\n]+?)\$|\\\(([^)]+?)\\\))/g, (_, eq1, eq2) => {
    const rawEquation = (eq1 || eq2 || '').trim();
    let rendered = katexInlineCache.get(rawEquation);
    if (!rendered) {
      try {
        rendered = katex.renderToString(rawEquation, {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        rendered = `<span class="font-mono text-xs text-[#A994F7]">${escapeHtml(rawEquation)}</span>`;
      }
      katexInlineCache.set(rawEquation, rendered);
    }
    const placeholder = `%%MATH_INLINE_${placeholderCounter++}%%`;
    protectedPlaceholders.push({
      placeholder,
      html: `<span class="inline-math px-1 py-0.5 mx-0.5 rounded bg-white/5 dark:bg-white/5 light:bg-black/5 font-mono text-xs" dir="ltr">${rendered}</span>`,
    });
    return placeholder;
  });

  // 5. Escape general HTML to prevent XSS
  processed = escapeHtml(processed);

  // 6. Markdown Dividers: --- or ***
  processed = processed.replace(
    /^(?:[-*_]){3,}\s*$/gm,
    '<hr class="my-4 border-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 dark:via-white/15 light:via-black/15 to-transparent">'
  );

  // 7. Expandable Details / Summary: <details><summary>Title</summary>Body</details>
  processed = processed.replace(
    /&lt;details&gt;\s*&lt;summary&gt;([\s\S]*?)&lt;\/summary&gt;([\s\S]*?)&lt;\/details&gt;/gi,
    (_, summary, body) => {
      return `
<details class="my-3 p-3 rounded-xl border border-white/10 dark:border-white/10 light:border-black/10 bg-white/5 dark:bg-white/5 light:bg-black/5 text-xs md:text-sm group">
  <summary class="font-semibold cursor-pointer text-[#A994F7] hover:text-[#BDB0F9] transition-colors select-none flex items-center gap-2">
    <span class="material-icons text-[16px] group-open:rotate-90 transition-transform">chevron_right</span>
    <span>${summary.trim()}</span>
  </summary>
  <div class="mt-2.5 pt-2.5 border-t border-white/5 dark:border-white/5 light:border-black/5 text-inherit leading-relaxed">
    ${body.trim()}
  </div>
</details>`;
    }
  );

  // 8. Markdown Tables
  const tableRegex = /((?:^|\n)\|[^\n]+\|\n\|[\s-:]+\|\n(?:\|[^\n]+\|\n?)+)/g;
  processed = processed.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 3) return match;

    const headerLine = lines[0];
    const dataLines = lines.slice(2);

    const parseRow = (line: string) =>
      line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

    const headers = parseRow(headerLine);
    const rows = dataLines.map((l) => parseRow(l));

    let tableHtml = `
<div class="my-3.5 overflow-x-auto rounded-xl border border-white/10 dark:border-white/10 light:border-black/10 shadow-sm">
  <table class="w-full text-xs md:text-sm text-right border-collapse">
    <thead>
      <tr class="bg-white/5 dark:bg-white/5 light:bg-black/5 border-b border-white/10 dark:border-white/10 light:border-black/10">`;

    for (const h of headers) {
      tableHtml += `<th class="px-3.5 py-2.5 font-semibold text-[#A994F7]">${h}</th>`;
    }
    tableHtml += `</tr></thead><tbody class="divide-y divide-white/5 dark:divide-white/5 light:divide-black/5">`;

    for (const row of rows) {
      tableHtml += `<tr class="hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-black/5 transition-colors">`;
      for (const cell of row) {
        tableHtml += `<td class="px-3.5 py-2 text-inherit">${cell}</td>`;
      }
      tableHtml += `</tr>`;
    }

    tableHtml += `</tbody></table></div>`;

    const placeholder = `%%TABLE_BLOCK_${placeholderCounter++}%%`;
    protectedPlaceholders.push({ placeholder, html: tableHtml });
    return placeholder;
  });

  // 9. Callout Blocks: > [!NOTE], > [!WARNING], > [!TIP], > [!IMPORTANT]
  processed = processed.replace(
    /^&gt;\s*\[!(NOTE|INFO|TIP|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/gim,
    (_, type, title) => {
      const calloutType = type.toUpperCase();
      let icon = 'info';
      let borderClass = 'border-[#8BCFC2]';
      let bgClass = 'bg-[#8BCFC2]/10';
      let textClass = 'text-[#8BCFC2]';
      let label = title || 'ملاحظة';

      if (calloutType === 'WARNING' || calloutType === 'CAUTION') {
        icon = 'warning_amber';
        borderClass = 'border-amber-400';
        bgClass = 'bg-amber-400/10';
        textClass = 'text-amber-300';
        label = title || 'تنبيه هام';
      } else if (calloutType === 'TIP') {
        icon = 'lightbulb';
        borderClass = 'border-[#A994F7]';
        bgClass = 'bg-[#A994F7]/10';
        textClass = 'text-[#A994F7]';
        label = title || 'نصيحة مفيدة';
      } else if (calloutType === 'IMPORTANT') {
        icon = 'priority_high';
        borderClass = 'border-rose-400';
        bgClass = 'bg-rose-400/10';
        textClass = 'text-rose-300';
        label = title || 'هام للغاية';
      }

      return `<div class="my-2.5 p-3 rounded-xl border-r-4 ${borderClass} ${bgClass} text-xs md:text-sm flex items-start gap-2.5">
        <span class="material-icons shrink-0 ${textClass}" style="font-size: 18px;">${icon}</span>
        <div class="flex-1 font-medium ${textClass}">${label}</div>
      </div>`;
    }
  );

  // 10. Regular blockquotes: > quote
  processed = processed.replace(
    /^&gt;\s*(.*$)/gim,
    '<blockquote class="border-r-2 border-[#A994F7] pr-3 my-2 text-xs md:text-sm text-[#A6A2B3] dark:text-[#A6A2B3] light:text-stone-600 italic bg-white/[0.02] dark:bg-white/[0.02] light:bg-black/[0.02] py-1 rounded-l">$1</blockquote>'
  );

  // 11. Checklists / Task lists: - [ ] unchecked, - [x] checked
  processed = processed.replace(
    /^\s*[-*]\s+\[ \]\s+(.*)$/gim,
    '<li class="task-list-item flex items-start gap-2 my-1 text-xs md:text-sm list-none"><span class="w-4 h-4 rounded border border-[#A6A2B3]/50 shrink-0 mt-0.5 flex items-center justify-center"></span><span class="flex-1 leading-relaxed">$1</span></li>'
  );
  processed = processed.replace(
    /^\s*[-*]\s+\[[xX]\]\s+(.*)$/gim,
    '<li class="task-list-item task-completed flex items-start gap-2 my-1 text-xs md:text-sm list-none"><span class="w-4 h-4 rounded bg-[#8BCFC2]/20 border border-[#8BCFC2] text-[#8BCFC2] shrink-0 mt-0.5 flex items-center justify-center"><span class="material-icons text-[12px]">check</span></span><span class="flex-1 leading-relaxed line-through opacity-70">$1</span></li>'
  );

  // 12. Inline code: `code`
  processed = processed.replace(/`([^`]+)`/g, (_, code) => {
    return `<code class="px-1.5 py-0.5 mx-0.5 rounded-md bg-white/10 dark:bg-white/10 light:bg-black/10 text-[#A994F7] dark:text-[#A994F7] light:text-[#7C5CE6] font-mono text-xs font-semibold">${code}</code>`;
  });

  // 13. Interactive links: [title](url)
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, textLabel, url) => {
      const placeholder = `%%LINK_BLOCK_${placeholderCounter++}%%`;
      const html = renderWebsiteLink(textLabel, url);
      protectedPlaceholders.push({ placeholder, html });
      return placeholder;
    }
  );

  // 14. Auto-detect raw valid URLs (https://... or http://...)
  processed = processed.replace(
    /(https?:\/\/[^\s<>"'()[\]{}]+[^\s<>"'()[\]{}.,;!?])/gi,
    (matchedUrl) => {
      if (matchedUrl.includes('%%')) return matchedUrl;
      const placeholder = `%%URL_BLOCK_${placeholderCounter++}%%`;
      const html = renderRawUrl(matchedUrl);
      protectedPlaceholders.push({ placeholder, html });
      return placeholder;
    }
  );

  // 14b. Auto-detect www. websites: www.domain.com/...
  processed = processed.replace(
    /\b(www\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s<>"'()[\]{}]*[^\s<>"'()[\]{}.,;!?])?)/gi,
    (matchedUrl) => {
      if (matchedUrl.includes('%%')) return matchedUrl;
      const placeholder = `%%URL_BLOCK_${placeholderCounter++}%%`;
      const html = renderRawUrl(matchedUrl);
      protectedPlaceholders.push({ placeholder, html });
      return placeholder;
    }
  );

  // 14c. Auto-detect standalone domain recommendations like google.com, youtube.com, github.com, coursera.org, etc.
  processed = processed.replace(
    /(?:^|[\s(])([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|ai|io|app|dev|edu|gov|me|co|info|ly|xyz|site|online|store|tech)(?:\/[^\s<>"'()[\]{}]*[^\s<>"'()[\]{}.,;!?])?)(?=[\s).,;!?]|$)/gi,
    (fullMatch, domainMatch) => {
      if (fullMatch.includes('%%') || domainMatch.includes('%%')) return fullMatch;
      const placeholder = `%%URL_BLOCK_${placeholderCounter++}%%`;
      const html = renderRawUrl(domainMatch);
      protectedPlaceholders.push({ placeholder, html });
      return fullMatch.replace(domainMatch, placeholder);
    }
  );

  // 15. Typographic Headings with distinct visual hierarchy
  processed = processed.replace(
    /^##### (.*$)/gim,
    '<h6 class="text-xs font-bold text-[#A6A2B3] dark:text-[#A6A2B3] light:text-stone-600 uppercase tracking-wide mt-2.5 mb-1">$1</h6>'
  );
  processed = processed.replace(
    /^#### (.*$)/gim,
    '<h5 class="text-xs md:text-sm font-bold text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 mt-2.5 mb-1">$1</h5>'
  );
  processed = processed.replace(
    /^### (.*$)/gim,
    '<h4 class="text-sm md:text-base font-bold text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 mt-3 mb-1.5 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#8BCFC2]"></span><span>$1</span></h4>'
  );
  processed = processed.replace(
    /^## (.*$)/gim,
    '<h3 class="text-base md:text-lg font-bold text-[#A994F7] dark:text-[#A994F7] light:text-[#7C5CE6] mt-4 mb-2 pb-1 border-b border-white/10 dark:border-white/10 light:border-black/10">$1</h3>'
  );
  processed = processed.replace(
    /^# (.*$)/gim,
    '<h2 class="text-lg md:text-xl font-extrabold text-white dark:text-white light:text-stone-900 mt-4 mb-2 pb-1.5 border-b border-[#A994F7]/30">$1</h2>'
  );

  // 16. Bold & Italic
  processed = processed.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-bold text-white dark:text-white light:text-stone-900">$1</strong>'
  );
  processed = processed.replace(
    /\*([^*]+)\*/g,
    '<em class="italic text-inherit opacity-90">$1</em>'
  );

  // 17. Regular Lists
  processed = processed.replace(
    /^\s*[-*]\s+(.*)$/gim,
    '<li class="my-1 text-xs md:text-sm list-disc list-inside leading-relaxed">$1</li>'
  );
  processed = processed.replace(
    /^\s*(\d+)\.\s+(.*)$/gim,
    '<li class="my-1 text-xs md:text-sm list-decimal list-inside leading-relaxed">$2</li>'
  );

  // 18. Paragraphs and line breaks
  processed = processed.replace(/\n\n+/g, '</p><p class="my-2.5">');
  processed = processed.replace(/\n/g, '<br/>');

  // 19. Restore protected elements
  for (const item of protectedPlaceholders) {
    processed = processed.replace(item.placeholder, item.html);
  }

  const result = `<div class="rich-rendered-message leading-relaxed text-xs md:text-sm break-words">${processed}</div>`;
  markdownCache.set(text, result);
  return result;
}
