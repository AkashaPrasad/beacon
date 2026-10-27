# MongoDB indexes

Mongoose declares the B-tree indexes below. They are built on boot (`ensureIndexes()`) and must
match what the worker declares for the same collections (see `docs/API.md` §12).

| Collection | Index | Options |
|---|---|---|
| `users` | `{ googleSub: 1 }` | unique |
| `users` | `{ email: 1 }` | |
| `profiles` | `{ userId: 1 }` | unique |
| `settings` | `{ userId: 1 }` | unique |
| `sources` | `{ ownerId: 1 }` | |
| `sources` | `{ scope: 1, packIds: 1 }` | |
| `sources` | `{ ownerId: 1, url: 1 }` | unique, partial `{ scope: 'personal' }` |
| `sources` | `{ seedKey: 1 }` | unique, partial `{ seedKey: { $type: 'string' } }` |
| `subscriptions` | `{ userId: 1, sourceId: 1 }` | unique |
| `subscriptions` | `{ sourceId: 1 }` | |
| `listings` | `{ canonicalKey: 1 }` | unique |
| `listings` | `{ sourceId: 1 }` | |
| `listings` | `{ archived: 1, type: 1, deadlineAt: 1 }` | |
| `listings` | `{ postedAt: -1 }` | |
| `listings` | `{ company: 1 }` | |
| `matches` | `{ userId: 1, score: -1 }` | |
| `matches` | `{ userId: 1, listingId: 1 }` | unique |
| `interactions` | `{ userId: 1, listingId: 1 }` | unique |
| `interactions` | `{ userId: 1, saved: 1 }` | |
| `explanations` | `{ userId: 1, listingId: 1, profileHash: 1 }` | unique |
| `tracker_items` | `{ userId: 1, stage: 1, position: 1 }` | |
| `tracker_items` | `{ userId: 1, listingId: 1 }` | |
| `alert_rules` | `{ userId: 1 }` | |
| `notifications` | `{ userId: 1, createdAt: -1 }` | |
| `notifications` | `{ userId: 1, readAt: 1 }` | |
| `push_subscriptions` | `{ endpoint: 1 }` | unique |
| `push_subscriptions` | `{ userId: 1 }` | |

## Atlas Vector Search index (created in Atlas, not by Mongoose)

Used by `src/lib/vector.ts` when `VECTOR_SEARCH=atlas` (stage-1 retrieval and "similar listings").

- Name: **`listings_embedding`**
- Collection: `listings`
- Type: `vectorSearch`

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
    { "type": "filter", "path": "type" },
    { "type": "filter", "path": "archived" },
    { "type": "filter", "path": "deadlineAt" }
  ]
}
```

Create it with the Atlas UI (*Atlas Search → Create Search Index → Atlas Vector Search → JSON
editor*), the Atlas Admin API, or mongosh against the cluster:

```js
db.listings.createSearchIndex({
  name: 'listings_embedding',
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: 384, similarity: 'cosine' },
      { type: 'filter', path: 'type' },
      { type: 'filter', path: 'archived' },
      { type: 'filter', path: 'deadlineAt' },
    ],
  },
});
```

M0 clusters allow up to 3 search/vector indexes. Listings without an embedding (an empty array)
are skipped by the index. When the index is missing or `$vectorSearch` fails, the adapter logs a
warning and falls back to the in-memory cosine scan.
