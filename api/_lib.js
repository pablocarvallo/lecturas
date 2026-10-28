// Utilidades compartidas para leer datos públicos de Goodreads.
// Vercel no publica como ruta los archivos de /api que empiezan con "_".
//
// Fuentes (octubre 2026): Goodreads eliminó los RSS de los estantes y la lista
// completa de un estante exige iniciar sesión. Lo que sigue siendo público:
//   · el widget para blogs (review/custom_widget): leyendo, quiero leer y los
//     últimos 100 leídos con la nota del usuario, sin fechas;
//   · las páginas de cada desafío anual (user_challenges/ID): conteo y libros del año;
//   · el perfil (user/show): avance de lectura y cantidad de libros por estante.

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
    if (/\/sign_in|\/ap\/signin/.test(res.url)) throw new Error(`Goodreads pide iniciar sesión para ${url}`);
    return { text: await res.text(), url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Texto ----------

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', lrm: '' };

export function decode(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}

// Convierte HTML simple en texto plano conservando saltos de párrafo.
export function htmlToText(html = '') {
  return decode(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ ‎‏]/g, ' ')
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

// El nombre del archivo de la portada es el identificador del libro: …/books/1266724005l/1124818._SX98_.jpg
export function idFromCover(url = '') {
  return (String(url).match(/\/books\/\d+[a-z]?\/(\d+)[._]/) || [])[1] || null;
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

// Quita el escapado de cadenas JavaScript (los widgets llegan como document.write / innerHTML).
export function unescapeJs(s = '') {
  return String(s)
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ');
}

const RATING_WORDS = { 'did not like it': 1, 'it was ok': 2, 'liked it': 3, 'really liked it': 4, 'it was amazing': 5 };

// ---------- Widget para blogs (estantes) ----------

export function parseCustomWidget(js = '') {
  const s = unescapeJs(js);
  const blocks = s.split(/<div[^>]+class="gr_custom_each_container[^"]*"[^>]*>/).slice(1);
  const out = [];
  for (const blk of blocks) {
    const link = blk.match(/<a\b[^>]*>/)?.[0] || '';
    const fullTitle = decode((link.match(/\stitle="([^"]*)"/) || [])[1] || '');
    const reviewId = (link.match(/review\/show\/(\d+)/) || [])[1] || null;
    const img = blk.match(/<img\b[^>]*>/)?.[0] || '';
    const src = (img.match(/\ssrc="([^"]+)"/) || [])[1] || '';
    const titleText = htmlToText((blk.match(/gr_custom_title[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    const author = htmlToText((blk.match(/gr_custom_author[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    const ratingWord = ((blk.match(/staticStars[^"]*"[^>]*\stitle="([^"]+)"/) || [])[1] || '').toLowerCase();
    // Goodreads admite notas fraccionarias (p. ej. 4¼): en ese caso no hay texto, solo estrellas
    // llenas (…star_active.png), parciales (…star_25pct.png) y vacías (…star_inactive.png).
    const ratingDiv = (blk.match(/gr_custom_rating[\s\S]*?<\/div>/) || [''])[0];
    let starSum = 0;
    let starImgs = 0;
    for (const m of ratingDiv.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) {
      if (/star_/.test(m[1])) starImgs++;
      if (/star_active/.test(m[1])) starSum += 1;
      else {
        const part = m[1].match(/star_(\d{1,2})pct/);
        if (part) starSum += Number(part[1]) / 100;
      }
    }
    const stars = starImgs === 5 && starSum > 0 ? Math.round(starSum * 4) / 4 : null;
    const id = idFromCover(src);
    const { title, series } = splitSeries(fullTitle || titleText);
    if (!title) continue;
    out.push({
      id: id || `r${reviewId}`,
      reviewId,
      title,
      series,
      author,
      cover: bigCover(src),
      userRating: stars || RATING_WORDS[ratingWord] || null,
      url: id ? `${BASE}/book/show/${id}` : reviewId ? `${BASE}/review/show/${reviewId}` : `${BASE}/user/show/${USER_ID}`,
    });
  }
  return out;
}

export async function fetchWidgetShelf(shelf, { sort = 'date_added', max = 100 } = {}) {
  const params = new URLSearchParams({
    cover_position: 'left',
    cover_size: 'medium',
    num_books: String(max),
    order: 'd',
    shelf,
    show_author: '1',
    show_cover: '1',
    show_rating: '1',
    show_review: '0',
    show_tags: '0',
    show_title: '1',
    sort,
    widget_bg_color: 'FFFFFF',
    widget_text_color: '000000',
    widget_title_size: 'medium',
    widget_width: 'medium',
    widget_id: `lecturas_${shelf}`,
  });
  const { text } = await get(`${BASE}/review/custom_widget/${USER_ID}.Lecturas?${params}`);
  return parseCustomWidget(text);
}

// ---------- Perfil (nombre, foto, avance de lectura, estantes) ----------

export function parseProfile(html = '') {
  const meta = (p) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'));
    return m ? decode(m[1]) : '';
  };
  const name = meta('profile:first_name') || meta('og:title') || 'Lector';
  const avatar = meta('og:image') || null;

  // Cantidad de libros por estante: «read‎ (169)»
  const shelves = {};
  for (const m of html.matchAll(/shelf=([a-z0-9-]+)[^"]*"[^>]*>\s*[^<(]*\((\d[\d,.]*)\)\s*</gi)) {
    if (!(m[1] in shelves)) shelves[m[1]] = num(m[2]);
  }

  // Avance de cada libro en "is currently reading"
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
  return { name, avatar, progress, shelves };
}

// ---------- Desafíos ----------

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

// Página pública de un desafío: «Pablo has read 26 of 30 books in 2026.» y las portadas del año.
export function parseChallengePage(html = '') {
  const flat = html.replace(/\s+/g, ' ');
  const hr = flat.match(/has read\s+([\d,.]+)\s+of\s+([\d,.]+)\s+books?\s+in\s+(\d{4})/i);
  const done = flat.match(/completed (?:his|her|their) goal of reading\s+([\d,.]+)\s+books?\s+in\s+(\d{4})/i);
  const cut = html.search(/More like [^<]*books/i);
  const part = cut > 0 ? html.slice(0, cut) : html;
  const books = [];
  const seen = new Set();
  const re = /<a\b[^>]*href="(?:https:\/\/www\.goodreads\.com)?\/book\/show\/(\d+)[^"]*"[^>]*>\s*<img\b([^>]*)>/g;
  let m;
  while ((m = re.exec(part))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const attrs = m[2];
    const alt = decode((attrs.match(/\salt="([^"]*)"/) || attrs.match(/\stitle="([^"]*)"/) || [])[1] || '');
    const src = (attrs.match(/\ssrc="([^"]+)"/) || [])[1] || '';
    if (!alt) continue;
    seen.add(id);
    const k = alt.lastIndexOf(' by ');
    const { title, series } = splitSeries(k > 0 ? alt.slice(0, k) : alt);
    books.push({ id, title, series, author: k > 0 ? alt.slice(k + 4).trim() : '', cover: bigCover(src), url: `${BASE}/book/show/${id}` });
  }
  return {
    read: hr ? num(hr[1]) : null,
    goal: hr ? num(hr[2]) : done ? num(done[1]) : null,
    year: hr ? Number(hr[3]) : done ? Number(done[2]) : null,
    books,
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
  const results = await Promise.allSettled(
    Object.entries(CHALLENGE_IDS).map(async ([year, cid]) => {
      const { text } = await get(`${BASE}/user_challenges/widget/${who}?challenge_id=${cid}&v=2`);
      const w = parseWidget(text);
      return w && w.challengeId === cid && Number(year) === w.year ? w : null;
    })
  );
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    if (!found.has(r.value.year) || !found.get(r.value.year).url) found.set(r.value.year, r.value);
  }

  // 3) La página de cada desafío trae el conteo al día (el widget a veces queda en 0) y los libros.
  const list = [...found.values()];
  await Promise.allSettled(
    list.map(async (c) => {
      if (!c.url) return;
      const p = parseChallengePage((await get(c.url, { timeout: 15000 })).text);
      if (p.year && p.year !== c.year) return;
      if (p.read != null) c.read = p.read;
      if (p.goal != null) c.goal = p.goal;
      c.books = p.books;
    })
  );
  return list
    .map(({ year, goal, read, url, challengeId, books }) => ({ year, goal, read, url, challengeId, books: books || [] }))
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
  const pub = (html.match(/First published[^<]*?(\d{4})/) || html.match(/Published[^<]*?(\d{4})/) || [])[1] || null;
  return {
    id: String(id),
    title,
    series,
    author: author ? decode(author) : '',
    cover: bigCover(ld.image || meta('og:image')),
    pages: ld.numberOfPages || null,
    avgRating: num(ld.aggregateRating?.ratingValue),
    ratingsCount: num(ld.aggregateRating?.ratingCount),
    published: pub,
    description,
    genres: [...new Set(genres)].slice(0, 4),
    url: `${BASE}/book/show/${id}`,
  };
}
