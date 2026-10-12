import { get, parseBookPage } from './_lib.js';

export default async function handler(req, res) {
  const id = String(req.query.id || '').match(/^\d+/)?.[0];
  if (!id) return res.status(400).json({ error: 'Falta el identificador del libro.' });
  try {
    const { text } = await get(`https://www.goodreads.com/book/show/${id}`);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(parseBookPage(text, id));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'No se pudo cargar la ficha del libro.', detail: e.message });
  }
}
