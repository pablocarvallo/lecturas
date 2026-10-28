// Diagnóstico temporal: qué fuentes de Goodreads responden desde Vercel.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const G = 'https://www.goodreads.com';
const W = 'widget_bg_color=FFFFFF&widget_text_color=000000&widget_title_size=medium&widget_width=medium';
const tests = [
  ['grid_toread', `${G}/review/grid_widget/90308354.Pablo?cover_size=medium&hide_link=&hide_title=&num_books=200&order=d&shelf=to-read&sort=date_added&widget_id=1`],
  ['custom_toread', `${G}/review/custom_widget/90308354.Pablo?cover_position=left&cover_size=medium&num_books=200&order=d&shelf=to-read&show_author=1&show_cover=1&show_rating=1&show_review=0&show_tags=0&show_title=1&sort=date_added&${W}&widget_id=2`],
  ['custom_read', `${G}/review/custom_widget/90308354.Pablo?cover_position=left&cover_size=medium&num_books=200&order=d&shelf=read&show_author=1&show_cover=1&show_rating=1&show_review=0&show_tags=0&show_title=1&sort=date_read&${W}&widget_id=3`],
  ['custom_reading', `${G}/review/custom_widget/90308354.Pablo?cover_position=left&cover_size=medium&num_books=20&order=d&shelf=currently-reading&show_author=1&show_cover=1&show_rating=0&show_review=0&show_tags=0&show_title=1&sort=date_added&${W}&widget_id=4`],
  ['updates_rss', `${G}/user/updates_rss/90308354`],
  ['stats', `${G}/review/stats/90308354-pablo`],
  ['year_in_books', `${G}/user/year_in_books/2026/90308354`],
  ['desafio_2026', `${G}/user_challenges/65668650`],
  ['desafio_2025', `${G}/user_challenges/58504153`],
];
function books(t) {
  const out = [];
  const re = /<a[^>]+href="(?:https:\/\/www\.goodreads\.com)?\/book\/show\/(\d+)[^"]*"[^>]*>\s*<img[^>]+(?:alt|title)=\\?"([^"\\]+)\\?"[^>]*>/g;
  let m;
  while ((m = re.exec(t))) out.push({ id: m[1], alt: m[2] });
  return out;
}
export default async function handler(req, res) {
  const out = {};
  await Promise.all(tests.map(async ([k, url]) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CL,es;q=0.9' }, redirect: 'follow' });
      const t = await r.text();
      const flat = t.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, ' ');
      const b = books(flat);
      const more = flat.indexOf('More like');
      const inList = more > 0 ? books(flat.slice(0, more)) : b;
      const vm = flat.search(/View More/i);
      out[k] = {
        status: r.status,
        signIn: /\/sign_in|ap\/signin/.test(r.url),
        len: t.length,
        booksFound: b.length,
        booksBeforeMoreLike: inList.length,
        uniqueIds: new Set(inList.map((x) => x.id)).size,
        first3: inList.slice(0, 3),
        hasRead: (flat.replace(/\s+/g, ' ').match(/has read[^<]{0,40}/) || [])[0] || null,
        ratingText: (flat.match(/(rated it|really liked it|it was amazing|liked it|it was ok)/) || [])[0] || null,
        dateHints: (flat.match(/(read|added|date)[^<]{0,12}(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}/i) || [])[0] || null,
        viewMore: vm > 0 ? flat.slice(Math.max(0, vm - 300), vm + 60).replace(/\s+/g, ' ') : null,
      };
    } catch (e) {
      out[k] = { error: e.message };
    }
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
