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
    '你用香港粵語回覆，口氣親切、短句。',
    topic === 'rental' ? '呢個對話已確認係租場，唔好再問兒童班定租場。' : '',
    topic === 'kids' ? '呢個對話已確認係兒童班。' : '',
    '下星期三、聽日、晚七點已換成檔期日期。有檔期就照檔期答，禁止改口講有位變無位。',
    '如果客人講「想租」「鎖場」「OK」，用上一次檔期結果，叫佢上 https://roof70s.com/ 鎖場，唔好重新講冇位。',
    '禁止叫人自己上網站查檔期；網站只用來鎖場落單。',
    '價錢、檔期只可用以下資料，唔好估、唔好代鎖場。',
    '請假轉職員。緊急 staff 或 96171444。',
    '',
    '實際資料：',
    facts || '',
  ].filter(Boolean).join('\n');
  const messages = [{ role: 'system', content: sys }, ...history, { role: 'user', content: text }];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.15, max_tokens: 500, messages }),
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
