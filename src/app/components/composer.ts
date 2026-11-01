import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ChatState } from '../services/chat-state';
import { Attachment } from '../core/types';

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultRecord {
  0?: SpeechRecognitionResultItem;
  isFinal?: boolean;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultRecord[];
}

interface SpeechRecognitionErrorEvent {
  error?: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="relative w-full max-w-4xl mx-auto px-3 sm:px-4 pb-1.5 sm:pb-2">
      <!-- Hidden image and camera inputs (Images only) -->
      <input
        #fileInput
        type="file"
        multiple
        class="hidden"
        (change)="onFilesSelected($event)"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
      />
      <input
        #cameraInput
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        class="hidden"
        (change)="onFilesSelected($event)"
      />

      <div
        class="relative flex flex-col rounded-2xl border shadow-lg transition-all duration-200 focus-within:ring-2 focus-within:ring-[#A994F7]/25"
        [class]="chatState.theme() === 'dark'
          ? 'bg-[#181820] border-white/10 focus-within:border-[#A994F7]/60'
          : 'bg-[#FFFFFF] border-black/15 focus-within:border-[#7C5CE6] shadow-sm'"
      >
        <!-- Pending Image Attachments Preview Shelf -->
        @if (chatState.pendingAttachments().length > 0) {
          <div class="flex items-center gap-2 p-2.5 overflow-x-auto border-b border-white/5 dark:border-white/5 light:border-black/5">
            @for (att of chatState.pendingAttachments(); track att.id) {
              <div
                class="relative group shrink-0 flex items-center gap-2 pr-2 pl-1 py-1 rounded-xl text-xs border"
                [class]="chatState.theme() === 'dark'
                  ? 'bg-white/5 border-white/10 text-[#E6E4EC]'
                  : 'bg-black/5 border-black/10 text-stone-800'"
              >
                <img
                  [src]="att.dataUrl"
                  [alt]="att.name"
                  class="w-8 h-8 rounded-lg object-cover border border-white/10"
                  referrerpolicy="no-referrer"
                />
                <span class="truncate max-w-[120px] text-[11px] font-mono">{{ att.name }}</span>
                <button
                  type="button"
                  (click)="removeAttachment(att.id)"
                  class="p-0.5 rounded-full hover:bg-rose-500/20 text-[#A6A2B3] hover:text-rose-400 transition-colors cursor-pointer"
                  [attr.aria-label]="chatState.language() === 'ar' ? 'إزالة الصورة' : 'Remove image'"
                >
                  <mat-icon style="font-size: 14px; width: 14px; height: 14px;">close</mat-icon>
                </button>
              </div>
            }
          </div>
        }

        <!-- Voice Feedback / Error Banner -->
        @if (voiceFeedbackMessage()) {
          <div class="flex items-center justify-between px-4 py-2 bg-amber-500/15 text-amber-300 border-b border-amber-500/25 text-xs">
            <div class="flex items-center gap-1.5">
              <mat-icon style="font-size: 16px; width: 16px; height: 16px;">info</mat-icon>
              <span>{{ voiceFeedbackMessage() }}</span>
            </div>
            <button
              type="button"
              (click)="voiceFeedbackMessage.set(null)"
              class="p-0.5 rounded hover:text-white cursor-pointer"
              [attr.aria-label]="chatState.language() === 'ar' ? 'إغلاق التنبيه' : 'Dismiss notice'"
            >
              <mat-icon style="font-size: 14px; width: 14px; height: 14px;">close</mat-icon>
            </button>
          </div>
        }

