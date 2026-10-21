# CRM Interface Builder

bhai ye chij chaiye mujhe iska ui do banan ke or bss uiux hi chaiye mujhe frontend baki kuch nahi image bagera met banana direcr frontend banana bhai iske under ek crm hoga uske under ye sari chije setup karo tum frontend hi banana hai per esa soch ke banana ki ek real world user use karega ise to her chij perfect honi chaiye ek real crm ki tar

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0e138c44-c2d3-4647-bb89-668458d4a221).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Connecting to the Traveldesk API

The workspace is fully backed by the Node.js + SQLite API in [`backend/`](backend/README.md):
sign-in, records, tasks, custom fields, branches, members and the audit trail all read/write over
REST — there is no browser-only demo store.

1. Start the backend (see `backend/README.md`), then copy `.env.example` to `.env` and point
   `VITE_API_URL` at it (defaults to `http://localhost:4000/api/v1`).
2. Run `npm run dev` and sign in with the seeded workspace owner:
   `owner@horizontravel.in` / `Traveldesk@123`.

