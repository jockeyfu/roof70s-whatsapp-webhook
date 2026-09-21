/**
 * Vercel serverless webhook for WhatsApp Cloud API (TEST number only).
 * Env:
 *   WHATSAPP_VERIFY_TOKEN
 *   WHATSAPP_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 *   AVAILABILITY_API  — default https://roof70s.com/api/availability
 */

const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || '';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const AVAIL_API = process.env.AVAILABILITY_API || 'https://roof70s.com/api/availability';
const GRAPH = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

async function replyText(to, body) {
  if (!TOKEN || !PHONE_ID) {
    console.error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return;
  }
  const res = await fetch(GRAPH, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const raw = await res.text();
  console.log('graph_status', res.status, raw.slice(0, 300));
}

function hkToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function parseRoom(text) {
  const t = text.toLowerCase();
  if (/\bab\b|a\s*\+\s*b|a同b|a及b|兩房|两房/.test(t)) return 'AB';
  if (/\broom\s*b\b|b房|場地b|场地b/.test(t)) return 'B';
  if (/\broom\s*a\b|a房|場地a|场地a/.test(t)) return 'A';
  return '';
}

function parseDate(text) {
  const t = text.replace(/\s+/g, '');
  const iso = t.match(/(20\d{2})[\-/\u5e74](\d{1,2})[\-/\u6708](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }
  const md = t.match(/(\d{1,2})月(\d{1,2})/);
  if (md) {
    const y = hkToday().slice(0, 4);
    return `${y}-${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}`;
  }
  if (/後日|后天/.test(t)) return addDays(hkToday(), 2);
  if (/聽日|听日|明日|明天/.test(t)) return addDays(hkToday(), 1);
  if (/今日|今天|今晚|而家|依家/.test(t)) return hkToday();
  return hkToday();
}

function wantsAvailability(text) {
  return /檔期|档期|有内位|有没有位|得唔得租|可唔可以租|空檔|空档|今晚|聽日|听日|後日|后天|今日.*[租位場]|[租查].*房/.test(text);
}

function formatSlots(room) {
  const free = (room.slots || []).filter((s) => s.status === 'available');
  if (!free.length) return `${room.room}：當日無空檔`;
  const groups = [];
  let cur = { start: free[0].start, end: free[0].end };
  for (let i = 1; i < free.length; i += 1) {
    if (free[i].start === cur.end) cur.end = free[i].end;
    else {
      groups.push(cur);
      cur = { start: free[i].start, end: free[i].end };
    }
  }
  groups.push(cur);
  const shown = groups.slice(0, 8).map((g) => `${g.start}–${g.end}`).join('、');
  const extra = groups.length > 8 ? `…仲有${groups.length - 8}段` : '';
  return `${room.room}：${shown}${extra}`;
}

async function lookupAvailability(text) {
  const date = parseDate(text);
  const room = parseRoom(text);
  const qs = new URLSearchParams({ date });
  if (room) qs.set('room', room);
  const res = await fetch(`${AVAIL_API}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    console.error('avail_status', res.status);
    return `暫時讀唔到 ${date} 檔期。請直接上 https://roof70s.com/ 睇格。`;
  }
  const data = await res.json();
  const rooms = data.rooms || [];
  if (!rooms.length) return `${date} 揀唔到房間資料。請上 https://roof70s.com/`;
  const lines = [
    `Roof70's ${date} 空檔（30分鐘一格，即時網站資料）`,
    ...rooms.map(formatSlots),
    'WhatsApp 唔代鎖場。確認請上 https://roof70s.com/ 登入。',
  ];
  return lines.join('\n');
}

async function answer(text) {
  const t = (text || '').toLowerCase();
  if (/staff|改期|退款|投訴|平少少|折扣|報價|排演/.test(t)) {
    return '呢單要 staff 跟。測試 bot 唔改價、唔改期。正式客服仍係 96171444。';
  }
  if (/鎖場|幫我租|落單|hold位/.test(t) && !wantsAvailability(text)) {
    return '第一期 WhatsApp 唔代鎖場。請上 https://roof70s.com/ 登入據格。';
  }
  if (wantsAvailability(text) || /有内位|檔期|档期/.test(text)) {
    return lookupAvailability(text);
  }
  if (/幾錢|價錢|price|費用|幾貴|貓頭鷹套餐|owl/.test(t)) {
    return [
      "Roof70's 租場價目（HKD）",
      'A：非繁忙 280／繁忙 420／貓頭鷹 800',
      'B：非繁忙 220／繁忙 330／貓頭鷹 800',
      'AB：非繁忙 480／繁忙 680／貓頭鷹 1500',
      '繁忙：平日 18:00–00:00，週末及假期全日',
      '貓頭鷹：00:00–06:00 六小時套餐',
      '詳細檔期：https://roof70s.com/',
    ].join('\n');
  }
  if (/點去|地址|位置|where|address/.test(t)) {
    return '新蒲崗五芳街 23–25 號 The William Industrial Building 6 樓 C。地圖見 https://roof70s.com/';
  }
  if (/幾點|營業|開門時間/.test(t)) {
    return '營業大約 10:00–23:00。租場另有貓頭鷹 00:00–06:00。檔期以網站為準。';
  }
  return 'Roof70\'s 測試客服。可以問價錢、地址、今晚／聽日檔期。鎖場請用網站。打「staff」轉人手。';
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === VERIFY && challenge) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  try {
    const body = req.body || {};
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || [];
    console.log('incoming_count', messages.length);
    for (const msg of messages) {
      if (msg.type !== 'text' || !msg.text?.body || !msg.from) continue;
      console.log('from', msg.from, 'text', msg.text.body);
      const out = await answer(msg.text.body);
      await replyText(msg.from, out);
    }
  } catch (err) {
    console.error(err);
  }
  res.status(200).json({ ok: true });
}