        <!-- Audio Recording Banner if active -->
        @if (isRecordingVoice()) {
          <div class="flex items-center justify-between px-3 sm:px-4 py-2 bg-rose-500/15 text-rose-300 border-b border-rose-500/30 text-xs">
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
              <span class="font-bold">
                {{ chatState.language() === 'ar' ? 'الميكروفون نشط... تحدث الآن' : 'Listening... Speak now' }}
              </span>
              <div class="flex items-center gap-1 rtl:mr-1 rtl:ml-0 ltr:ml-1">
                <button
                  type="button"
                  (click)="setVoiceLang('ar-EG')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer"
                  [class]="voiceLanguage() === 'ar-EG'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-xs'
                    : 'bg-white/5 text-rose-200/80 hover:bg-white/10 border-white/10'"
                >
                  🇪🇬 مصري
                </button>
                <button
                  type="button"
                  (click)="setVoiceLang('ar-SA')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer"
                  [class]="voiceLanguage() === 'ar-SA'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-xs'
                    : 'bg-white/5 text-rose-200/80 hover:bg-white/10 border-white/10'"
                >
                  🇸🇦 عربي
                </button>
                <button
                  type="button"
                  (click)="setVoiceLang('en-US')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer"
                  [class]="voiceLanguage() === 'en-US'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-xs'
                    : 'bg-white/5 text-rose-200/80 hover:bg-white/10 border-white/10'"
                >
                  🇺🇸 English
                </button>
              </div>
            </div>
            <button
              type="button"
              (click)="stopVoiceRecording()"
              class="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              {{ chatState.language() === 'ar' ? 'تم / إيقاف' : 'Done / Stop' }}
            </button>
          </div>
        }

        <!-- Textarea Field -->
        <textarea
          #textareaRef
          [formControl]="inputControl"
          (keydown)="handleKeyDown($event)"
          (input)="adjustHeight()"
          rows="1"
          [placeholder]="
            chatState.language() === 'ar'
              ? 'تحدث مع جعفر... (اسأل، ارفع صورة، أو اطلب بحثاً حياً)'
              : 'Message Ja3far... (Ask, attach photo, or search web)'
          "
          class="w-full resize-none bg-transparent px-4 py-3 text-sm md:text-base focus:outline-none max-h-48 overflow-y-auto leading-relaxed"
          [class]="chatState.theme() === 'dark'
            ? 'text-[#E6E4EC] placeholder-[#A6A2B3]/60'
            : 'text-stone-900 placeholder-stone-400'"
          [attr.aria-label]="
            chatState.language() === 'ar' ? 'حقل إدخال الرسالة' : 'Message input field'
          "
        ></textarea>

        <!-- Composer Toolbar -->
        <div class="flex items-center justify-between px-3 py-2 border-t"
          [class]="chatState.theme() === 'dark' ? 'border-white/5' : 'border-black/5'"
        >
          <!-- Left: Image Attachment, Camera, Mic, Web Search badge -->
          <div class="flex items-center gap-1 sm:gap-1.5">
            <!-- Image Attachment Button (Images Only) -->
            <button
              type="button"
              (click)="triggerFileInput()"
              class="p-1.5 sm:p-2 rounded-xl text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-black/5 transition-colors cursor-pointer"
              [attr.title]="chatState.language() === 'ar' ? 'إرفاق صورة' : 'Attach image'"
              [attr.aria-label]="chatState.language() === 'ar' ? 'إرفاق صورة' : 'Attach image'"
            >
              <mat-icon style="font-size: 19px; width: 19px; height: 19px;">add_photo_alternate</mat-icon>
            </button>

            <!-- Camera Capture Button -->
            <button
              type="button"
              (click)="triggerCameraInput()"
              class="p-1.5 sm:p-2 rounded-xl text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-black/5 transition-colors cursor-pointer"
              [attr.title]="chatState.language() === 'ar' ? 'التقاط صورة بالكاميرا' : 'Take photo with camera'"
              [attr.aria-label]="chatState.language() === 'ar' ? 'التقاط صورة بالكاميرا' : 'Take photo with camera'"
            >
              <mat-icon style="font-size: 19px; width: 19px; height: 19px;">photo_camera</mat-icon>
            </button>

