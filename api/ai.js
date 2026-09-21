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

export async function aiReply(text, facts) {
  const xai = process.env.XAI_API_KEY || '';
  const openai = process.env.OPENAI_API_KEY || '';
  const key = xai || openai;
  if (!key) return '';
  const url = xai ? XAI_URL : OPENAI_URL;
  const model = process.env.WHATSAPP_AI_MODEL || (xai ? 'grok-4-fast' : 'gpt-4o-mini');
  const sys = [
    '你係 Roof70''s / Rookids WhatsApp 客服，用香港粵語回覆，口氣親切、短句。',
    '價錢、檔期、地址只可用以下實際資料，唔好估、唔好代鎖場、唔好代批假。',
    '請假要轉職員。新家長報名可要姓名、歲數、性別、經驗、WhatsApp。',
    '唔明佢問租場定兒童班就問清楚。緊急叫人打 staff 或 96171444。',
    '',
    '實際資料：',
    facts || '',
  ].join('\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    console.log('ai_status', res.status, (await res.text()).slice(0, 200));
    return '';
  }
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content || '').trim();
}
