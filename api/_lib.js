// Utilidades compartidas para leer datos públicos de Goodreads.
// Vercel no publica como ruta los archivos de /api que empiezan con "_".

export const USER_ID = process.env.GOODREADS_USER_ID || '90308354';
const BASE = 'https://www.goodreads.com';

// Identificadores de los desafíos anuales de Goodreads (año -> challenge_id).
// Se validan siempre contra la respuesta, así que un id incorrecto se descarta solo.
export const CHALLENGE_IDS = {
  2018: 7501,
  2019: 8263,
  2020: 11621,
  2021: 11650,
  2022: 11636,
  2023: 11633,
  2024: 11634,
  2025: 11627,
  2026: 11680,
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export async function get(url, { timeout = 12000, accept } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
        ...(accept ? { Accept: accept } : {}),
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return { text: await res.text(), url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Texto ----------

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decode(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}

export function stripCdata(s = '') {
  const m = String(s).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

// Convierte HTML simple en texto plano conservando saltos de párrafo.
export function htmlToText(html = '') {
  return decode(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Separa "Título (Serie, #3)" en título y serie.
export function splitSeries(full = '') {
  const t = full.trim();
  const m = t.match(/^(.*\S)\s*\(([^()]*#\s*[\d.]+[^()]*)\)\s*$/);
  return m ? { title: m[1].trim(), series: m[2].trim() } : { title: t, series: '' };
}

// Devuelve la portada en la mayor resolución disponible, o null si es la imagen genérica.
export function bigCover(url = '') {
  if (!url || /nophoto/i.test(url)) return null;
  return url
    .replace(/\._S[XY]\d+(?:_S[XY]\d+)?_\./, '.')
    .replace(/\._[A-Z]{2}\d+_\./, '.')
    .replace(/(\/books\/\d+)[sm](\/\d+\.jpg)/, '$1l$2');
}

function toIso(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

function num(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// ---------- RSS de estantes ----------

export function parseRss(xml = '') {
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const it = m[1];
    const tag = (name) => {
      const r = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`);
      const x = it.match(r);
      return x ? decode(stripCdata(x[1])).trim() : '';
    };
    const id = tag('book_id');
    if (!id) continue;
    const { title, series } = splitSeries(tag('title'));
    const rating = parseInt(tag('user_rating'), 10);
    out.push({
      id,
      reviewId: (tag('link').match(/review\/show\/(\d+)/) || [])[1] || null,
      title,
      series,
      author: tag('author_name'),
      cover: bigCover(tag('book_large_image_url') || tag('book_medium_image_url') || tag('book_image_url')),
      pages: num(tag('num_pages')),
      avgRating: num(tag('average_rating')),
      userRating: rating > 0 ? rating : null,
      published: tag('book_published') || null,
      readAt: toIso(tag('user_read_at')),
      addedAt: toIso(tag('user_date_added')) || toIso(tag('pubDate')),
      shelves: tag('user_shelves'),
      description: htmlToText(stripCdata(tag('book_description'))),
      isbn: tag('isbn') || null,
      url: `${BASE}/book/show/${id}`,
    });
  }
  return out;
}

async function rssPage(shelf, extra = '') {
  const url = `${BASE}/review/list_rss/${USER_ID}?shelf=${encodeURIComponent(shelf)}${extra}`;
  const { text } = await get(url, { accept: 'application/rss+xml, application/xml, text/xml' });
  return parseRss(text);
}

// Lee un estante completo. El RSS entrega hasta 100 libros por página;
// si la paginación no responde, se completa pidiendo el orden inverso.
export async function fetchShelf(shelf, maxPages = 8) {
  const byId = new Map();
  const add = (items) => {
    let n = 0;
    for (const b of items) {
      const k = b.reviewId || b.id;
      if (!byId.has(k)) {
        byId.set(k, b);
        n++;
      }
    }
    return n;
  };
  let lastLen = 0;
  let paginationWorked = true;
  for (let page = 1; page <= maxPages; page++) {
    const items = await rssPage(shelf, page > 1 ? `&page=${page}` : '');
    const added = add(items);
    lastLen = items.length;
    if (page > 1 && added === 0) {
      paginationWorked = false;
      break;
    }
    if (items.length < 100) break;
  }
  if (!paginationWorked && lastLen >= 100) {
    for (const extra of ['&order=a', '&sort=date_read&order=a', '&sort=date_added&order=a']) {
      try {
        add(await rssPage(shelf, extra));
      } catch {
        /* variante no soportada */
      }
    }
  }
  return [...byId.values()];
}

// ---------- Perfil (nombre, foto, progreso de lectura) ----------

export function parseProfile(html = '') {
  const meta = (p) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'));
    return m ? decode(m[1]) : '';
  };
  const name = meta('profile:first_name') || meta('og:title') || 'Lector';
  const avatar = meta('og:image') || null;

  // Progreso de cada libro en "is currently reading"
  const progress = {};
  const parts = html.split(/is currently reading/i);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const idm = seg.match(/\/book\/show\/(\d+)/);
    if (!idm) continue;
    const id = idm[1];
    const pct = seg.match(/\((\d{1,3})\s*%\)/);
    const page = seg.match(/\(page\s+([\d,]+)\s+of\s+([\d,]+)\)/i) || seg.match(/\(página\s+([\d,]+)\s+de\s+([\d,]+)\)/i);
    const pctIdx = pct ? pct.index : Infinity;
    const pageIdx = page ? page.index : Infinity;
    if (pctIdx === Infinity && pageIdx === Infinity) continue;
    const upd = seg.match(/user_status\/show\/\d+[^>]*>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})/);
    if (pageIdx < pctIdx) {
      const cur = num(page[1]);
      const tot = num(page[2]);
      progress[id] = { percent: tot ? Math.min(100, Math.round((cur / tot) * 100)) : null, page: cur, of: tot };
    } else {
      progress[id] = { percent: Math.min(100, parseInt(pct[1], 10)) };
    }
    if (upd) progress[id].updatedAt = toIso(upd[1]);
  }
  return { name, avatar, progress };
}

// ---------- Desafíos (widget público) ----------

export function parseWidget(js = '') {
  const s = js
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\'/g, "'");
  const ch = s.match(/challenges\/(\d+)-(\d{4})-reading-challenge/);
  const body = s.match(/gr_challenge_progress_body_(\d+)/);
  const prog = s.match(/>\s*([\d,.]+)\s+of\s+([\d,.]+)\s*\((\d+)%\)\s*</);
  const uc = s.match(/user_challenges\/(\d+)/);
  const slug = s.match(/user\/show\/(\d+-[^?"&\s]+)/);
  if (!ch || !prog) return null;
  return {
    challengeId: Number(ch[1]),
    bodyId: body ? Number(body[1]) : null,
    year: Number(ch[2]),
    read: num(prog[1]),
    goal: num(prog[2]),
    url: uc ? `${BASE}/user_challenges/${uc[1]}` : null,
    slug: slug ? slug[1] : null,
  };
}

export async function fetchChallenges() {
  const found = new Map();
  let slug = null;

  // 1) Widget sin año: entrega el desafío vigente y el identificador con nombre del usuario.
  try {
    const { text } = await get(`${BASE}/user_challenges/widget/${USER_ID}?v=2`);
    const w = parseWidget(text);
    if (w) {
      found.set(w.year, w);
      slug = w.slug;
    }
  } catch {
    /* sigue con los años conocidos */
  }

  // 2) Un pedido por año conocido; solo se acepta si responde el desafío pedido.
  const who = slug || USER_ID;
  const years = Object.entries(CHALLENGE_IDS);
  const results = await Promise.allSettled(
    years.map(async ([year, cid]) => {
      const { text } = await get(`${BASE}/user_challenges/widget/${who}?challenge_id=${cid}&v=2`);
      const w = parseWidget(text);
      if (w && w.challengeId === cid && Number(year) === w.year) return w;
      return null;
    })
  );
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const w = r.value;
    const prev = found.get(w.year);
    // Si hay dos lecturas del mismo año, se queda con la de mayor avance.
    if (!prev || (w.read || 0) > (prev.read || 0)) found.set(w.year, w);
  }
  return [...found.values()]
    .map(({ year, goal, read, url, challengeId }) => ({ year, goal, read, url, challengeId }))
    .sort((a, b) => b.year - a.year);
}

// ---------- Búsqueda ----------

export function mapAutocomplete(list = []) {
  return (Array.isArray(list) ? list : []).map((b) => {
    const { title, series } = splitSeries(b.title || b.bookTitleBare || '');
    return {
      id: String(b.bookId),
      title: b.bookTitleBare || title,
      series,
      author: b.author?.name || '',
      cover: bigCover(b.imageUrl),
      pages: b.numPages || null,
      avgRating: num(b.avgRating),
      ratingsCount: b.ratingsCount || null,
      published: null,
      description: htmlToText(b.description?.html || ''),
      descriptionTruncated: !!b.description?.truncated,
      url: `${BASE}/book/show/${b.bookId}`,
    };
  });
}

export function parseSearchHtml(html = '') {
  const rows = html.split(/<tr[^>]+itemtype=["']http:\/\/schema\.org\/Book["'][^>]*>/i).slice(1);
  const out = [];
  for (const raw of rows) {
    const row = raw.split(/<\/tr>/i)[0];
    const id = (row.match(/href=["']\/book\/show\/(\d+)/) || [])[1];
    if (!id) continue;
    const titleM =
      row.match(/<a[^>]+class=["']bookTitle["'][\s\S]*?<span[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i) ||
      row.match(/<a[^>]+class=["']bookTitle["'][^>]*>([\s\S]*?)<\/a>/i);
    const authorM = row.match(/class=["']authorName["'][\s\S]*?<span[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i);
    const imgM = row.match(/<img[^>]+class=["'][^"']*bookCover[^"']*["'][^>]*src=["']([^"']+)["']/i) || row.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*bookCover/i);
    const mini = htmlToText((row.match(/class=["']minirating["'][^>]*>([\s\S]*?)<\/span>\s*(?:<\/span>)?/i) || [])[1] || '');
    const tail = htmlToText(row);
    const avg = (mini.match(/([\d.,]+)\s+avg rating/) || tail.match(/([\d.,]+)\s+avg rating/) || [])[1];
    const cnt = (tail.match(/([\d,.]+)\s+ratings?/) || [])[1];
    const pub = (tail.match(/published\s+(\d{3,4})/) || [])[1];
    const { title, series } = splitSeries(htmlToText(titleM ? titleM[1] : ''));
    out.push({
      id,
      title,
      series,
      author: htmlToText(authorM ? authorM[1] : ''),
      cover: bigCover(imgM ? imgM[1] : ''),
      pages: null,
      avgRating: avg ? num(avg.replace(',', '.')) : null,
      ratingsCount: cnt ? num(cnt) : null,
      published: pub || null,
      description: '',
      url: `${BASE}/book/show/${id}`,
    });
  }
  return out;
}

export async function searchBooks(q) {
  const enc = encodeURIComponent(q);
  const [ac, page] = await Promise.allSettled([
    get(`${BASE}/book/auto_complete?format=json&q=${enc}`, { accept: 'application/json' }).then((r) => mapAutocomplete(JSON.parse(r.text))),
    get(`${BASE}/search?q=${enc}&search_type=books`).then((r) => parseSearchHtml(r.text)),
  ]);
  const quick = ac.status === 'fulfilled' ? ac.value : [];
  const full = page.status === 'fulfilled' ? page.value : [];
  const byId = new Map(quick.map((b) => [b.id, b]));
  let merged;
  if (full.length) {
    merged = full.map((b) => {
      const extra = byId.get(b.id);
      if (!extra) return b;
      byId.delete(b.id);
      return { ...b, pages: extra.pages, description: extra.description, descriptionTruncated: extra.descriptionTruncated, cover: b.cover || extra.cover, avgRating: b.avgRating ?? extra.avgRating };
    });
    merged = [...merged, ...byId.values()];
  } else {
    merged = quick;
  }
  if (!merged.length && ac.status === 'rejected' && page.status === 'rejected') {
    throw new Error('Goodreads no respondió a la búsqueda');
  }
  return merged.slice(0, 30);
}

// ---------- Ficha de un libro ----------

export function parseBookPage(html = '', id) {
  let ld = {};
  const ldm = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldm) {
    try {
      ld = JSON.parse(ldm[1]);
    } catch {
      ld = {};
    }
  }
  const meta = (p) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'));
    return m ? decode(m[1]) : '';
  };
  // Descripción completa desde el estado de la página, si está disponible.
  let description = '';
  const dm = html.match(/"description\(\{\\"stripped\\":true\}\)":"((?:[^"\\]|\\.)*)"/) || html.match(/"description":"((?:[^"\\]|\\.)*)"/);
  if (dm) {
    try {
      description = htmlToText(JSON.parse(`"${dm[1]}"`));
    } catch {
      description = '';
    }
  }
  if (!description) description = meta('og:description') || meta('description');
  const genres = [...html.matchAll(/\/genres\/[^"'>]+["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/g)].map((m) => decode(m[1]).trim());
  const author = Array.isArray(ld.author) ? ld.author[0]?.name : ld.author?.name;
  const { title, series } = splitSeries(decode(ld.name || meta('og:title') || ''));
  return {
    id: String(id),
    title,
    series,
    author: author ? decode(author) : '',
    cover: bigCover(ld.image || meta('og:image')),
    pages: ld.numberOfPages || null,
    avgRating: num(ld.aggregateRating?.ratingValue),
    ratingsCount: num(ld.aggregateRating?.ratingCount),
    description,
    genres: [...new Set(genres)].slice(0, 4),
    url: `${BASE}/book/show/${id}`,
  };
}
