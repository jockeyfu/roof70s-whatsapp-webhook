const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function aiEnabled(items) {
  const raw = String(
    (items || []).find((i) => i.slot === 'use_ai')?.answer || process.env.WHATSAPP_AI || 'off',
  )
    .trim()
    .toLowerCase();
  return /^(on|yes|true|1|ai)$/.test(raw);
}

export async function aiReply(text, facts, extra = {}) {
  const xai = process.env.XAI_API_KEY || '';
  const openai = process.env.OPENAI_API_KEY || '';
  const key = xai || openai;
  if (!key) return '';
  const url = xai ? XAI_URL : OPENAI_URL;
  const model = process.env.WHATSAPP_AI_MODEL || (xai ? 'grok-4-fast' : 'gpt-4o-mini');
  const topic = extra.topic || '';
  const history = Array.isArray(extra.history) ? extra.history.slice(-8) : [];
  const sys = [
    'You are Roof70s / Rookids WhatsApp customer service.',
    '你用香港粵語回覆，語氣有禮。',
    topic === 'rental' ? '呢個對話已確認係租場。' : '',
    topic === 'kids' ? '呢個對話已確認係兒童班。' : '',
    '檔期一定照「實際資料」裡「檔期」那段。',
    '如果檔期寫「有位」，禁止講冇位、沒位、已滿、暫時冇位。',
    '如果檔期寫「已滿」或「無空檔」才可以講冇位。',
    'AB 等於 ROOMAB。',
    '唔好叫人自己上網站查檔期；網站只用來鎖場。',
    '價錢、檔期唔好估。',
    '',
    '實際資料：',
    facts || '',
  ].filter(Boolean).join('\n');
  const messages = [{ role: 'system', content: sys }, ...history, { role: 'user', content: text }];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 400, messages }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.log('ai_status', res.status, (await res.text()).slice(0, 200));
      return '';
    }
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.error('ai_error', err);
    return '';
  }
}
