import { searchBooks } from './_lib.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q.length < 2) return res.status(200).json({ results: [] });
  try {
    const results = await searchBooks(q);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ results });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'La búsqueda no está disponible en este momento.', detail: e.message });
  }
}
