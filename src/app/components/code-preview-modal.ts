import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
  output,
  signal,
  linkedSignal,
  computed,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ChatState } from '../services/chat-state';

export interface CodeSnippet {
  language: string;
  code: string;
  filename?: string;
}

@Component({
  selector: 'app-code-preview-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md transition-all duration-200"
      (click)="onBackdropClick($event)"
      (keydown.escape)="closeModal.emit()"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="chatState.language() === 'ar' ? 'منصة تشغيل ومعاينة الأكواد' : 'Live Code Playground'"
    >
      <div
        class="relative w-full max-w-5xl h-[92vh] max-h-[850px] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200"
        [class]="chatState.theme() === 'dark'
          ? 'bg-[#14141B] border-white/10 text-[#E6E4EC]'
          : 'bg-[#FFFFFF] border-black/15 text-stone-900'"
      >
        <!-- Modal Top Bar -->
        <div
          class="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b"
          [class]="chatState.theme() === 'dark'
            ? 'bg-[#181822] border-white/10'
            : 'bg-[#F6F4EE] border-black/10'"
        >
          <!-- Left: Mac dots + Title & Viewport Switcher -->
          <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div class="hidden sm:flex items-center gap-1.5 pl-1">
              <span class="w-3 h-3 rounded-full bg-rose-500/80 inline-block shadow-2xs"></span>
              <span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block shadow-2xs"></span>
              <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block shadow-2xs"></span>
            </div>

            <div class="flex items-center gap-1.5">
              <mat-icon class="text-[#A994F7]" style="font-size: 20px; width: 20px; height: 20px;">play_circle</mat-icon>
              <h3 class="font-bold text-xs sm:text-sm font-sans">
                {{ chatState.language() === 'ar' ? 'منصة تشغيل ومعاينة الأكواد الحية' : 'Sandboxed Code Playground' }}
              </h3>
            </div>

            <!-- Viewport Switcher -->
            <div
              class="hidden md:flex items-center gap-1 p-0.5 rounded-lg border text-xs"
              [class]="chatState.theme() === 'dark'
                ? 'bg-black/30 border-white/10 text-[#A6A2B3]'
                : 'bg-white border-black/10 text-stone-600'"
            >
              <button
                type="button"
                (click)="viewportMode.set('full')"
                class="px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                [class]="viewportMode() === 'full'
                  ? 'bg-[#A994F7] text-[#111116] font-bold shadow-xs'
                  : 'hover:text-white dark:hover:text-white light:hover:text-stone-900'"
                [attr.title]="chatState.language() === 'ar' ? 'عرض كامل' : 'Full Width'"
              >
                <mat-icon style="font-size: 14px; width: 14px; height: 14px;">fullscreen</mat-icon>
                <span>{{ chatState.language() === 'ar' ? 'كامل' : 'Full' }}</span>
              </button>

              <button
                type="button"
                (click)="viewportMode.set('tablet')"
                class="px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                [class]="viewportMode() === 'tablet'
                  ? 'bg-[#A994F7] text-[#111116] font-bold shadow-xs'
                  : 'hover:text-white dark:hover:text-white light:hover:text-stone-900'"
                [attr.title]="chatState.language() === 'ar' ? 'شاشة تابلت (768px)' : 'Tablet (768px)'"
              >
                <mat-icon style="font-size: 14px; width: 14px; height: 14px;">tablet_mac</mat-icon>
                <span>768px</span>
              </button>

              <button
                type="button"
                (click)="viewportMode.set('mobile')"
                class="px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                [class]="viewportMode() === 'mobile'
                  ? 'bg-[#A994F7] text-[#111116] font-bold shadow-xs'
                  : 'hover:text-white dark:hover:text-white light:hover:text-stone-900'"
                [attr.title]="chatState.language() === 'ar' ? 'شاشة هاتف (375px)' : 'Mobile (375px)'"
              >
                <mat-icon style="font-size: 14px; width: 14px; height: 14px;">smartphone</mat-icon>
                <span>375px</span>
              </button>
            </div>
          </div>

          <!-- Right: Action Buttons -->
          <div class="flex items-center gap-1.5">
            <!-- Run / Re-run -->
            <button
              type="button"
              (click)="runCode()"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#8BCFC2]/15 hover:bg-[#8BCFC2]/25 text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 text-xs font-semibold border border-[#8BCFC2]/30 transition-all cursor-pointer active:scale-95 shadow-2xs"
              [attr.title]="chatState.language() === 'ar' ? 'إعادة تشغيل الكود' : 'Run / Refresh'"
            >
              <mat-icon style="font-size: 15px; width: 15px; height: 15px;">refresh</mat-icon>
              <span>{{ chatState.language() === 'ar' ? 'تشغيل' : 'Run' }}</span>
            </button>

            <!-- Reset to original -->
            <button
              type="button"
              (click)="resetCode()"
              class="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5 transition-colors cursor-pointer"
              [attr.title]="chatState.language() === 'ar' ? 'استعادة الكود الأصلي' : 'Reset original code'"
            >
              <mat-icon style="font-size: 15px; width: 15px; height: 15px;">restart_alt</mat-icon>
            </button>

            <!-- Copy Code -->
            <button
              type="button"
              (click)="copyCode()"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer"
              [class]="isCopied()
                ? 'bg-[#8BCFC2]/20 border-[#8BCFC2]/40 text-[#8BCFC2]'
                : 'border-white/10 dark:border-white/10 light:border-black/10 hover:bg-white/5 text-[#E6E4EC] dark:text-[#E6E4EC] light:text-stone-800'"
              [attr.title]="chatState.language() === 'ar' ? 'نسخ الكود' : 'Copy code'"
            >
              <mat-icon style="font-size: 14px; width: 14px; height: 14px;">
                {{ isCopied() ? 'check' : 'content_copy' }}
              </mat-icon>
              <span>{{ isCopied() ? (chatState.language() === 'ar' ? 'تم' : 'Copied') : (chatState.language() === 'ar' ? 'نسخ' : 'Copy') }}</span>
            </button>

            <!-- Close Button -->
            <button
              type="button"
              (click)="closeModal.emit()"
              class="p-1 sm:p-1.5 rounded-lg text-[#A6A2B3] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              [attr.aria-label]="chatState.language() === 'ar' ? 'إغلاق المعاينة' : 'Close preview'"
            >
              <mat-icon style="font-size: 18px; width: 18px; height: 18px;">close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Mode Tabs: Live Preview vs Code Editor -->
        <div
          class="flex items-center justify-between px-3 sm:px-4 py-1.5 border-b text-xs"
          [class]="chatState.theme() === 'dark'
            ? 'bg-[#15151D] border-white/5'
            : 'bg-[#EFECE5] border-black/5'"
        >
          <div class="flex items-center gap-1">
            <button
              type="button"
              (click)="activeTab.set('preview')"
              class="px-3 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5"
              [class]="activeTab() === 'preview'
                ? 'bg-[#A994F7]/20 text-[#A994F7] font-semibold border border-[#A994F7]/30 shadow-2xs'
                : 'text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5'"
            >
              <mat-icon style="font-size: 15px; width: 15px; height: 15px;">visibility</mat-icon>
              <span>{{ chatState.language() === 'ar' ? 'المعاينة الحية' : 'Live Preview' }}</span>
            </button>

            <button
              type="button"
              (click)="activeTab.set('code')"
              class="px-3 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5"
              [class]="activeTab() === 'code'
                ? 'bg-[#A994F7]/20 text-[#A994F7] font-semibold border border-[#A994F7]/30 shadow-2xs'
                : 'text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5'"
            >
              <mat-icon style="font-size: 15px; width: 15px; height: 15px;">code</mat-icon>
              <span>{{ chatState.language() === 'ar' ? 'الكود المصدري' : 'Source Code' }}</span>
            </button>
          </div>

          <!-- Sandbox Security Indicator -->
          <div class="flex items-center gap-1 text-[11px] text-emerald-400/90 font-mono">
            <mat-icon style="font-size: 13px; width: 13px; height: 13px;">security</mat-icon>
            <span class="hidden sm:inline">{{ chatState.language() === 'ar' ? 'بيئة معزولة وآمنة (Sandboxed Iframe)' : 'Sandboxed & Isolated' }}</span>
          </div>
        </div>

        <!-- Main Body -->
        <div class="relative flex-1 w-full overflow-hidden flex flex-col bg-[#0E0E12] dark:bg-[#0E0E12] light:bg-[#F2EFE9]">
          <!-- TAB 1: LIVE PREVIEW IFRAME -->
          <div
            class="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-auto transition-all"
            [class.hidden]="activeTab() !== 'preview'"
          >
            <div
              class="h-full bg-white rounded-xl shadow-lg border border-black/15 overflow-hidden transition-all duration-300 flex flex-col"
              [style.width]="viewportWidth()"
            >
              <iframe
                #iframeRef
                class="w-full flex-1 border-0 bg-white"
                sandbox="allow-scripts"
                title="Sandboxed Output"
                [srcdoc]="compiledDocument()"
              ></iframe>
            </div>
          </div>

          <!-- TAB 2: CODE SOURCE VIEW / EDIT -->
          <div
            class="w-full h-full flex flex-col p-3 overflow-hidden"
            [class.hidden]="activeTab() !== 'code'"
          >
            <div class="flex items-center justify-between pb-2 text-xs text-[#A6A2B3]">
              <span class="font-mono">{{ primarySnippet().language.toUpperCase() }}</span>
              <span>{{ chatState.language() === 'ar' ? 'يمكنك تعديل الكود والضغط على تشغيل' : 'You can edit code and click Run' }}</span>
            </div>
            <textarea
              #editorRef
              [value]="currentCode()"
              (input)="onCodeChange($event)"
              class="w-full flex-1 bg-[#14141C] text-[#E6E4EC] font-mono text-xs sm:text-sm p-4 rounded-xl border border-white/10 focus:outline-none focus:border-[#A994F7]/60 resize-none leading-relaxed overflow-auto"
              dir="ltr"
              spellcheck="false"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CodePreviewModal implements OnDestroy {
  chatState = inject(ChatState);

  initialSnippet = input.required<CodeSnippet>();
  closeModal = output<void>();

  @ViewChild('iframeRef') iframeRef?: ElementRef<HTMLIFrameElement>;

  activeTab = signal<'preview' | 'code'>('preview');
  viewportMode = signal<'full' | 'tablet' | 'mobile'>('full');
  isCopied = signal<boolean>(false);

  currentCode = linkedSignal(() => this.initialSnippet().code);
  primarySnippet = computed(() => this.initialSnippet());

  viewportWidth = computed(() => {
    switch (this.viewportMode()) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  });

  // Assemble full HTML document safely wrapped in sandbox
  compiledDocument = computed(() => {
    const raw = this.currentCode() || this.initialSnippet().code || '';
    const lang = (this.initialSnippet().language || 'html').toLowerCase();

    // If pure HTML that already has doctype or html tag, inject runtime error listener & Tailwind CDN
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<body')) {
      return this.wrapWithRuntimeCatcher(raw);
    }

    // If JavaScript / TypeScript
    if (lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
      const wrapped = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JS Output</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 1.25rem; font-family: system-ui, sans-serif; background: #0F0F14; color: #E6E4EC; }
    #console-out { background: #181822; border: 1px solid rgba(255,255,255,0.1); border-radius: 0.75rem; padding: 1rem; font-family: monospace; font-size: 13px; line-height: 1.6; max-height: 70vh; overflow-y: auto; white-space: pre-wrap; }
    .log-line { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px 0; }
    .log-error { color: #f87171; }
    .log-warn { color: #fbbf24; }
    .log-info { color: #60a5fa; }
  </style>
</head>
<body>
  <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
    <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #A994F7;">Console Output</h3>
    <button onclick="document.getElementById('console-out').innerHTML=''" style="background: rgba(255,255,255,0.08); color: #fff; border: 0; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11px;">Clear</button>
  </div>
  <div id="console-out"></div>

  <script>
    const out = document.getElementById('console-out');
    function appendLog(type, args) {
      const line = document.createElement('div');
      line.className = 'log-line ' + (type === 'error' ? 'log-error' : type === 'warn' ? 'log-warn' : '');
      line.textContent = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args) => { origLog(...args); appendLog('log', args); };
    console.warn = (...args) => { origWarn(...args); appendLog('warn', args); };
    console.error = (...args) => { origError(...args); appendLog('error', args); };
    window.onerror = (msg, url, line) => { appendLog('error', ['[Error: ' + msg + ' (Line ' + line + ')]']); return false; };
  </script>
  <script>
    try {
      ${raw}
    } catch(err) {
      console.error(err.message || String(err));
    }
  </script>
</body>
</html>`;
      return wrapped;
    }

    // If CSS
    if (lang === 'css') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 2rem; font-family: system-ui, sans-serif; background: #fff; color: #111; }
    ${raw}
  </style>
</head>
<body>
  <div class="preview-container">
    <h1>Preview Heading</h1>
    <p>This is preview paragraph demonstrating CSS styling.</p>
    <button class="btn">Sample Button</button>
    <div class="box">Sample Styled Box</div>
  </div>
</body>
</html>`;
    }

    // Default: Embed snippet into basic modern HTML wrapper
    return this.wrapWithRuntimeCatcher(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 1.5rem; font-family: system-ui, -apple-system, sans-serif; color: #1f2937; }
  </style>
</head>
<body>
  ${raw}
</body>
</html>`);
  });

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeModal.emit();
    }
  }

  ngOnDestroy() {
    if (this.iframeRef?.nativeElement) {
      this.iframeRef.nativeElement.srcdoc = '';
    }
  }

  onCodeChange(event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.currentCode.set(val);
  }

  runCode() {
    this.activeTab.set('preview');
    if (this.iframeRef?.nativeElement) {
      this.iframeRef.nativeElement.srcdoc = this.compiledDocument();
    }
  }

  resetCode() {
    this.currentCode.set(this.initialSnippet().code);
    this.runCode();
  }

  async copyCode() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(this.currentCode());
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    }
  }

  private wrapWithRuntimeCatcher(html: string): string {
    const errorListener = `
<script>
window.addEventListener('error', function(e) {
  var b = document.createElement('div');
  b.style = 'position:fixed;bottom:12px;left:12px;right:12px;background:#ef4444;color:#fff;padding:10px 14px;border-radius:8px;font-family:monospace;font-size:12px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  b.innerHTML = '<strong>Javascript Error:</strong> ' + (e.message || 'Unknown runtime error');
  document.body.appendChild(b);
  setTimeout(function() { if(b.parentNode) b.parentNode.removeChild(b); }, 5000);
});
</script>
`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${errorListener}</head>`);
    }
    return `${errorListener}${html}`;
  }
}
