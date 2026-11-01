import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response } from 'express';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Parse JSON bodies with up to 25MB for image attachments and docs
app.use(express.json({ limit: '25mb' }));

// ==========================================
// SYSTEM TIME & CAIRO TIMEZONE
// ==========================================
export function getCairoInfo() {
  const now = new Date();
  const optionsDate: Intl.DateTimeFormatOptions = {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  const optionsTime: Intl.DateTimeFormatOptions = {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };

  const arabicDate = new Intl.DateTimeFormat('ar-EG', optionsDate).format(now);
  const arabicTime = new Intl.DateTimeFormat('ar-EG', optionsTime).format(now);
  const englishDate = new Intl.DateTimeFormat('en-US', optionsDate).format(now);
  const englishTime = new Intl.DateTimeFormat('en-US', optionsTime).format(now);

  return {
    timestamp: now.getTime(),
    timezone: 'Africa/Cairo',
    cairoDateArabic: arabicDate,
    cairoTimeArabic: arabicTime,
    cairoDateEnglish: englishDate,
    cairoTimeEnglish: englishTime,
    fullSummary: `التاريخ الفعلي الحالي: ${arabicDate}، الوقت: ${arabicTime} بتوقيت القاهرة (مصر - Africa/Cairo). العام الحالي هو ${now.getFullYear()}.`,
  };
}

// ==========================================
// CONFIGURATION & SECRETS STATE WITH GLOBAL PERSISTENCE
// ==========================================
const CONFIG_FILE_PATH = join(process.cwd(), '.server-config.json');

// Default NoTrack Key provided by user (works globally for all users)
const DEFAULT_NOTRACK_KEY = 'sk-notrack-59ff49ec2a1da9005f4c5c7bb2db31147dcc2fa73cb8b9e6';
const DEFAULT_NOTRACK_BASE_URL =
  (process.env['NOTRACK_BASE_URL'] || 'https://api.notrack.ai/v1').replace(/\/+$/, '');
const DEFAULT_NOTRACK_MODEL = process.env['NOTRACK_MODEL'] || 'notrack-uncensored';
const DEFAULT_ADMIN_CODE = process.env['ADMIN_ACCESS_CODE'] || '098765';

let adminAccessCode = DEFAULT_ADMIN_CODE;
let activeNoTrackKey = DEFAULT_NOTRACK_KEY;
let activeNoTrackBaseUrl = DEFAULT_NOTRACK_BASE_URL;
let activeNoTrackModel = DEFAULT_NOTRACK_MODEL;

// Load persistent config from disk on startup so changes are shared across all users and server restarts
function loadServerConfig() {
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      const raw = readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.activeNoTrackKey === 'string' && parsed.activeNoTrackKey.trim()) {
        const savedKey = parsed.activeNoTrackKey.trim();
        const isOldStaleKey =
          savedKey.includes('aa05') ||
          savedKey.includes('8572') ||
          savedKey.includes('693c') ||
          savedKey.includes('1cbf');
        activeNoTrackKey = isOldStaleKey ? DEFAULT_NOTRACK_KEY : savedKey;
      }
      if (typeof parsed.activeNoTrackBaseUrl === 'string' && parsed.activeNoTrackBaseUrl.trim()) {
        activeNoTrackBaseUrl = parsed.activeNoTrackBaseUrl.trim().replace(/\/+$/, '');
      }
      if (typeof parsed.activeNoTrackModel === 'string' && parsed.activeNoTrackModel.trim()) {
        activeNoTrackModel = parsed.activeNoTrackModel.trim();
      }
      if (typeof parsed.adminAccessCode === 'string' && parsed.adminAccessCode.trim()) {
        adminAccessCode = parsed.adminAccessCode.trim();
      }
      saveServerConfig();
    } else {
      saveServerConfig();
    }
  } catch (e) {
    console.error('Failed to load server config:', e);
  }
}

function saveServerConfig() {
  try {
    const data = {
      activeNoTrackKey,
      activeNoTrackBaseUrl,
      activeNoTrackModel,
      adminAccessCode,
      updatedAt: Date.now(),
    };
    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save server config:', e);
  }
}

