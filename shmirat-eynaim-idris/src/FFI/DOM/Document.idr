-- FFI.DOM.Document — document.* API bindings

module FFI.DOM.Document

import FFI.Core
import FFI.DOM.Element

---------------------------------------------------------------------------
-- Document queries
---------------------------------------------------------------------------

%foreign "browser:lambda:(sel, w) => document.querySelectorAll(sel)"
prim__docQueryAll : String -> PrimIO (JsArray RawElement)

%foreign "browser:lambda:(sel, w) => document.querySelector(sel)"
prim__docQuery : String -> PrimIO JsValue

%foreign "browser:lambda:(id, w) => document.getElementById(id)"
prim__getElementById : String -> PrimIO JsValue

export
docQueryAll : HasIO io => String -> io (JsArray RawElement)
docQueryAll sel = primIO $ prim__docQueryAll sel

export
docQuery : HasIO io => String -> io JsValue
docQuery sel = primIO $ prim__docQuery sel

export
getElementById : HasIO io => String -> io JsValue
getElementById id = primIO $ prim__getElementById id

---------------------------------------------------------------------------
-- Document body
---------------------------------------------------------------------------

%foreign "browser:lambda:(w) => document.body"
prim__body : PrimIO RawElement

%foreign "browser:lambda:(w) => document.documentElement"
prim__documentElement : PrimIO RawElement

export
body : HasIO io => io RawElement
body = primIO prim__body

export
documentElement : HasIO io => io RawElement
documentElement = primIO prim__documentElement

---------------------------------------------------------------------------
-- Element creation
---------------------------------------------------------------------------

%foreign "browser:lambda:(tag, w) => document.createElement(tag)"
prim__createElement : String -> PrimIO RawElement

export
createElement : HasIO io => String -> io RawElement
createElement tag = primIO $ prim__createElement tag

---------------------------------------------------------------------------
-- DOM manipulation
---------------------------------------------------------------------------

%foreign "browser:lambda:(parent, child, w) => parent.appendChild(child)"
prim__appendChild : Element s -> Element t -> PrimIO ()

%foreign "browser:lambda:(el, w) => el.remove()"
prim__remove : Element s -> PrimIO ()

%foreign "browser:lambda:(el, prop, val, w) => { el.style.setProperty(prop, val); }"
prim__setStyleProp : Element s -> String -> String -> PrimIO ()

%foreign "browser:lambda:(el, key, val, w) => { el.setAttribute(key, val); }"
prim__setAttribute : Element s -> String -> String -> PrimIO ()

export
appendChild : HasIO io => Element s -> Element t -> io ()
appendChild parent child = primIO $ prim__appendChild parent child

export
remove : HasIO io => Element s -> io ()
remove el = primIO $ prim__remove el

export
setStyleProp : HasIO io => Element s -> String -> String -> io ()
setStyleProp el prop val = primIO $ prim__setStyleProp el prop val

export
setAttribute : HasIO io => Element s -> String -> String -> io ()
setAttribute el key val = primIO $ prim__setAttribute el key val

---------------------------------------------------------------------------
-- Text content
---------------------------------------------------------------------------

%foreign "browser:lambda:(el, text, w) => { el.textContent = text; }"
prim__setTextContent : Element s -> String -> PrimIO ()

%foreign "browser:lambda:(el, w) => el.textContent || ''"
prim__getTextContent : Element s -> PrimIO String

export
setTextContent : HasIO io => Element s -> String -> io ()
setTextContent el text = primIO $ prim__setTextContent el text

export
getTextContent : HasIO io => Element s -> io String
getTextContent el = primIO $ prim__getTextContent el
