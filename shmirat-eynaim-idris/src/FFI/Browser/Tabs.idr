-- FFI.Browser.Tabs — browser.tabs.* API bindings

module FFI.Browser.Tabs

import FFI.Core

export
data Tab : Type where [external]

---------------------------------------------------------------------------
-- Tab queries
---------------------------------------------------------------------------

%foreign "browser:lambda:(w) => browser.tabs.query({active: true, currentWindow: true})"
prim__queryActiveTab : PrimIO (Promise (JsArray Tab))

export
queryActiveTab : HasIO io => io (Promise (JsArray Tab))
queryActiveTab = primIO prim__queryActiveTab

---------------------------------------------------------------------------
-- Tab operations
---------------------------------------------------------------------------

%foreign "browser:lambda:(tabId, msg, w) => browser.tabs.sendMessage(tabId, msg)"
prim__sendMessageToTab : Int32 -> JsValue -> PrimIO (Promise JsValue)

%foreign "browser:lambda:(tabId, w) => browser.tabs.reload(tabId)"
prim__reloadTab : Int32 -> PrimIO (Promise JsValue)

export
sendMessageToTab : HasIO io => Int32 -> JsValue -> io (Promise JsValue)
sendMessageToTab tabId msg = primIO $ prim__sendMessageToTab tabId msg

export
reloadTab : HasIO io => Int32 -> io (Promise JsValue)
reloadTab tabId = primIO $ prim__reloadTab tabId

---------------------------------------------------------------------------
-- Tab accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(tab, w) => tab.id"
prim__tabId : Tab -> PrimIO Int32

%foreign "javascript:lambda:(tab, w) => tab.url || ''"
prim__tabUrl : Tab -> PrimIO String

export
tabId : HasIO io => Tab -> io Int32
tabId t = primIO $ prim__tabId t

export
tabUrl : HasIO io => Tab -> io String
tabUrl t = primIO $ prim__tabUrl t