// Initialize config on boot
loadServerConfig();

// Rate Limiting for Admin Verification
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
}
const adminRateLimits = new Map<string, RateLimitRecord>();

function checkAdminRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const record = adminRateLimits.get(ip);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.lockedUntil > now) {
    const waitSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (record.lockedUntil <= now && record.attempts >= 5) {
    // Lockout expired, reset attempts
    record.attempts = 0;
    record.lockedUntil = 0;
  }

  return { allowed: true };
}

function recordAdminFailure(ip: string) {
  const now = Date.now();
  let record = adminRateLimits.get(ip);
  if (!record) {
    record = { attempts: 1, lockedUntil: 0 };
    adminRateLimits.set(ip, record);
    return;
  }
  record.attempts += 1;
  if (record.attempts >= 5) {
    // 15 minutes lockout
    record.lockedUntil = now + 15 * 60 * 1000;
  }
}

function resetAdminFailures(ip: string) {
  adminRateLimits.delete(ip);
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '***';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function isValidUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// SYSTEM PROMPT BUILDER FOR JA3FAR AI
// ==========================================
interface PromptContext {
  userName?: string;
  userInterests?: string;
  personalNotes?: string;
  preferredLanguage?: 'ar' | 'en';
  preferredDialect?: 'egyptian' | 'saudi' | 'levantine' | 'msa' | 'english';
  assistantName?: string;
  personality?: 'friendly_humorous' | 'professional' | 'concise' | 'creative';
  tone?: 'casual' | 'formal';
  responseLength?: 'concise' | 'medium' | 'detailed';
  formattingStyle?: 'structured' | 'conversational' | 'code_heavy';
  customInstructions?: string;
  memories?: { key: string; value: string }[];
  enableLiveSearch?: boolean;
}

function buildSystemPrompt(context: PromptContext = {}): string {
  const cairoInfo = getCairoInfo();
  const assistantName = context.assistantName || 'جعفر';
  const dialect = context.preferredDialect || 'egyptian';
  const personality = context.personality || 'friendly_humorous';
  const tone = context.tone || 'casual';
  const length = context.responseLength || 'medium';

  let dialectGuideline = '';
  switch (dialect) {
    case 'egyptian':
      dialectGuideline = 'تحدث باللهجة المصرية الطبيعية الذكية والودية (مثل: تمام يا غالي، حاضر من عيوني، مفيش مشكلة، يا باشمهندس، على راسي، إلخ) مع صياغة واضحة وذكية بدون تصنع أو ابتذال، مع الحفاظ على القواعد العلمية والتقنية الصحيحة.';
      break;
    case 'saudi':
      dialectGuideline = 'تحدث باللهجة السعودية الخليجية البيضاء والمهذبة مع الحفاظ على الدقة العلمية.';
      break;
    case 'levantine':
      dialectGuideline = 'تحدث باللهجة الشامية اللطيفة والمحببة مع الدقة والوضوح.';
      break;
    case 'msa':
      dialectGuideline = 'تحدث باللغة العربية الفصحى السليمة والراقية مع صياغة فصيحة ومتقنة.';
      break;
    case 'english':
      dialectGuideline = 'Communicate in clear, natural, and highly articulate English.';
      break;
  }

  let personalityGuideline = '';
  switch (personality) {
    case 'friendly_humorous':
      personalityGuideline = 'كن ودوداً، ذكياً، وخفيف الظل بروح مصرية أصيلة دون مبالغة، واجعل المستخدم يشعر بالراحة والاهتمام.';
      break;
    case 'professional':
      personalityGuideline = 'كن مهنياً، منظماً، موضوعياً، ودقيقاً بأسلوب احترافي رفيع.';
      break;
    case 'concise':
      personalityGuideline = 'كن مباشراً، سريعاً، وركز على الإجابة المفيدة دون مقدمات طويلة أو حشو.';
      break;
    case 'creative':
      personalityGuideline = 'كن مبدعاً وغنياً بالأفكار والمجازات الجميلة والحلول غير التقليدية.';
      break;
  }

  let lengthGuideline = '';
  switch (length) {
    case 'concise':
      lengthGuideline = 'اجعل الردود موجزة ومباشرة وتفي بالغرض بدقة.';
      break;
    case 'detailed':
      lengthGuideline = 'قدم شروحات وافية وشاملة وتفاصيل دقيقة مع أمثلة واضحة وتنسيق منظم.';
      break;
    default:
      lengthGuideline = 'اجعل طول الرد متوازناً، يغطي المطلوب دون إطالة مملة.';
  }

  let userContextDetails = '';
  if (context.userName) {
    userContextDetails += `\n- اسم المستخدم: ${context.userName}`;
  }
  if (context.userInterests) {
    userContextDetails += `\n- اهتمامات المستخدم: ${context.userInterests}`;
  }
  if (context.personalNotes) {
    userContextDetails += `\n- ملاحظات وتفضيلات المستخدم: ${context.personalNotes}`;
  }
  if (context.memories && context.memories.length > 0) {
    userContextDetails += '\n- معلومات محفوظة عن المستخدم بالذاكرة:';
    for (const mem of context.memories) {
      userContextDetails += `\n  * [${mem.key}]: ${mem.value}`;
    }
  }

  let customInstructionText = '';
  if (context.customInstructions && context.customInstructions.trim()) {
    customInstructionText = `\n\nتعليمات خاصة من المستخدم يجب الالتزام بها بدقة:\n${context.customInstructions.trim()}`;
  }

  return `أنت "${assistantName}" (Ja3far AI)، المساعد الذكي المستقل وفائق الخصوصية المبني على تقنيات NoTrack.ai (نموذج notrack-uncensored).
أنت جعفر فقط، ولا تنسب نفسك أو تذكر أي شركة ذكاء اصطناعي أخرى تحت أي ظرف من الظروف.

معلومات المطور والمبتكر وصانعك (حقيقة ثابتة وأساسية في هويتك):
- مطورك، ومبتكرك، ومهندسك، وصانعك الذي برمجك وبناك وصنع هذا التطبيق بالكامل هو المطور: "بلال" (بلال أحمد - Belal Ahmed).
- بلال هو طالب ثانوي عام مصري مبدع، عشق البرمجة والذكاء الاصطناعي وصنعك بنفسه لتكون رفيقاً ومساعداً ذكياً فريداً وفائق الخصوصية.
- إذا سألك أي شخص بأي صيغة كانت، مثل: "مين صنعك؟"، "مين مطورك؟"، "مين بلال؟"، "مين عملك؟"، "مين مبرمجك؟"، "مين صاحبك؟"، أو أي سؤال عن هويتك وصانعك، أجب دائماً بكل فخر ومحبة واعتزاز وبأسلوبك الودود المريح (باللهجة المصرية اللطيفة أو الفصحى حسب السؤال) بأن مطورك وصانعك ومهندسك هو "بلال" (بلال أحمد - Belal Ahmed)، واذكره دائماً بكل خير وتقدير واعتزاز.

معلومات الزمان والمكان المؤكدة حالياً:
- ${cairoInfo.fullSummary}
- يجب أن تعتمد على هذا التاريخ والتوقيت في كل إجاباتك التي تتطلب معرفة التاريخ والوقت الحالي (مثال: المباريات الجارية، السنة الحالية، الأعياد والمواسم، آخر التطورات).

شخصيتك وأسلوبك:
- ${dialectGuideline}
- ${personalityGuideline}
- النبرة المطلوبة: ${tone === 'formal' ? 'رسمية وأنيقة' : 'عفوية وودية وغير متكلفة'}.
- تفضيل طول الرد: ${lengthGuideline}
- أنت قادر على رؤية وفحص وقراءة الصور والمرفقات بدقة وتحليل كل ما فيها وشرح محتواها والإجابة عن أي تفاصيل بداخلها عندما يرسل المستخدم صوراً.
- أنت تفهم بطلاقة العامية المصرية، اللهجات العربية الأخرى، الفصحى، واللغة الإنجليزية، وتجيب وفق لغة وسياق حديث المستخدم.
- إذا سألك المستخدم عن أخبار الرياضة ومباريات اليوم (خاصة الأهلي والزمالك والدوري المصري والإنجليزي ودوري أبطال أوروبا) أو التكنولوجيا أو الأسعار، استخدم أحدث المعلومات الموثوقة والمدققة، واذكر مصادرك أو تواريخ النشر إن وجدت.
- عندما تقدم كوداً برمجياً، نسقه دائماً داخل كتل كود مع تحديد اللغة، واستخدم أفضل الممارسات.
- عندما تحتوي الإجابة على معادلات رياضية، اكتبها بتنسيق LaTeX ($للمعادلات المضمنة$ أو $$للمعادلات المستقلة$$).
- نسق إجاباتك بمهارة باستخدام العناوين، القوائم المنقطة، والجداول المنظمة عند المقارنات.
- ميزة ترشيح وتوجيه المواقع والروابط (مهم جداً للمستخدم):
  عندما ترشح أو تقترح للمستخدم أي موقع إلكتروني، منصة، أداة، أو رابط مفيد (مثل: كورسيرا، يوتيوب، كانفا، ويكيبيديا، جيت هب، محركات بحث، أدوات، منصات تعليمية أو ترفيهية):
  * لا تكتب الموقع كنص عادي أبداً، بل اكتبه دائماً كرابط ماركداون قابل للنقر بصيغة: [اسم الموقع](https://example.com) أو اكتب عنوان الويب https://... لكي يظهر للمستخدم كزر/رابط تفاعلي مباشر يذهب به إلى الموقع فور الضغط عليه.
  * تأكد دائماً من أن الرابط يبدأ بـ https:// ليعمل الانتقال بسلاسة في نافذة جديدة.
${userContextDetails}${customInstructionText}
تذكر: أنت جعفر فقط، رفيق ذكي، أمين، عالي الكفاءة، وذو حضور مميز ومريح وفائق الخصوصية، وصانعك ومطورك هو بلال أحمد.`;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. System Time in Egypt (Africa/Cairo)
app.get('/api/time', (_req: Request, res: Response) => {
  res.json(getCairoInfo());
});

// 2. Health Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'Ja3far AI Backend (Powered by NoTrack.ai)',
    activeProvider: 'notrack',
    notrackReady: !!activeNoTrackKey,
    model: activeNoTrackModel,
    cairoTime: getCairoInfo().fullSummary,
  });
});

