// Diagnóstico temporal: qué fuentes de Goodreads responden desde Vercel.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const G = 'https://www.goodreads.com';
const tests = [
  ['rss_read', `${G}/review/list_rss/90308354?shelf=read`, true],
  ['rss_read_slug', `${G}/review/list_rss/90308354-pablo?shelf=read`, true],
  ['rss_read_sin_ua', `${G}/review/list_rss/90308354?shelf=read`, false],
  ['rss_otro_usuario', `${G}/review/list_rss/1053164?shelf=read`, true],
  ['rss_otro_usuario2', `${G}/review/list_rss/152185079?shelf=currently-reading`, true],
  ['html_lista', `${G}/review/list/90308354?shelf=read&per_page=100`, true],
  ['html_lista_print', `${G}/review/list/90308354-pablo?shelf=read&per_page=100&print=true`, true],
  ['html_lista_toread', `${G}/review/list/90308354-pablo?shelf=to-read&per_page=100`, true],
  ['desafio_2026', `${G}/user_challenges/65668650`, true],
  ['perfil', `${G}/user/show/90308354`, true],
];
export default async function handler(req, res) {
  const out = {};
  await Promise.all(tests.map(async ([k, url, ua]) => {
    try {
      const r = await fetch(url, { headers: ua ? { 'User-Agent': UA, 'Accept-Language': 'es-CL,es;q=0.9' } : {}, redirect: 'follow' });
      const t = await r.text();
      out[k] = {
        status: r.status,
        type: r.headers.get('content-type'),
        final: r.url,
        len: t.length,
        items: (t.match(/<item>/g) || []).length,
        reviewRows: (t.match(/<tr[^>]+class="bookalike review"/g) || t.match(/id="review_\d+"/g) || []).length,
        bookLinks: (t.match(/\/book\/show\/\d+/g) || []).length,
        dateRead: (t.match(/date_read_value[^>]*>([^<]+)</) || [])[1] || null,
        hasRead: (t.replace(/\s+/g, ' ').match(/has read[^<]{0,40}/) || [])[0] || null,
        signIn: /sign_in|ap\/signin|Sign in to/i.test(t.slice(0, 20000)),
        title: (t.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim().slice(0, 120) || null,
        head: t.slice(0, 160).replace(/\s+/g, ' '),
      };
    } catch (e) {
      out[k] = { error: e.message };
    }
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
