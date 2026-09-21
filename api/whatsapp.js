import { FAQ } from './faq.js';

const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || '';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const AVAIL_API = process.env.AVAILABILITY_API || 'https://roof70s.com/api/availability';
const FAQ_API = process.env.FAQ_API || 'https://roof70s.com/api/whatsapp-faq';
const GRAPH = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;
const AVAIL_RE = /檔期|档期|有冇位|有無位|有位嗎|有位嗎|有位|空檔|空房|空位|有冇房|有無房|有房嗎|有冇得租|有無得租|可唔可以租|租唔租到|得唔得租|今晚|聽日|听日|後日|available|free|room\s*a|a\s*\+\s*b/;

const KIDS_FORM = ['Hello 家長你好！🥰','家長可以填寫返以下嘅資料先！😊','','小朋友姓名：','歲數：','性別：M / F','跳舞經驗：Yes / No','（如有可附上影片作參考）','家長聯絡電話（WhatsApp✅）：','*所有資料保密只作學校內部參考','','我哋會有專業嘅導師團隊為你睇返最適合小朋友歲數以及程度的課程！❤️','推薦返俺小朋友嚟試堂嫁！😊'].join('\n');
const KIDS_AFTER_FORM = '收到，多謝家長！我哋同事會盡快覆返你。如要轉即時人手可打「staff」。';
const LEAVE_REPLY = ['家長你好，請假要職員代辦，獲准先退 1 堂。課堂開始後唔退。','請回覆：小朋友姓名、邊一堂／幾時、原因（唔舒服／學校有事）。','同事會盡快跟。緊急可打「staff」。'].join('\n');