            <!-- Voice Dictation / Recording Button -->
            <button
              type="button"
              (click)="toggleVoiceRecording()"
              class="p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer"
              [class]="isRecordingVoice()
                ? 'bg-rose-500/25 text-rose-400 animate-pulse'
                : 'text-[#A6A2B3] hover:text-white dark:hover:text-white light:hover:text-stone-900 hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-black/5'"
              [attr.title]="chatState.language() === 'ar' ? (isRecordingVoice() ? 'إيقاف التسجيل الصوتي' : 'تسجيل صوتي (تحدث لجعفر)') : 'Voice recording'"
              [attr.aria-label]="chatState.language() === 'ar' ? 'تسجيل صوتي' : 'Voice recording'"
            >
              <mat-icon style="font-size: 19px; width: 19px; height: 19px;">
                {{ isRecordingVoice() ? 'mic' : 'mic_none' }}
              </mat-icon>
            </button>

            <!-- Live Search Indicator Chip -->
            <button
              type="button"
              (click)="toggleWebSearch()"
              class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all cursor-pointer"
              [class]="chatState.webSearchSettings().enabled
                ? 'bg-[#8BCFC2]/15 text-[#8BCFC2] dark:text-[#8BCFC2] light:text-teal-700 border-[#8BCFC2]/30'
                : 'bg-white/5 text-[#A6A2B3] border-transparent'"
              [attr.title]="chatState.language() === 'ar' ? 'تبديل البحث الحي على الإنترنت' : 'Toggle live web search'"
            >
              <mat-icon style="font-size: 14px; width: 14px; height: 14px;">travel_explore</mat-icon>
              <span>{{ chatState.language() === 'ar' ? (chatState.webSearchSettings().enabled ? 'بحث حي' : 'البحث معطل') : (chatState.webSearchSettings().enabled ? 'Live Search' : 'Search Off') }}</span>
            </button>
          </div>

          <!-- Right: Status & Send / Stop -->
          <div class="flex items-center gap-2">
            <!-- Cairo Time chip on desktop (Live ticking) -->
            @if (chatState.cairoTime(); as time) {
              <div class="hidden md:flex items-center gap-1 text-[11px] text-[#A6A2B3] dark:text-[#A6A2B3] light:text-stone-500 font-mono">
                <mat-icon style="font-size: 13px; width: 13px; height: 13px;">schedule</mat-icon>
                <span>{{ time.cairoTimeArabic }}</span>
              </div>
            }

