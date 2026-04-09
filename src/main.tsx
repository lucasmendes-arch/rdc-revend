import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload on stale chunk errors after deploy (Vite hash mismatch)
window.addEventListener('vite:preloadError', () => {
  const key = 'rdc_chunk_reload'
  const last = sessionStorage.getItem(key)
  if (!last || Date.now() - Number(last) > 30_000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById("root")!).render(<App />);
