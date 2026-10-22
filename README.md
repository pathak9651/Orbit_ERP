# Orbit ERP

Orbit ERP has a React + Vite JavaScript client and a Node.js + Express server backed by MongoDB.

## Project structure

```text
client/src/
  components/       Reusable auth, layout, and dashboard UI
  services/api.js   Frontend API requests
  styles/theme.css  Central dark theme and responsive rules
  App.jsx           Auth state and top-level composition
server/
  app.js            Express middleware and route registration
  index.js          Environment, database connection, and startup
  configs/          Database configuration
  controllers/      Request handlers
  middlewares/      JWT authentication and role authorization
  models/           Mongoose schemas
  routes/           HTTP route declarations
  services/         Password and JWT services
```

## Prerequisites

- Node.js 20.19+ or 22.12+
- MongoDB running locally, or a MongoDB connection string

## Start development

From the project root:

```sh
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Vite serves the client at `http://localhost:5173` and proxies `/api` requests to Express at `http://localhost:8000`.

The server uses `mongodb://localhost:27017/orbit-erp` by default. Make sure `server/.env` has a random `JWT_SECRET` of at least 32 characters; use `server/.env.example` as a template if needed. Set `MONGODB_URI` there if you use another MongoDB instance. You can run either side on its own with `npm run dev:client` or `npm run dev:server`.

Signup and login issue a seven-day JWT in an HTTP-only cookie. `/api/me` requires a valid token, and `/api/admin` additionally requires the `admin` role. Passwords are stored as bcrypt hashes. Accounts created by the earlier plaintext-password version are upgraded to bcrypt the first time they successfully sign in.

## Seed an admin

Set `ADMIN_PASSWORD` in the environment and run `npm run seed:admin --prefix server`. The seed uses `admin@gmail.com` by default; set `ADMIN_EMAIL` to override it. It creates the account or promotes an existing account with that email, replacing its password with a bcrypt hash.

## Production build

Run `npm run build` from the root, then `npm start`. Express serves `client/dist` when that build exists. The server listens on port 8000 by default; set `PORT` to change it.
