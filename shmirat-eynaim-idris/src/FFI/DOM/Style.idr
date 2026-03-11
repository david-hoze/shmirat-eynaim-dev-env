-- FFI.DOM.Style — CSS class manipulation and style queries
--
-- NOTE: This module deliberately does NOT expose getComputedStyle for
-- background-image. That was the root cause of the CSS-JS coupling bug.
-- Use getImageSrc from FFI.DOM.Element instead, which reads inline style.

module FFI.DOM.Style

import FFI.Core
import FFI.DOM.Element

---------------------------------------------------------------------------
-- Class manipulation
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, cls, w) => { el.classList.add(cls); }"
prim__addClass : Element s -> String -> PrimIO ()

%foreign "browser:lambda:(_s, el, cls, w) => { el.classList.remove(cls); }"
prim__removeClass : Element s -> String -> PrimIO ()

%foreign "browser:lambda:(_s, el, cls, w) => el.classList.toggle(cls)"
prim__toggleClass : Element s -> String -> PrimIO Bool

export
addClass : HasIO io => Element s -> String -> io ()
addClass el cls = primIO $ prim__addClass el cls

export
removeClass : HasIO io => Element s -> String -> io ()
removeClass el cls = primIO $ prim__removeClass el cls

export
toggleClass : HasIO io => Element s -> String -> io Bool
toggleClass el cls = primIO $ prim__toggleClass el cls

---------------------------------------------------------------------------
-- Computed style (safe subset — NO background-image)
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, prop, w) => getComputedStyle(el).getPropertyValue(prop)"
prim__getComputedProp : Element s -> String -> PrimIO String

-- | Read a computed style property.
-- SAFETY: This is exposed for properties like 'display', 'opacity', 'visibility'.
-- For background-image URLs, use `getImageSrc` which reads inline style.
export
getComputedProp : HasIO io => Element s -> String -> io String
getComputedProp el prop = primIO $ prim__getComputedProp el prop

---------------------------------------------------------------------------
-- Inline style
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, prop, val, w) => { el.style.setProperty(prop, val); }"
prim__setStyle : Element s -> String -> String -> PrimIO ()

%foreign "browser:lambda:(_s, el, prop, val, priority, w) => { el.style.setProperty(prop, val, priority); }"
prim__setStyleImportant : Element s -> String -> String -> String -> PrimIO ()

%foreign "browser:lambda:(_s, el, prop, w) => { el.style.removeProperty(prop); }"
prim__removeStyle : Element s -> String -> PrimIO ()

export
setStyle : HasIO io => Element s -> String -> String -> io ()
setStyle el prop val = primIO $ prim__setStyle el prop val

export
setStyleImportant : HasIO io => Element s -> String -> String -> io ()
setStyleImportant el prop val = primIO $ prim__setStyleImportant el prop val "important"

export
removeStyle : HasIO io => Element s -> String -> io ()
removeStyle el prop = primIO $ prim__removeStyle el prop

---------------------------------------------------------------------------
-- Inject a <style> element
---------------------------------------------------------------------------

%foreign "browser:lambda:(id, css, w) => { var s = document.createElement('style'); s.id = id; s.textContent = css; (document.head || document.documentElement).appendChild(s); }"
prim__injectStyle : String -> String -> PrimIO ()

export
injectStyle : HasIO io => String -> String -> io ()
injectStyle id css = primIO $ prim__injectStyle id css