// 3. Public Masked Config
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    provider: 'notrack',
    baseUrl: activeNoTrackBaseUrl,
    model: activeNoTrackModel,
    apiKeyMasked: maskKey(activeNoTrackKey),
    isConfigured: !!activeNoTrackKey,
  });
});

// 4. Admin Authentication
app.post('/api/admin/verify', (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const { code } = req.body;

  const rateCheck = checkAdminRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({
      success: false,
      error: `تم قفل محاولات الدخول مؤقتاً بسبب تكرار الرمز الخاطئ. يرجى الانتظار ${rateCheck.waitSeconds} ثانية.`,
      locked: true,
      waitSeconds: rateCheck.waitSeconds,
    });
    return;
  }

  if (typeof code !== 'string' || code.trim() !== adminAccessCode) {
    recordAdminFailure(ip);
    res.status(401).json({
      success: false,
      error: 'رمز الوصول غير صحيح. يرجى التأكد والمحاولة مجدداً.',
    });
    return;
  }

  resetAdminFailures(ip);
  res.json({
    success: true,
    message: 'تم التحقق بنجاح من صلاحيات الإدارة.',
  });
});

// 5. Admin Change Access Code
app.post('/api/admin/change-code', (req: Request, res: Response) => {
  const { currentCode, newCode } = req.body;

  if (currentCode !== adminAccessCode) {
    res.status(401).json({ success: false, error: 'رمز الوصول الحالي غير صحيح.' });
    return;
  }

  if (!newCode || typeof newCode !== 'string' || newCode.trim().length < 6) {
    res.status(400).json({
      success: false,
      error: 'الرمز الجديد يجب أن يتكون من 6 خانات على الأقل.',
    });
    return;
  }

  adminAccessCode = newCode.trim();
  saveServerConfig();
  res.json({
    success: true,
    message: 'تم تغيير رمز الوصول الإداري بنجاح.',
  });
});