            @if (chatState.isStreaming()) {
              <button
                type="button"
                (click)="chatState.stopStreaming()"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 dark:text-rose-300 light:text-rose-700 text-xs font-medium border border-rose-500/20 transition-all cursor-pointer"
                [attr.aria-label]="chatState.language() === 'ar' ? 'إيقاف التوليد' : 'Stop generation'"
              >
                <mat-icon style="font-size: 16px; width: 16px; height: 16px;">stop</mat-icon>
                <span>{{ chatState.language() === 'ar' ? 'إيقاف' : 'Stop' }}</span>
              </button>
            } @else {
              <button
                type="button"
                (click)="submit()"
                [disabled]="!hasContent()"
                class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#A994F7] text-[#111116] hover:bg-[#BDB0F9] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm active:scale-95"
                [attr.aria-label]="chatState.language() === 'ar' ? 'إرسال الرسالة' : 'Send message'"
              >
                <mat-icon style="font-size: 18px; width: 18px; height: 18px;">
                  arrow_upward
                </mat-icon>
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class Composer {
  chatState = inject(ChatState);

  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;

  inputControl = new FormControl<string>('', { nonNullable: true });
  isRecordingVoice = signal<boolean>(false);
  voiceLanguage = signal<string>('ar-EG');
  voiceFeedbackMessage = signal<string | null>(null);

  private speechRecognition: BrowserSpeechRecognition | null = null;
  private initialTextBeforeVoice = '';
  private committedSpokenText = '';
  private currentSessionFinal = '';
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  hasContent(): boolean {
    return (
      this.inputControl.value.trim().length > 0 ||
      this.chatState.pendingAttachments().length > 0
    );
  }

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  adjustHeight() {
    if (!this.textareaRef) return;
    const el = this.textareaRef.nativeElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  triggerFileInput() {
    this.fileInput?.nativeElement?.click();
  }

  triggerCameraInput() {
    this.cameraInput?.nativeElement?.click();
  }

  toggleWebSearch() {
    this.chatState.webSearchSettings.update((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  }

  // Handle image files selection (Images only - Documents removed as requested)
  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    let rejectedDocsCount = 0;

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      if (!file.type.startsWith('image/')) {
        rejectedDocsCount++;
        continue;
      }

      const dataUrl = await this.readFileAsDataUrl(file);
      const att: Attachment = {
        id: `att_${Date.now()}_${i}`,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'image/jpeg',
        dataUrl,
        type: 'image',
      };

      this.chatState.addAttachment(att);
    }

    if (rejectedDocsCount > 0) {
      this.voiceFeedbackMessage.set(
        this.chatState.language() === 'ar'
          ? 'عذراً، ميزة رفع المستندات معطلة. تم قبول الصور فقط.'
          : 'Document uploads are disabled. Only image files were accepted.'
      );
    }

    input.value = '';
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  removeAttachment(id: string) {
    this.chatState.removeAttachment(id);
  }

  // Set voice recognition language (Egyptian Arabic, Standard Arabic, or English)
  setVoiceLang(lang: string) {
    if (this.voiceLanguage() === lang) return;
    this.voiceLanguage.set(lang);
    if (this.isRecordingVoice()) {
      if (this.currentSessionFinal.trim()) {
        this.committedSpokenText = [this.committedSpokenText, this.currentSessionFinal.trim()]
          .filter(Boolean)
          .join(' ')
          .trim();
        this.currentSessionFinal = '';
      }
      this.spawnRecognitionSession();
    }
  }

  // Voice recording and dictation
  toggleVoiceRecording() {
    if (this.isRecordingVoice()) {
      this.stopVoiceRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  async startVoiceRecording() {
    if (typeof window === 'undefined') return;
    this.voiceFeedbackMessage.set(null);

    // Initial language detection
    if (
      this.chatState.language() === 'en' ||
      this.chatState.personalization().preferredDialect === 'english'
    ) {
      this.voiceLanguage.set('en-US');
    } else if (this.chatState.personalization().preferredDialect === 'saudi') {
      this.voiceLanguage.set('ar-SA');
    } else {
      this.voiceLanguage.set('ar-EG');
    }

    // Request and verify microphone permission via getUserMedia, then release tracks
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        this.voiceFeedbackMessage.set(
          this.chatState.language() === 'ar'
            ? 'يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح للبدء بالتحدث.'
            : 'Please allow microphone access in your browser settings.'
        );
        return;
      }
    }

    const win = window as unknown as WindowWithSpeech;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      this.voiceFeedbackMessage.set(
        this.chatState.language() === 'ar'
          ? 'المتصفح لا يدعم التعرف الصوتي المباشر. يمكنك استخدام الإملاء الصوتي من لوحة المفاتيح.'
          : 'Browser does not support native speech recognition. Please use keyboard dictation.'
      );
      return;
    }

    // Freeze base input text before recording starts so we NEVER duplicate or overwrite it
    this.initialTextBeforeVoice = this.inputControl.value ? this.inputControl.value.trim() : '';
    this.committedSpokenText = '';
    this.currentSessionFinal = '';
    this.isRecordingVoice.set(true);

    this.spawnRecognitionSession();
  }

  private spawnRecognitionSession() {
    if (!this.isRecordingVoice() || typeof window === 'undefined') return;

    if (this.speechRecognition) {
      const oldRec = this.speechRecognition;
      this.speechRecognition = null;
      oldRec.onresult = null;
      oldRec.onerror = null;
      oldRec.onend = null;
      try {
        oldRec.abort();
      } catch {
        // ignore
      }
    }

    const win = window as unknown as WindowWithSpeech;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.speechRecognition = new SpeechRec();
      this.speechRecognition.lang = this.voiceLanguage();
      // Continuous = true enables natural, unbroken speech capture across both mobile and desktop
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;

      this.currentSessionFinal = '';

      this.speechRecognition.onstart = () => {
        this.isRecordingVoice.set(true);
      };

      this.speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalAccumulator = '';
        let interimAccumulator = '';

        // Standard Web Speech API iteration over all results produced in this recognition session
        for (const res of event.results) {
          const transcript = res?.[0]?.transcript?.trim() || '';
          if (!transcript) continue;

          if (res.isFinal) {
            finalAccumulator = finalAccumulator
              ? `${finalAccumulator} ${transcript}`
              : transcript;
          } else {
            interimAccumulator = interimAccumulator
              ? `${interimAccumulator} ${transcript}`
              : transcript;
          }
        }

        finalAccumulator = this.sanitizeSpeechRepetitions(finalAccumulator);
        interimAccumulator = this.sanitizeSpeechRepetitions(interimAccumulator);

        this.currentSessionFinal = finalAccumulator;

        // Current session spoken words
        let sessionSpoken = '';
        if (finalAccumulator && interimAccumulator) {
          sessionSpoken = `${finalAccumulator} ${interimAccumulator}`;
        } else {
          sessionSpoken = finalAccumulator || interimAccumulator;
        }

        // Combine with committed text from earlier sessions if recognition restarted
        let totalSpoken = this.committedSpokenText;
        if (sessionSpoken) {
          totalSpoken = this.committedSpokenText
            ? this.mergeSpeechTokens(this.committedSpokenText, sessionSpoken)
            : sessionSpoken;
        }

        totalSpoken = this.sanitizeSpeechRepetitions(totalSpoken);

        const full = this.initialTextBeforeVoice
          ? `${this.initialTextBeforeVoice} ${totalSpoken}`.trim()
          : totalSpoken;

        if (full !== this.inputControl.value) {
          this.inputControl.setValue(full);
          this.adjustHeight();
        }
      };

      this.speechRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event?.error === 'no-speech') {
          return;
        }
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          this.voiceFeedbackMessage.set(
            this.chatState.language() === 'ar'
              ? 'يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح.'
              : 'Microphone permission was denied. Please allow microphone access.'
          );
          this.stopVoiceRecording();
        }
      };

