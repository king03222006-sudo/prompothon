import server from "../frontend/dist/server/server.js";

export default async function handler(req: any, res: any) {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, value as string);
        }
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const webRequest = new Request(url, init);
    const response = await (server as any).fetch(webRequest, {}, {});

    res.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error("Vercel SSR render error:", err);
    res.statusCode = 500;
    res.end(`Internal Server Error: ${err.message}`);
  }
}
