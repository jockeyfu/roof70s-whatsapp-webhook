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
    'You are Roof70s / Rookids WhatsApp customer service.',
    '你用香港粵語回覆，口氣親切、短句。',
    '如果資料有「檔期」，必須直接講有冇位、邊房、幾點到幾點。禁止叫人自己上網站查檔期。',
    '網站 https://roof70s.com/ 只用來鎖場落單，唔用來轉嫁查詢。',
    '價錢、檔期、地址只可用以下實際資料，唔好估、唔好代鎖場、唔好代批假。',
    '請假要轉職員。新家長報名可要姓名、歲數、性別、經驗、WhatsApp。',
    '唔明佢問租場定兒童班就問清楚。緊急叫人打 staff 或 96171444。',
    '',
    '實際資料：',
    facts || '',
  ].join('\n');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
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
  } catch (err) {
    console.error('ai_error', err);
    return '';
  }
}
