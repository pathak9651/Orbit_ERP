# MongoDB query safety

## Rules

- Build Mongoose filters and updates from fixed field names and validated scalar values. Never pass `req.body`, `req.query`, or `req.params` as an entire filter or update, and do not spread those request objects into one.
- Keep the identity, role, department, and ownership predicates in the database filter whenever the record can be scoped before it is read or changed. If a policy requires loading first (for example, a role-dependent manager review), check authorization before returning data or saving changes and document that reason in `docs/query-audit.md`.
- Escape search strings before building regular expressions, use enums for status filters, validate IDs before lookups, and keep sort fields server-owned.
- The `no-restricted-syntax` rule in `eslint.config.mjs` blocks direct `Model.method(req.body|query|params)` arguments. `npm run lint` runs the rule. It complements request validation; it does not prove authorization correctness.

## Query audits

See [query-audit.md](./query-audit.md) for the reviewed inventory, access boundaries, and remaining risks.

## `strictQuery`

The MongoDB bootstrap sets Mongoose `strictQuery` to `'throw'` outside production and `false` in production. We avoid `true` because stripping an unknown path can turn a restrictive filter into `{}`, which may match every document. Development/test `'throw'` helps reveal misspelled schema paths early; production `false` keeps unknown paths in the filter, where they do not match. This is a query correctness safeguard, not an injection defense: validated request values, server-built filters, and ownership checks remain the primary controls.

## Sanitization

Request-key sanitization is not enabled. Express 5 is in use, and compatibility and behavior for this application’s legitimate dotted data (including email addresses and nested payloads) have not yet been established. The primary controls are the declarative route validation, existing detailed mutation validators, fixed query construction, and query authorization. Do not add sanitization until its maintained package explicitly supports Express 5 and its body/query behavior is tested against the actual routes.
