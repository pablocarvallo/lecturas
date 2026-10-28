# Lecturas

Vista minimalista de mi cuenta de Goodreads, con la estética de iOS 26: desafío actual y anteriores, libros que estoy leyendo, lista de "Quiero leer" y un buscador sobre toda la base de Goodreads.

## Cómo funciona

Goodreads ya no ofrece una API pública y en octubre de 2026 eliminó los feeds RSS de los estantes (la lista completa de un estante ahora exige iniciar sesión). La app usa fuentes que siguen siendo públicas, a través de funciones de Vercel (carpeta `api/`):

| Dato | Fuente |
| --- | --- |
| Leyendo, Quiero leer, últimos 100 leídos con tu nota | Widget de Goodreads para blogs (`/review/custom_widget/…`) |
| Avance de lectura (%, página) y libros por estante | Página pública del perfil |
| Desafío de cada año: meta, conteo y libros leídos | Widget del desafío + página pública del desafío (`/user_challenges/…`) |
| Buscador y ficha de libro | Buscador de Goodreads y página de cada libro |

Ninguna de estas fuentes entrega la fecha en que se leyó cada libro, por eso la app muestra el año de lectura y el ritmo mensual promedio en vez de un gráfico por mes.

El perfil de Goodreads debe seguir siendo público.

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
