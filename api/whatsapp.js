import { FAQ } from './faq.js';

const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || '';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const AVAIL_API = process.env.AVAILABILITY_API || 'https://roof70s.com/api/availability';
const GRAPH = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

const KIDS_FORM = [
  'Hello 家長你好！🥰',
  '家長可以填寫返以下嘅資料先！😊',
  '',
  '小朋友姓名：',
  '歲數：',
  '性別：M / F',
  '跳舞經驗：Yes / No',
  '（如有可附上影片作參考）',
  '家長聯絡電話（WhatsApp✅）：',
  '*所有資料保密只作學校內部參考',
  '',
  '我哋會有專業嘅導師團隊為你睇返最適合小朋友歲數以及程度的課程！❤️',
  '推薦返俺小朋友嚟試堂嫁！😊',
].join('\n');

const KIDS_AFTER_FORM =
  '收到，多謝家長！我哋同事會盡快覆返你。如要轉即時人手可打「staff」。';

function matchFaq(text, topic) {
  const t = text.toLowerCase();
  const hit = FAQ.find((item) => {
    if (topic && item.topic !== topic && item.topic !== 'general') return false;
    return (item.keywords || []).some((k) => t.includes(String(k).toLowerCase()));
  });
  return hit?.answer || '';
}

function looksLikeKidsForm(text) {
  const raw = text || '';
  const fields = [/姓名/, /歲/, /性別|男|女|\bM\b|\bF\b/i, /經驗|Yes|No/i, /852|\d{8}/];
  return fields.filter((re) => re.test(raw)).length >= 3;
}

function isKidsTopic(text) {
  return /兒童|小朋友|細路|孩子|kids|rookids|boom|街舞班|上堂|套票|幾歲|年齡|請假|報名|試堂|家長/.test(text || '');
}

function isRentalTopic(text) {
  return /租場|檔期|有冇位|room a|room b|\bab\b|貓頭鷹|鎖場|包場/.test((text || '').toLowerCase());
}

async function replyText(to, body) {
  if (!TOKEN || !PHONE_ID) return;
  const res = await fetch(GRAPH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    signal: AbortSignal.timeout(6000),
  });
  console.log('graph_status', res.status, (await res.text()).slice(0, 200));
}

function hkToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function parseRoom(text) {
  const t = text.toLowerCase();
  if (/\bab\b|a\s*\+\s*b|a同b|a及b|兩房/.test(t)) return 'AB';
  if (/\broom\s*b\b|b房/.test(t)) return 'B';
  if (/\broom\s*a\b|a房/.test(t)) return 'A';
  return '';
}
function parseDate(text) {
  const t = text.replace(/\s+/g, '');
  const iso = t.match(/(20\d{2})[-/\u5e74](\d{1,2})[-/\u6708](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const md = t.match(/(\d{1,2})月(\d{1,2})/);
  if (md) return `${hkToday().slice(0, 4)}-${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}`;
  if (/後日|后天/.test(t)) return addDays(hkToday(), 2);
  if (/聽日|听日|明日|明天/.test(t)) return addDays(hkToday(), 1);
  return hkToday();
}
function wantsAvailability(text) {
  return /檔期|档期|有冇位|空檔|今晚|聽日|听日|後日/.test(text);
}
function formatSlots(room) {
  const free = (room.slots || []).filter((s) => s.status === 'available');
  if (!free.length) return `${room.room}：當日無空檔`;
  const groups = [];
  let cur = { start: free[0].start, end: free[0].end };
  for (let i = 1; i < free.length; i += 1) {
    if (free[i].start === cur.end) cur.end = free[i].end;
    else { groups.push(cur); cur = { start: free[i].start, end: free[i].end }; }
  }
  groups.push(cur);
  return `${room.room}：` + groups.slice(0, 8).map((g) => `${g.start}–${g.end}`).join('、');
}
async function lookupAvailability(text) {
  const date = parseDate(text);
  const room = parseRoom(text);
  const qs = new URLSearchParams({ date });
  if (room) qs.set('room', room);
  const res = await fetch(`${AVAIL_API}?${qs}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return `暫時讀唔到 ${date} 檔期。https://roof70s.com/`;
  const data = await res.json();
  const rooms = data.rooms || [];
  if (!rooms.length) return `${date} 揀唔到房間。https://roof70s.com/`;
  return [`Roof70's ${date} 空檔`, ...rooms.map(formatSlots), '鎖場請上 https://roof70s.com/'].join('\n');
}

async function answer(text) {
  const t = (text || '').toLowerCase();
  if (/staff|改期|退款|投訴|平少少|折扣|報價|排演/.test(t)) {
    return '呢單要人手跟。正式客服 96171444。';
  }
  if (looksLikeKidsForm(text)) return KIDS_AFTER_FORM;
  if (isKidsTopic(text) && !isRentalTopic(text)) {
    const extra = matchFaq(text, 'kids');
    return extra ? `${KIDS_FORM}\n\n${extra}` : KIDS_FORM;
  }
  if (/鎖場|幫我租|落單|hold位/.test(t) && !wantsAvailability(text)) {
    return 'WhatsApp 唔代鎖場。https://roof70s.com/';
  }
  if (wantsAvailability(text) || /有冇位|檔期/.test(text)) return lookupAvailability(text);
  if (/幾錢|價錢|price|費用|幾貴|貓頭鷹|owl/.test(t)) {
    return [
      "Roof70's 租場（HKD／小時）",
      'A  非繁忙 280 · 繁忙 420 · 貓頭鷹 800',
      'B  非繁忙 220 · 繁忙 330 · 貓頭鷹 800',
      'AB 非繁忙 480 · 繁忙 680 · 貓頭鷹 1500',
      '繁忙：平日 18:00 後，週末全日',
    ].join('\n');
  }
  if (/點去|地址|位置|where|address/.test(t)) {
    return '新蒲崗五芳街 23–25 號 The William 6 樓 C。https://roof70s.com/';
  }
  if (/幾點|營業|開門時間/.test(t)) return '大約 10:00–23:00。午夜至早上有貓頭鷹套餐。';
  return '可以問租場價錢、今晚有冇位、兒童班、地址。打「staff」轉人手。';
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
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const messages = (req.body || {}).entry?.[0]?.changes?.[0]?.value?.messages || [];
    console.log('incoming_count', messages.length);
    for (const msg of messages) {
      if (msg.type !== 'text' || !msg.text?.body || !msg.from) continue;
      console.log('text', looksLikeKidsForm(msg.text.body) ? '[kids-form]' : msg.text.body);
      await replyText(msg.from, await answer(msg.text.body));
    }
  } catch (err) { console.error(err); }
  res.status(200).json({ ok: true });
}
