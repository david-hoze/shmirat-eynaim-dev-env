-- FFI.Browser.Action — browser.browserAction.* API bindings

module FFI.Browser.Action

import FFI.Core

---------------------------------------------------------------------------
-- Badge
---------------------------------------------------------------------------

%foreign "browser:lambda:(text, w) => browser.browserAction.setBadgeText({text: text})"
prim__setBadgeText : String -> PrimIO ()

%foreign "browser:lambda:(color, w) => browser.browserAction.setBadgeBackgroundColor({color: color})"
prim__setBadgeColor : String -> PrimIO ()

export
setBadgeText : HasIO io => String -> io ()
setBadgeText text = primIO $ prim__setBadgeText text

export
setBadgeColor : HasIO io => String -> io ()
setBadgeColor color = primIO $ prim__setBadgeColor color
