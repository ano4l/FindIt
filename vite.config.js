import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the React app (5173) talks to the API server (3001) through this proxy.
// changeOrigin stays off so the API sees this server's address and puts it in the links it emails
// (confirm email, reset password); otherwise they would point at port 3001.
const api = { target: "http://localhost:3001", changeOrigin: false };

// Private beta: every page asks search engines not to list the site. Set FINDIT_ALLOW_INDEXING=true
// in the build environment (Vercel → Production) when the site is ready to be found publicly.
const privateBeta = {
  name: "findit-private-beta",
  transformIndexHtml: (html) => (process.env.FINDIT_ALLOW_INDEXING === "true" ? html
    : html.replace("</title>", '</title>\n    <meta name="robots" content="noindex, nofollow" />')),
};

export default defineConfig({
  plugins: [react(), privateBeta],
  server: { proxy: { "/api": api, "/uploads": api } },
});
