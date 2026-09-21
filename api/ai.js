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
    topic === 'kids' ? '呢個對話已確認係兒童班，唔好再問租場定兒童班。' : '',
    '要繼續上面對話，唔好當每句都係新客。',
    '如果資料有「檔期」，必須直接講有冇位、邊房、幾點到幾點。禁止叫人自己上網站查檔期。',
    '網站 https://roof70s.com/ 只用來鎖場落單。',
    '價錢、檔期、地址只可用以下實際資料，唔好估、唔好代鎖場、唔好代批假。',
    '請假要轉職員。緊急叫人打 staff 或 96171444。',
    '',
    '實際資料：',
    facts || '',
  ].filter(Boolean).join('\n');
  const messages = [{ role: 'system', content: sys }, ...history, { role: 'user', content: text }];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.3, max_tokens: 500, messages }),
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
