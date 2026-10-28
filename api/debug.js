// Diagnóstico temporal: bloque del widget de un libro puntual.
import { get, unescapeJs } from './_lib.js';

const URL_W = 'https://www.goodreads.com/review/custom_widget/90308354.Lecturas?cover_position=left&cover_size=medium&num_books=200&order=d&shelf=read&show_author=1&show_cover=1&show_rating=1&show_review=0&show_tags=0&show_title=1&sort=date_read&widget_bg_color=FFFFFF&widget_text_color=000000&widget_title_size=medium&widget_width=medium&widget_id=dbg';

function describe(blk) {
  const rating = (blk.match(/gr_custom_rating[\s\S]*?<\/div>/) || [''])[0];
  return {
    spanTag: ((rating.match(/<span\b[^>]*>/) || [''])[0]).replace(/title="([^"]*)"/, (_, v) => `title="${v}"`),
    starImgs: (rating.match(/<img\b[^>]*>/g) || []).map((t) => ({
      alt: (t.match(/\salt="([^"]*)"/) || [])[1] ?? null,
      file: ((t.match(/\ssrc="([^"]+)"/) || [])[1] || '').split('/').pop(),
    })),
    reviewId: (blk.match(/review\/show\/(\d+)/) || [])[1] || null,
    cover: ((blk.match(/<img\b[^>]*\ssrc="([^"]+)"/) || [])[1] || '').split('/').slice(-2).join('/'),
    titleLen: ((blk.match(/<a\b[^>]*\stitle="([^"]*)"/) || [])[1] || '').length,
  };
}

export default async function handler(req, res) {
  const { text } = await get(URL_W);
  const s = unescapeJs(text);
  const blocks = s.split(/<div[^>]+class="gr_custom_each_container[^"]*"[^>]*>/).slice(1);
  const pick = (word) => blocks.map((b, i) => ({ i, b })).filter(({ b }) => b.toLowerCase().includes(word));
  const out = {
    total: blocks.length,
    terracota: pick('terracota').map(({ i, b }) => ({ index: i, ...describe(b) })),
    meriendas: pick('meriendas').map(({ i, b }) => ({ index: i, ...describe(b) })),
  };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
