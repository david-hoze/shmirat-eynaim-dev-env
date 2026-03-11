-- Extension.ContentEarly — Runs at document_start to hide images before render
--
-- Compile with: idris2 --cg javascript -o content-early-idris.js src/Extension/ContentEarly.idr
--
-- Injects a <style> that hides all images immediately. Content.idr (document_end)
-- adds .shmirat-eynaim-safe or .shmirat-eynaim-blocked after analysis.

module Extension.ContentEarly

import FFI.Core

%foreign "javascript:lambda:(w) => { var s = document.createElement('style'); s.id = 'shmirat-eynaim-early-hide'; s.textContent = 'img, video[poster] { opacity: 0 !important; }'; (document.head || document.documentElement).appendChild(s); }"
prim__injectEarlyHide : PrimIO ()

export
main : IO ()
main = primIO prim__injectEarlyHide
