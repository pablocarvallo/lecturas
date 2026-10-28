import { USER_ID, get, fetchWidgetShelf, parseProfile, fetchChallenges } from './_lib.js';

export default async function handler(req, res) {
  const errors = [];
  const safe = async (label, fn, fallback) => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      return fallback;
    }
  };

  const [reading, toRead, read, profile, challenges] = await Promise.all([
    safe('leyendo', () => fetchWidgetShelf('currently-reading', { max: 50 }), []),
    safe('quiero leer', () => fetchWidgetShelf('to-read', { max: 200 }), []),
    safe('leídos', () => fetchWidgetShelf('read', { sort: 'date_read', max: 200 }), []),
    safe('perfil', async () => parseProfile((await get(`https://www.goodreads.com/user/show/${USER_ID}`)).text), null),
    safe('desafíos', () => fetchChallenges(), []),
  ]);

  // Avance de lectura (está en el perfil, no en el widget).
  const progress = profile?.progress || {};
  for (const b of reading) if (progress[b.id]) b.progress = progress[b.id];

  // Cruce entre los libros de cada desafío y los leídos del widget:
  // el widget aporta tu nota y el título completo; el desafío aporta el año.
  const readById = new Map(read.map((b) => [b.id, b]));
  for (const c of challenges) {
    c.books = (c.books || []).map((b) => {
      const w = readById.get(b.id);
      if (w && !w.year) w.year = c.year;
      return w ? { ...b, title: w.title, series: w.series || b.series, author: w.author || b.author, cover: w.cover || b.cover, userRating: w.userRating } : { ...b, userRating: null };
    });
  }

  if (!reading.length && !toRead.length && !read.length && !challenges.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'No fue posible leer los datos de Goodreads.', errors });
  }

  const shelves = profile?.shelves || {};
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).json({
    user: { id: USER_ID, name: profile?.name || 'Lector', avatar: profile?.avatar || null, url: `https://www.goodreads.com/user/show/${USER_ID}` },
    updatedAt: new Date().toISOString(),
    errors,
    counts: {
      reading: shelves['currently-reading'] ?? reading.length,
      toRead: shelves['to-read'] ?? toRead.length,
      read: shelves.read ?? read.length,
    },
    challenges,
    reading,
    toRead,
    read,
  });
}
