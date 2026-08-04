import { createServer } from "node:http";
import { health } from "./health.js";

const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(health()));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(port, () => console.log(`service listening on :${port}`));
