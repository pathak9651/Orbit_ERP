# Request validation

Use the reusable `validate(spec, { source })` middleware in `server/utils/validation.js` for route-specific body, query, or path-parameter contracts. The default is `source: 'body'` and `rejectUnknown: true`. A field can be a type name or an options object with `type`, `required`, `enum`, and `immutableForRoles`.

The validator is deliberately shallow: it checks only declared top-level fields and compares the input keys with the declared keys. Mutation routes attach a declarative shape and a named business schema through `validate(spec, { bodySchema })`; the same request-key scan is reused, while the named validator enforces password rules, date ranges, recipient IDs, and nested invoice/location structures. Do not pass a request object or request-derived object directly into a Mongoose query.

```js
// Create body: require a name and email, and reject extra fields.
validate({ name: { type: 'string', required: true }, email: { type: 'email', required: true } })

// Update body: only an admin may change role.
validate({ role: { type: 'string', immutableForRoles: ['admin'] } })

// Search query: query parameters arrive as strings; integer accepts digit strings.
validate({ page: 'integer', search: 'string' }, { source: 'query' })

// Route parameter: require a Mongo ObjectId-shaped string.
validate({ id: { type: 'objectId', required: true } }, { source: 'params' })
```

An `immutableForRoles` list names the roles allowed to change that field. Other roles receive HTTP 403. Type, required, enum, and unexpected-field failures receive HTTP 400. Every JSON mutation route declares a top-level field shape; `bodySchema` adds its field-specific constraints, including nested invoice items and GPS structures.
