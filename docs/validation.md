# Request validation

Use the reusable `validate(spec, { source })` middleware in `server/utils/validation.js` for route-specific body, query, or path-parameter contracts. The default is `source: 'body'` and `rejectUnknown: true`. A field can be a type name or an options object with `type`, `required`, `enum`, and `immutableForRoles`.

The validator is deliberately shallow: it checks only declared top-level fields and compares the input keys with the declared keys. Keep nested business validation in the existing named body validators where nested arrays or objects need more detailed rules. Do not pass a request object or request-derived object directly into a Mongoose query.

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

An `immutableForRoles` list names the roles allowed to change that field. Other roles receive HTTP 403. Type, required, enum, and unexpected-field failures receive HTTP 400. Existing `validateBody(schemaName)` validators remain on mutation routes for field-specific constraints such as password strength, date ranges, and nested invoice items.
