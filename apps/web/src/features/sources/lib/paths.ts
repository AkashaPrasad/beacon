/** URLs for the Sources screens (src/app/routes.tsx: /sources, /sources/packs, /sources/:id, /sources/packs/:id). */
export const SOURCES_PATH = '/sources';
export const PACKS_PATH = '/sources/packs';

export const sourcePath = (id: string): string => `${SOURCES_PATH}/${encodeURIComponent(id)}`;
export const packPath = (id: string): string => `${PACKS_PATH}/${encodeURIComponent(id)}`;
