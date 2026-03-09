// Runs at document_start — hides images BEFORE the page renders.
// A synchronous <style> injection is faster than loading an external CSS file.
// content.js (document_end) adds .shmirat-eynaim-safe or .shmirat-eynaim-blocked
// to each image after analysis. If the extension is disabled, content.js removes this style.
const s = document.createElement("style");
s.id = "shmirat-eynaim-early-hide";
s.textContent = "img, video[poster] { opacity: 0 !important; }";
(document.head || document.documentElement).appendChild(s);
