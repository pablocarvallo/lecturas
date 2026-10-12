# Lecturas

Vista minimalista de mi cuenta de Goodreads, con la estética de iOS 26: desafío actual y anteriores, libros que estoy leyendo, lista de "Quiero leer" y un buscador sobre toda la base de Goodreads.

## Cómo funciona

Goodreads ya no ofrece una API pública, así que la app usa tres fuentes públicas a través de funciones de Vercel (carpeta `api/`):

| Dato | Fuente |
| --- | --- |
| Leyendo, Quiero leer, Leídos | Feed RSS de cada estante (`/review/list_rss/…`) |
| Avance de lectura (%, página) | Página pública del perfil |
| Desafíos por año | Widget público del desafío de lectura |
| Buscador y ficha de libro | Buscador de Goodreads y página de cada libro |

El perfil de Goodreads debe seguir siendo público para que los estantes sean visibles.

## Publicar en Vercel

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. **Add New → Project** y elige este repositorio.
3. Deja la configuración tal como viene y pulsa **Deploy**.

Vercel publica de nuevo automáticamente cada vez que cambia el repositorio.

## Instalar en el iPhone

1. Abre la dirección que entrega Vercel en Safari.
2. Toca **Compartir → Agregar a inicio**.

## Ajustes

- **Otro usuario**: define la variable de entorno `GOODREADS_USER_ID` en Vercel (por defecto `90308354`).
- **Desafíos de años nuevos**: el desafío del año en curso se detecta solo. Para que un año ya cerrado conserve su meta, su identificador debe estar en `CHALLENGE_IDS` dentro de `api/_lib.js` (aparece en la dirección del desafío, por ejemplo `goodreads.com/challenges/11680-2026-reading-challenge`).
- **Actualizar**: los datos se refrescan al abrir la app, al tirar la pantalla hacia abajo o desde el botón del perfil.