// 6. Admin Get Full API Configuration Status
app.get('/api/admin/config', (req: Request, res: Response) => {
  const authHeader = req.headers['x-admin-code'];
  if (authHeader !== adminAccessCode) {
    res.status(401).json({ error: 'غير مصرح بالوصول إلى لوحة الإدارة.' });
    return;
  }

  res.json({
    provider: 'notrack',
    notrack: {
      hasKey: !!activeNoTrackKey,
      maskedKey: maskKey(activeNoTrackKey),
      baseUrl: activeNoTrackBaseUrl,
      model: activeNoTrackModel,
    },
  });
});

// 7. Admin Update API Keys (Updates centrally and persistently for ALL users)
app.post('/api/admin/update-keys', (req: Request, res: Response) => {
  const authHeader = req.headers['x-admin-code'];
  if (authHeader !== adminAccessCode) {
    res.status(401).json({ error: 'غير مصرح بالوصول.' });
    return;
  }

  const { notrackKey, notrackBaseUrl, notrackModel } = req.body;

  if (typeof notrackKey === 'string' && notrackKey.trim()) {
    activeNoTrackKey = notrackKey.trim();
  }
  if (typeof notrackBaseUrl === 'string' && notrackBaseUrl.trim()) {
    if (!isValidUrl(notrackBaseUrl)) {
      res.status(400).json({ error: 'عنوان رابط NoTrack غير صالح أو محظور أمنياً.' });
      return;
    }
    activeNoTrackBaseUrl = notrackBaseUrl.trim().replace(/\/+$/, '');
  }
  if (typeof notrackModel === 'string' && notrackModel.trim()) {
    activeNoTrackModel = notrackModel.trim();
  }

  // Persist immediately to disk so it applies globally to all current & future users
  saveServerConfig();

  res.json({
    success: true,
    message: 'تم تحديث تكوين NoTrack وتعميمه بنجاح على جميع مستخدمي التطبيق.',
    activeProvider: 'notrack',
    notrackMasked: maskKey(activeNoTrackKey),
    model: activeNoTrackModel,
  });
});

