import { USER_ID, get, fetchShelf, parseProfile, fetchChallenges } from './_lib.js';

const byDateDesc = (key) => (a, b) => (b[key] || '').localeCompare(a[key] || '');

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
    safe('leyendo', () => fetchShelf('currently-reading'), []),
    safe('quiero leer', () => fetchShelf('to-read'), []),
    safe('leídos', () => fetchShelf('read'), []),
    safe('perfil', async () => parseProfile((await get(`https://www.goodreads.com/user/show/${USER_ID}`)).text), null),
    safe('desafíos', () => fetchChallenges(), []),
  ]);

  const progress = profile?.progress || {};
  for (const b of reading) if (progress[b.id]) b.progress = progress[b.id];

  reading.sort(byDateDesc('addedAt'));
  toRead.sort(byDateDesc('addedAt'));
  read.sort((a, b) => (b.readAt || b.addedAt || '').localeCompare(a.readAt || a.addedAt || ''));

  // Libros leídos por año (según la fecha de lectura del estante "read").
  const perYear = {};
  for (const b of read) {
    if (!b.readAt) continue;
    const y = new Date(b.readAt).getUTCFullYear();
    perYear[y] = (perYear[y] || 0) + 1;
  }
  const byYear = new Map(challenges.map((c) => [c.year, { ...c }]));
  for (const [y, count] of Object.entries(perYear)) {
    const year = Number(y);
    const c = byYear.get(year);
    if (c) c.read = Math.max(c.read || 0, count);
    else byYear.set(year, { year, goal: null, read: count, url: null });
  }
  const allChallenges = [...byYear.values()].sort((a, b) => b.year - a.year);

  if (!reading.length && !toRead.length && !read.length && !allChallenges.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'No fue posible leer los datos de Goodreads.', errors });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).json({
    user: { id: USER_ID, name: profile?.name || 'Lector', avatar: profile?.avatar || null, url: `https://www.goodreads.com/user/show/${USER_ID}` },
    reading,
    toRead,
    read,
    challenges: allChallenges,
    updatedAt: new Date().toISOString(),
    errors,
  });
}