      this.speechRecognition.onend = () => {
        if (this.currentSessionFinal.trim()) {
          const finalClean = this.sanitizeSpeechRepetitions(this.currentSessionFinal.trim());
          this.committedSpokenText = this.committedSpokenText
            ? this.mergeSpeechTokens(this.committedSpokenText, finalClean)
            : finalClean;
          this.committedSpokenText = this.sanitizeSpeechRepetitions(this.committedSpokenText);
          this.currentSessionFinal = '';
        }

        // Only gently restart if the user didn't stop the microphone and browser disconnected after silence
        if (this.isRecordingVoice()) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isRecordingVoice()) {
              this.spawnRecognitionSession();
            }
          }, 350);
        }
      };

      this.speechRecognition.start();
    } catch {
      this.stopVoiceRecording();
    }
  }

  /**
   * Intelligently merges two speech fragments by detecting and eliminating
   * overlapping phrases, duplicated prefixes, and repeated words caused by
   * browser speech recognition engines (especially Android Chrome's progressive hypotheses).
   */
  private mergeSpeechTokens(base: string, incoming: string): string {
    const b = (base || '').trim();
    const inc = (incoming || '').trim();
    if (!b) return inc;
    if (!inc) return b;

    // Normalization helper for phonetic/punctuation comparison
    const norm = (w: string) =>
      w.toLowerCase().replace(/[\p{P}\p{S}]/gu, '').trim();

    const normB = norm(b);
    const normInc = norm(inc);

    // If normalized strings are identical, return base
    if (normB === normInc) {
      return b;
    }

    // Fast check: if incoming already contains base at its start (progressive hypothesis expansion)
    if (normInc.startsWith(normB)) {
      return inc;
    }

    // Fast check: if base ends with incoming (incoming already fully captured at the end)
    if (normB.endsWith(normInc)) {
      return b;
    }

    // Tokenize into words
    const wordsA = b.split(/\s+/);
    const wordsB = inc.split(/\s+/);

    // Check for maximal overlap: words at the tail of A matching words at the head of B
    const maxOverlap = Math.min(wordsA.length, wordsB.length);
    for (let len = maxOverlap; len >= 1; len--) {
      const sliceA = wordsA.slice(wordsA.length - len);
      const sliceB = wordsB.slice(0, len);

      let matches = true;
      for (let i = 0; i < len; i++) {
        if (norm(sliceA[i]) !== norm(sliceB[i])) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // Overlap found of length `len`
        const remainingB = wordsB.slice(len);
        if (remainingB.length === 0) {
          return b; // incoming adds nothing new
        }
        return `${b} ${remainingB.join(' ')}`.trim();
      }
    }

    // Check if the whole incoming phrase is already contained somewhere within the last 8 words of base
    if (wordsB.length <= 6 && wordsA.length >= wordsB.length) {
      const recentWindow = wordsA.slice(-Math.min(wordsA.length, 12)).map(norm).join(' ');
      const incomingNorm = wordsB.map(norm).join(' ');
      if (recentWindow.includes(incomingNorm)) {
        return b;
      }
    }

    // No overlap detected; join cleanly
    return `${b} ${inc}`.trim();
  }

  /**
   * Collapses immediate multi-word or single-word repeated loops (e.g. "phrase A phrase A" -> "phrase A" or "مرحبا مرحبا" -> "مرحبا").
   */
  private sanitizeSpeechRepetitions(text: string): string {
    if (!text || !text.trim()) return '';

    let cleaned = text.trim();

    // Remove immediate single word duplicates (e.g. "اهلا اهلا" -> "اهلا", "hello hello" -> "hello")
    cleaned = cleaned.replace(/\b([\p{L}\p{N}]+)(\s+\1\b)+/giu, '$1');

    const words = cleaned.split(/\s+/);
    if (words.length <= 1) return cleaned;

    const norm = (w: string) =>
      w.toLowerCase().replace(/[\p{P}\p{S}]/gu, '').trim();

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 8) {
      changed = false;
      iterations++;

      const maxP = Math.floor(words.length / 2);
      for (let pLen = Math.min(maxP, 8); pLen >= 1; pLen--) {
        for (let i = 0; i <= words.length - 2 * pLen; i++) {
          const chunk1 = words.slice(i, i + pLen);
          const chunk2 = words.slice(i + pLen, i + 2 * pLen);

          let match = true;
          for (let j = 0; j < pLen; j++) {
            if (norm(chunk1[j]) !== norm(chunk2[j])) {
              match = false;
              break;
            }
          }

          if (match) {
            // Remove the duplicated phrase
            words.splice(i + pLen, pLen);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }

    return words.join(' ');
  }

  stopVoiceRecording() {
    this.isRecordingVoice.set(false);

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.speechRecognition) {
      const rec = this.speechRecognition;
      this.speechRecognition = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    }

    if (this.currentSessionFinal.trim()) {
      const finalClean = this.sanitizeSpeechRepetitions(this.currentSessionFinal.trim());
      this.committedSpokenText = this.committedSpokenText
        ? this.mergeSpeechTokens(this.committedSpokenText, finalClean)
        : finalClean;
      this.committedSpokenText = this.sanitizeSpeechRepetitions(this.committedSpokenText);
      this.currentSessionFinal = '';
    }

    const totalSpoken = this.committedSpokenText.trim();
    const full = this.initialTextBeforeVoice
      ? `${this.initialTextBeforeVoice} ${totalSpoken}`.trim()
      : totalSpoken;

    if (full) {
      this.inputControl.setValue(full);
      this.adjustHeight();
    }

    this.initialTextBeforeVoice = '';
    this.committedSpokenText = '';
  }

  submit() {
    this.stopVoiceRecording();
    const val = this.inputControl.value.trim();
    if (!this.hasContent() || this.chatState.isStreaming()) return;

    this.chatState.sendMessage(val);
    this.inputControl.setValue('');
    if (this.textareaRef) {
      this.textareaRef.nativeElement.style.height = 'auto';
    }
  }
}