let kbCache = { at: 0, items: [] };
async function loadKb() {
  if (Date.now() - kbCache.at < 15000 && kbCache.items.length) return kbCache.items;
  try {
    const res = await fetch(FAQ_API, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (Array.isArray(data.items)) kbCache = { at: Date.now(), items: data.items };
  } catch (err) {
    console.error('faq_api', err);
  }
  return kbCache.items;
}
function slotOf(items, slot, fallback) {
  const hit = items.find((i) => i.slot === slot && i.answer);
  return hit?.answer || fallback;
}
function matchFaq(text, topic, items) {
  const t = text.toLowerCase();
  const list = items && items.length ? items : FAQ.map((x) => ({ ...x, keywords: (x.keywords || []).join(',') }));
  const hit = list.find((item) => {
    if (item.slot) return false;
    if (topic && item.topic !== topic && item.topic !== 'general') return false;
    const keys = Array.isArray(item.keywords) ? item.keywords : String(item.keywords || '').split(/[,，]/);
    return keys.map((k) => String(k).trim().toLowerCase()).filter(Boolean).some((k) => t.includes(k));
  });
  return hit?.answer || '';
}
function looksLikeKidsForm(text) {
  const raw = text || '';
  const fields = [/姓名/, /歲/, /性別|男|女|\bM\b|\bF\b/i, /經驗|Yes|No/i, /852|\d{8}/];
  return fields.filter((re) => re.test(raw)).length >= 3;
}
function isLeaveTopic(text) {
  return /請假|唔舒服|生病|發燙|感冒|學校有事|缺席|唔得閒上|病假|請早退/.test(text || '');
}
function isKidsTopic(text) {
  return /兒童|小朋友|細路|孩子|kids|rookids|boom|街舞班|上堂|套票|幾歲|年齡|報名|試堂|家長/.test(text || '');
}
function isRentalTopic(text) {
  return AVAIL_RE.test((text || '').toLowerCase()) || /租場|貓頭鷹|鎖場|包場|room\s*[ab]|\d{1,2}\s*[-/]\s*\d{1,2}/.test((text || '').toLowerCase());
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
function pad(n) { return String(n).padStart(2, '0'); }
function toMin(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}
function fromMin(n) {
  const x = ((n % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}
function parseRoom(text) {
  const t = text.toLowerCase();
  if (/a\s*\+\s*b|a\s*&\s*b|room\s*ab|\bab\b|a同b|a及b|兩房|合併/.test(t)) return 'AB';
  if (/room\s*b|b房/.test(t)) return 'B';
  if (/room\s*a|a房/.test(t)) return 'A';
  return '';
}
function parseDate(text) {
  const raw = text || '';
  const t = raw.replace(/\s+/g, '');
  const iso = t.match(/(20\d{2})[-\/.\u5e74](\d{1,2})[-\/.\u6708](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const md = t.match(/(\d{1,2})月(\d{1,2})/);
  if (md) return `${hkToday().slice(0, 4)}-${pad(md[1])}-${pad(md[2])}`;
  const slash = raw.match(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(20\d{2}))?\b/);
  if (slash) {
    const a = Number(slash[1]); const b = Number(slash[2]); const y = slash[3] || hkToday().slice(0, 4);
    let month; let day;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else { day = a; month = b; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${y}-${pad(month)}-${pad(day)}`;
  }
  if (/後日|后天/.test(t)) return addDays(hkToday(), 2);
  if (/聽日|听日|明日|明天/.test(t)) return addDays(hkToday(), 1);
  if (/今晚|今日|今天/.test(t)) return hkToday();
  return hkToday();
}
function parseHourToken(tok, pmHint) {
  const m = String(tok).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  const mer = m[3] || (pmHint ? 'pm' : '');
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (!mer && h <= 10 && pmHint) h += 12;
  return h * 60 + min;
}
function parseTimeRange(text) {
  const t = text.toLowerCase().replace(/點/g, ':');
  const pm = /pm\b|晚/.test(t);
  const range = t.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-~至到]到?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (!range) return null;
  const start = parseHourToken(range[1], pm || /pm/.test(range[2]));
  const end = parseHourToken(range[2], pm);
  if (start == null || end == null || end <= start) return null;
  return { start: fromMin(start), end: fromMin(end) };
}
function wantsAvailability(text) {
  return AVAIL_RE.test((text || '').toLowerCase());
}
function formatSlots(room, window) {
  let slots = room.slots || [];
  if (window) {
    const a = toMin(window.start); const b = toMin(window.end);
    slots = slots.filter((s) => toMin(s.start) < b && toMin(s.end) > a);
  }
  const free = slots.filter((s) => s.status === 'available');
  if (!slots.length) return `${room.room}：無此時段`;
  if (window && free.length === slots.length) return `${room.room}：${window.start}–${window.end} 有位`;
  if (!free.length) return `${room.room}：${window ? `${window.start}–${window.end} 已滿` : '當日無空檔'}`;
  const groups = [];
  let cur = { start: free[0].start, end: free[0].end };
  for (let i = 1; i < free.length; i += 1) {
    if (free[i].start === cur.end) cur.end = free[i].end;
    else { groups.push(cur); cur = { start: free[i].start, end: free[i].end }; }
  }
  groups.push(cur);
  const shown = groups.slice(0, 8).map((g) => `${g.start}–${g.end}`).join('、');
  if (window) return `${room.room}：${window.start}–${window.end} 未全段可用；空檔 ${shown}`;
  return `${room.room}：${shown}`;
}
async function lookupAvailability(text, items) {
  const date = parseDate(text);
  const room = parseRoom(text);
  const window = parseTimeRange(text);
  const qs = new URLSearchParams({ date });
  if (room) qs.set('room', room);
  const res = await fetch(`${AVAIL_API}?${qs}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return `暫時讀唔到 ${date} 檔期。https://roof70s.com/`;
  const data = await res.json();
  const rooms = data.rooms || [];
  if (!rooms.length) return `${date} 揀唔到房間。https://roof70s.com/`;
  const time = window ? `${window.start}–${window.end}` : '空檔';
  const tmpl = slotOf(items, 'availability_title', "Roof70's {date} {time} {room}");
  const title = tmpl.replace(/\{date\}/g, date).replace(/\{time\}/g, time).replace(/\{room\}/g, room || '').replace(/\s+/g, ' ').trim();
  const footer = slotOf(items, 'availability_footer', '鎖場請上 https://roof70s.com/');
  return [title, ...rooms.map((r) => formatSlots(r, window)), footer].join('\n');
}
async function answer(text) {
  const items = await loadKb();
  const t = (text || '').toLowerCase();
  if (/staff|改期|退款|投訴|平少少|折扣|報價|排演/.test(t)) {
    return slotOf(items, 'staff', '呢單要人手跟。正式客服 96171444。');
  }
  if (isLeaveTopic(text)) return matchFaq(text, 'kids', items) || slotOf(items, 'leave', LEAVE_REPLY);
  if (looksLikeKidsForm(text)) return slotOf(items, 'kids_after_form', KIDS_AFTER_FORM);
  if (isKidsTopic(text) && !isRentalTopic(text)) {
    const form = slotOf(items, 'kids_form', KIDS_FORM);
    const extra = matchFaq(text, 'kids', items);
    return extra ? `${form}\n\n${extra}` : form;
  }
  if (/鎖場|幫我租|落單|hold位/.test(t) && !wantsAvailability(text)) {
    return '鎖場請上 https://roof70s.com/';
  }
  if (wantsAvailability(text) || AVAIL_RE.test(t)) {
    return lookupAvailability(text, items);
  }
  if (/幾錢|價錢|price|費用|幾貴|貓頭鷹|owl/.test(t)) {
    return slotOf(items, 'rental_price', ["Roof70's 租場（HKD／小時）",'A  非繁忙 280 · 繁忙 420 · 貓頭鷹 800','B  非繁忙 220 · 繁忙 330 · 貓頭鷹 800','AB 非繁忙 480 · 繁忙 680 · 貓頭鷹 1500','繁忙：平日 18:00 後，週末全日'].join('\n'));
  }
  if (/點去|地址|位置|where|address/.test(t)) return slotOf(items, 'address', '新蒲崗五芳街 23–25 號 The William 6 樓 C。https://roof70s.com/');
  if (/幾點|營業|開門時間/.test(t)) return slotOf(items, 'hours', '大約 10:00–23:00。午夜至早上有貓頭鷹套餐。');
  return slotOf(items, 'fallback', '可以問租場價錢、今晚有冇位、兒童班、地址。打「staff」轉人手。');
}
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === VERIFY && challenge) { res.status(200).send(challenge); return; }
    res.status(403).send('Forbidden'); return;
  }
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const messages = (req.body || {}).entry?.[0]?.changes?.[0]?.value?.messages || [];
    console.log('incoming_count', messages.length);
    for (const msg of messages) {
      if (msg.type !== 'text' || !msg.text?.body || !msg.from) continue;
      await replyText(msg.from, await answer(msg.text.body));
    }
  } catch (err) { console.error(err); }
  res.status(200).json({ ok: true });
}
