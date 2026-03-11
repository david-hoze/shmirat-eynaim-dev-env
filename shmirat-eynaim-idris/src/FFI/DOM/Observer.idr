-- FFI.DOM.Observer — MutationObserver bindings

module FFI.DOM.Observer

import FFI.Core
import FFI.DOM.Element

export
data MutationObserver : Type where [external]

export
data MutationRecord : Type where [external]

---------------------------------------------------------------------------
-- Observer creation and control
---------------------------------------------------------------------------

%foreign "browser:lambda:(callback, w) => new MutationObserver((mutations) => callback(mutations)(w))"
prim__newObserver : (JsArray MutationRecord -> PrimIO ()) -> PrimIO MutationObserver

-- | Observe with standard options for image discovery:
-- childList + subtree + attributes on src/style/data-src etc.
%foreign "browser:lambda:(_s, obs, target, w) => obs.observe(target, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'data-lazy', 'style']})"
prim__observe : MutationObserver -> Element s -> PrimIO ()

%foreign "browser:lambda:(obs, w) => obs.disconnect()"
prim__disconnect : MutationObserver -> PrimIO ()

export
newObserver : HasIO io => (JsArray MutationRecord -> IO ()) -> io MutationObserver
newObserver callback = primIO $ prim__newObserver (\mutations => toPrim $ callback mutations)

export
observe : HasIO io => MutationObserver -> Element s -> io ()
observe obs target = primIO $ prim__observe obs target

export
disconnect : HasIO io => MutationObserver -> io ()
disconnect obs = primIO $ prim__disconnect obs

---------------------------------------------------------------------------
-- MutationRecord accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(rec, w) => rec.type"
prim__recordType : MutationRecord -> PrimIO String

%foreign "javascript:lambda:(rec, w) => rec.addedNodes ? Array.from(rec.addedNodes) : []"
prim__addedNodes : MutationRecord -> PrimIO (JsArray RawElement)

%foreign "javascript:lambda:(rec, w) => rec.target"
prim__recordTarget : MutationRecord -> PrimIO RawElement

%foreign "javascript:lambda:(rec, w) => rec.attributeName || ''"
prim__attributeName : MutationRecord -> PrimIO String

export
recordType : HasIO io => MutationRecord -> io String
recordType rec = primIO $ prim__recordType rec

export
addedNodes : HasIO io => MutationRecord -> io (JsArray RawElement)
addedNodes rec = primIO $ prim__addedNodes rec

export
recordTarget : HasIO io => MutationRecord -> io RawElement
recordTarget rec = primIO $ prim__recordTarget rec

export
attributeName : HasIO io => MutationRecord -> io String
attributeName rec = primIO $ prim__attributeName rec
