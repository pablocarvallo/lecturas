// Diagnóstico temporal: estructura de los widgets y de "Year in Books".
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const G = 'https://www.goodreads.com';
const W = 'widget_bg_color=FFFFFF&widget_text_color=000000&widget_title_size=medium&widget_width=medium';
const cw = (shelf, sort, n, id) => `${G}/review/custom_widget/90308354.Pablo?cover_position=left&cover_size=medium&num_books=${n}&order=d&shelf=${shelf}&show_author=1&show_cover=1&show_rating=1&show_review=0&show_tags=0&show_title=1&sort=${sort}&${W}&widget_id=${id}`;
const tests = [
  ['custom_toread', cw('to-read', 'date_added', 200, 2)],
  ['custom_read', cw('read', 'date_read', 200, 3)],
  ['custom_reading', cw('currently-reading', 'date_added', 20, 4)],
  ['grid_toread', `${G}/review/grid_widget/90308354.Pablo?cover_size=medium&hide_link=&hide_title=&num_books=200&order=d&shelf=to-read&sort=date_added&widget_id=1`],
  ['year_in_books', `${G}/user/year_in_books/2026/90308354`],
];
const unesc = (t) => t.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, ' ').replace(/\\'/g, "'");
// Esqueleto: etiquetas con nombres de atributos; valores ocultos salvo clases y rutas.
function skeleton(html) {
  return (html.match(/<\/?[a-z][^>]*>/gi) || []).map((tag) =>
    tag.replace(/\s([a-z-]+)=["']([^"']*)["']/gi, (_, n, v) => {
      if (n === 'class') return ` .${v.replace(/\s+/g, '.')}`;
      if (n === 'href') return ` href=${(v.match(/^(?:https?:\/\/[^/]+)?(\/[a-z_]+\/[a-z_]+\/?)/i) || [])[1] || '·'}`;
      if (n === 'title' || n === 'alt') return ` ${n}=(${v.length})`;
      return ` ${n}`;
    })
  ).join(' ').replace(/\s+/g, ' ');
}
export default async function handler(req, res) {
  const out = {};
  await Promise.all(tests.map(async ([k, url]) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CL,es;q=0.9' }, redirect: 'follow' });
      const flat = unesc(await r.text());
      const count = (re) => (flat.match(re) || []).length;
      const o = {
        status: r.status,
        len: flat.length,
        n_review_show: count(/\/review\/show\/\d+/g),
        n_book_show: count(/\/book\/show\/\d+/g),
        n_author_show: count(/\/author\/show\/\d+/g),
        n_img_books: count(/<img[^>]+\/books\/\d+/g),
        n_each: count(/gr_custom_each_container/g),
        n_grid: count(/gr_grid_book_container/g),
        rating_titles: [...new Set((flat.match(/title="(it was amazing|really liked it|liked it|it was ok|did not like it)"/g) || []))].slice(0, 5),
      };
      if (k.startsWith('custom') || k.startsWith('grid')) {
        const a = flat.search(/gr_custom_each_container|gr_grid_book_container/);
        if (a > 0) {
          const block = flat.slice(a - 40, a + 1800);
          const s = skeleton(block);
          // en trozos cortos para poder leerlos sin cortes
          o.skel = s.slice(0, 1400).match(/.{1,110}/g);
        }
        // textos visibles del primer bloque (largos de cada uno, no el contenido)
        o.firstTitleLen = ((flat.match(/<a[^>]+\/review\/show\/\d+[^>]*>([^<]{2,})<\/a>/) || [])[1] || '').length;
      }
      if (k === 'year_in_books') {
        const texts = (flat.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim()).filter((x) => /\d/.test(x) && x.length < 50));
        o.digitTexts = texts.slice(0, 40);
      }
      out[k] = o;
    } catch (e) {
      out[k] = { error: e.message };
    }
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