// 8. Test API Connection (for diagnostics and admin validation)
app.post('/api/diagnostics/test-connection', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  if (!activeNoTrackKey) {
    res.status(200).json({
      success: false,
      provider: 'notrack',
      statusCode: 401,
      message: 'مفتاح NoTrack API غير مهيأ. يرجى إدخال مفتاح API في الإعدادات.',
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Step 1: Query models list
    let modelsList = [activeNoTrackModel];
    try {
      const modelsRes = await fetch(`${activeNoTrackBaseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${activeNoTrackKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (modelsRes.ok) {
        const mData = (await modelsRes.json()) as { data?: { id: string }[] };
        if (Array.isArray(mData?.data)) {
          modelsList = mData.data.map((m) => m.id);
        }
      }
    } catch {
      // non-fatal
    }

    // Step 2: Test REAL text completion generation with model "notrack-uncensored"
    // (Requirement 10: اختبر مسار إرسال رسالة نصية واستقبال رد حقيقي، ولا تعتبر نجاح الاتصال وحده دليلًا على نجاح توليد الرد)
    const pingRes = await fetch(`${activeNoTrackBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeNoTrackKey}`,
      },
      body: JSON.stringify({
        model: activeNoTrackModel,
        messages: [{ role: 'user', content: 'مرحبا' }],
        max_tokens: 16,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;

    if (!pingRes.ok) {
      const errText = await pingRes.text();
      const friendlyError = parseNoTrackError(pingRes.status, errText);
      res.status(200).json({
        success: false,
        provider: 'notrack',
        statusCode: pingRes.status,
        latencyMs,
        endpoint: activeNoTrackBaseUrl,
        activeModel: activeNoTrackModel,
        availableModels: modelsList,
        rawError: errText,
        message: friendlyError,
      });
      return;
    }

    const pingData = (await pingRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = pingData.choices?.[0]?.message?.content || '';

    res.json({
      success: true,
      provider: 'notrack',
      statusCode: 200,
      latencyMs,
      endpoint: activeNoTrackBaseUrl,
      activeModel: activeNoTrackModel,
      availableModels: modelsList,
      reply,
      message: `تم إرسال رسالة تجريبية واستقبال رد حقيقي بنجاح من NoTrack.ai (HTTP 200)! الرد: "${reply.slice(0, 80)}"`,
    });
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    res.status(200).json({
      success: false,
      provider: 'notrack',
      statusCode: 502,
      latencyMs,
      message: `[HTTP 502] فشل الاتصال بخادم NoTrack: ${msg}`,
    });
  }
});

// Helper to construct a human-friendly Arabic error message from NoTrack responses
function parseNoTrackError(status: number, errText: string): string {
  let detail = errText;
  let errorType = '';
  let topUpUrl = '';
  try {
    const json = JSON.parse(errText);
    if (json.error?.message) detail = json.error.message;
    if (json.error?.type) errorType = json.error.type;
    if (json.top_up?.url) topUpUrl = json.top_up.url;
  } catch {
    // raw text
  }

  // Redact any raw API keys and admin access code from error messages
  detail = detail
    .replace(/(sk-notrack-[a-zA-Z0-9_-]{6})[a-zA-Z0-9_-]+/gi, '$1***REDACTED***')
    .replace(/(Bearer\s+)[a-zA-Z0-9._-]+/gi, '$1***REDACTED***');
  if (adminAccessCode) {
    detail = detail.split(adminAccessCode).join('******');
  }

  if (status === 402 || errorType === 'no_credit' || /no credit/i.test(detail)) {
    let msg = `[HTTP 402 - نفاد الرصيد] رصيد حساب NoTrack.ai منتهٍ (No credit left on this account).\n${detail}`;
    if (topUpUrl) {
      msg += `\n\nرابط شحن الرصيد المباشر:\n${topUpUrl}`;
    }
    msg += '\n\nيمكنك تحديث مفتاح API أو الرصيد من خلال لوحة الإدارة في الإعدادات ⚙️.';
    return msg;
  }

  if (status === 401 || errorType === 'key_revoked' || /revoked|invalid api key/i.test(detail)) {
    return `[HTTP 401 - مفتاح غير مصرح به] مفتاح NoTrack.ai غير صالح أو تم إلغاؤه (Revoked API Key).\nتفاصيل: ${detail}\nيرجى تحديث المفتاح من خلال إعدادات الإدارة ⚙️.`;
  }

  if (status === 429) {
    return `[HTTP 429 - تجاوز معدل الطلبات] تم تجاوز حد الطلبات في NoTrack.ai (Rate Limit).\nتفاصيل: ${detail}\nيرجى الانتظار دقيقة والمحاولة مجدداً.`;
  }

  if (status === 404) {
    return `[HTTP 404 - غير موجود] النموذج المطلوب (${activeNoTrackModel}) أو الرابط غير موجود على خادم NoTrack.ai.\nتفاصيل: ${detail}`;
  }

  return `[HTTP ${status}] استجاب مزود NoTrack.ai بالخطأ التالي:\n${detail}`;
}

// ==========================================
// 9. CHAT COMPLETION & STREAMING ENDPOINT
// ==========================================
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const {
    messages,
    context = {},
    attachments = [],
  } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'قائمة الرسائل مطلوبة.' });
    return;
  }

  if (!activeNoTrackKey) {
    res.status(401).json({
      errorCategory: 'AUTHENTICATION_ERROR',
      error: 'مفتاح NoTrack.ai غير مهيأ. يرجى إدخال مفتاح API في الإعدادات.',
    });
    return;
  }

  const systemInstruction = buildSystemPrompt(context);
  const abortController = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const apiMessages: { role: string; content: unknown }[] = [];
  if (systemInstruction) {
    apiMessages.push({ role: 'system', content: systemInstruction });
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const isLast = i === messages.length - 1;
    const msgAtts =
      Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments
        : isLast && Array.isArray(attachments) && attachments.length > 0
          ? attachments
          : [];

    if (m.role === 'user' && msgAtts.length > 0) {
      const parts: Record<string, unknown>[] = [];
      const userText = typeof m.content === 'string' ? m.content.trim() : '';
      parts.push({
        type: 'text',
        text: userText || 'يرجى قراءة وفحص هذه الصورة المرفقة والإجابة عن أي أسئلة حولها وشرح محتواها بالتفصيل.',
      });

      for (const att of msgAtts) {
        if (att && typeof att === 'object' && 'dataUrl' in att && att.dataUrl) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: att.dataUrl,
            },
          });
        }
      }
      apiMessages.push({ role: 'user', content: parts });
    } else {
      apiMessages.push({
        role: m.role || 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
    }
  }

  try {
    const response = await fetch(`${activeNoTrackBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeNoTrackKey}`,
      },
      body: JSON.stringify({
        model: activeNoTrackModel,
        messages: apiMessages,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      const friendlyError = parseNoTrackError(response.status, errText);
      res.status(response.status).json({
        error: friendlyError,
        statusCode: response.status,
        provider: 'notrack',
        model: activeNoTrackModel,
        raw: errText,
      });
      return;
    }

    if (!response.body) {
      res.status(502).json({ error: 'لم يُرجع خادم NoTrack.ai أية بيانات متدفقة.' });
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      // In case NoTrack returns full JSON payload
      const json = (await response.json()) as {
        choices?: { message?: { content?: string }; delta?: { content?: string }; text?: string }[];
      };
      const content =
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.text ??
        '';
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Standard SSE stream from NoTrack
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (abortController.signal.aborted) break;
      res.write(chunk);
    }
    res.end();
  } catch (err: unknown) {
    if (abortController.signal.aborted) {
      res.end();
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: `فشل الاتصال بـ NoTrack.ai: ${message}` });
    } else {
      res.write(`data: [ERROR] ${message}\n\n`);
      res.end();
    }
  }
});

// Non-streaming chat endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, context = {}, attachments = [] } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'قائمة الرسائل مطلوبة.' });
    return;
  }

  if (!activeNoTrackKey) {
    res.status(401).json({
      errorCategory: 'AUTHENTICATION_ERROR',
      error: 'مفتاح NoTrack.ai غير مهيأ.',
    });
    return;
  }

  const systemInstruction = buildSystemPrompt(context);
  const apiMessages: { role: string; content: unknown }[] = [];
  if (systemInstruction) {
    apiMessages.push({ role: 'system', content: systemInstruction });
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const isLast = i === messages.length - 1;
    const msgAtts =
      Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments
        : isLast && Array.isArray(attachments) && attachments.length > 0
          ? attachments
          : [];

    if (m.role === 'user' && msgAtts.length > 0) {
      const parts: Record<string, unknown>[] = [];
      const userText = typeof m.content === 'string' ? m.content.trim() : '';
      parts.push({
        type: 'text',
        text: userText || 'يرجى قراءة وفحص هذه الصورة المرفقة والإجابة عن أي أسئلة حولها وشرح محتواها بالتفصيل.',
      });

      for (const att of msgAtts) {
        if (att && typeof att === 'object' && 'dataUrl' in att && att.dataUrl) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: att.dataUrl,
            },
          });
        }
      }
      apiMessages.push({ role: 'user', content: parts });
    } else {
      apiMessages.push({
        role: m.role || 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
    }
  }

  try {
    const response = await fetch(`${activeNoTrackBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeNoTrackKey}`,
      },
      body: JSON.stringify({
        model: activeNoTrackModel,
        messages: apiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const friendlyError = parseNoTrackError(response.status, errText);
      res.status(response.status).json({
        error: friendlyError,
        statusCode: response.status,
        provider: 'notrack',
        model: activeNoTrackModel,
        raw: errText,
      });
      return;
    }

    const data = (await response.json()) as {
      id?: string;
      choices?: { message?: { content?: string }; text?: string }[];
      model?: string;
      usage?: unknown;
    };
    const content =
      data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    res.json({
      id: data.id || `msg_${Date.now()}`,
      role: 'assistant',
      content,
      model: data.model || activeNoTrackModel,
      usage: data.usage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `فشل الاتصال بـ NoTrack.ai: ${message}` });
  }
});

// ==========================================
// STATIC FILES & SSR CATCH-ALL
// ==========================================
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Ja3far AI server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
