import { createServer } from "./server";

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "127.0.0.1";

const app = createServer();
await app.listen({ port, host });

console.log(`AssiniLang API listening at http://${host}:${port}`);
