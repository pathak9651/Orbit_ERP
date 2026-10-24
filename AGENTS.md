# Project contribution guidance

## List pagination

- Any screen that displays a collection of database records must use server-side pagination. Do not fetch the full collection just to paginate it in the browser.
- Reuse `server/utils/pagination.js` for list endpoint query options and pagination metadata. Keep existing authorization, filtering, sorting, and month/date scopes in the database query before pagination.
- Return the existing named collection alongside a `pagination` object containing `page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. For endpoints returning multiple independently paged collections, expose a separate metadata property for each collection.
- Reuse `client/src/components/common/Pagination.jsx` for page controls, and pass page/filter values through the shared API client in `client/src/services/api.js`.
- Keep small reference datasets used by selectors (such as roles and departments) unpaged unless they become large enough to need searchable selection.
- When adding a new database-backed list or report in future work, apply this same server/client pagination pattern by default.

## Validation and tests

- Keep reusable client validation in `client/src/services/validation.js` and server request validation in `server/utils/validation.js`. Validate every mutation in the client for helpful feedback and again on the server before controller logic. Client checks improve usability; server checks remain authoritative for security.
- For each new feature or security-sensitive change, add and run relevant unit tests and integration tests. Keep tests runnable through the root `npm test` command.

## API rate limiting

- Reuse the named limiters in `server/services/rateLimiter.js` for new public, authentication, bulk, or email-delivery routes.
- The in-memory limiter is scoped to one server process. When deploying behind a reverse proxy, set `TRUST_PROXY` only to the trusted hop count or proxy subnet so the limiter sees the real client address.
- Use a shared store if the API is deployed across multiple server processes or instances.
