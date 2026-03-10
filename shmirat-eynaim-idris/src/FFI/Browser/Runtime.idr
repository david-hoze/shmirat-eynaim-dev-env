-- FFI.Browser.Runtime — browser.runtime.* API bindings

module FFI.Browser.Runtime

import FFI.Core

-- | A message sent between extension contexts.
-- Opaque on the Idris side; structured as {type: String, ...payload} in JS.
export
data RuntimeMessage : Type where [external]

-- | A MessageSender object.
export
data MessageSender : Type where [external]

---------------------------------------------------------------------------
-- Sending messages
---------------------------------------------------------------------------

%foreign "browser:lambda:(msg, w) => browser.runtime.sendMessage(msg)"
prim__sendMessage : RuntimeMessage -> PrimIO (Promise JsValue)

export
sendMessage : HasIO io => RuntimeMessage -> io (Promise JsValue)
sendMessage msg = primIO $ prim__sendMessage msg

---------------------------------------------------------------------------
-- Receiving messages
---------------------------------------------------------------------------

-- | The handler receives (message, sender) and must return a PrimIO response.
-- In JS: browser.runtime.onMessage.addListener((msg, sender) => { ... return Promise })
%foreign "browser:lambda:(handler, w) => browser.runtime.onMessage.addListener((msg, sender) => { var p = new Promise((resolve) => { handler(msg)(sender)(v => { resolve(v); return w; })(w); }); return p; })"
prim__onMessage : (RuntimeMessage -> MessageSender -> (JsValue -> PrimIO ()) -> PrimIO ()) -> PrimIO ()

export
onMessage : HasIO io
  => (RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO ())
  -> io ()
onMessage handler = primIO $ prim__onMessage
  (\msg, sender, respond => toPrim $ handler msg sender (\v => primIO $ respond v))

---------------------------------------------------------------------------
-- Building messages
---------------------------------------------------------------------------

%foreign "javascript:lambda:(type, w) => ({type: type})"
prim__mkMessage : String -> PrimIO RuntimeMessage

%foreign "javascript:lambda:(msg, key, val, w) => { msg[key] = val; return msg; }"
prim__msgSet : RuntimeMessage -> String -> JsValue -> PrimIO RuntimeMessage

%foreign "javascript:lambda:(msg, w) => msg.type"
prim__msgType : RuntimeMessage -> PrimIO String

%foreign "javascript:lambda:(msg, key, w) => msg[key]"
prim__msgGet : RuntimeMessage -> String -> PrimIO JsValue

export
mkMessage : HasIO io => String -> io RuntimeMessage
mkMessage t = primIO $ prim__mkMessage t

export
msgSet : HasIO io => RuntimeMessage -> String -> JsValue -> io RuntimeMessage
msgSet msg k v = primIO $ prim__msgSet msg k v

export
msgType : HasIO io => RuntimeMessage -> io String
msgType msg = primIO $ prim__msgType msg

export
msgGet : HasIO io => RuntimeMessage -> String -> io JsValue
msgGet msg k = primIO $ prim__msgGet msg k

---------------------------------------------------------------------------
-- Extension URLs
---------------------------------------------------------------------------

%foreign "browser:lambda:(path, w) => browser.runtime.getURL(path)"
prim__getURL : String -> PrimIO String

export
getURL : HasIO io => String -> io String
getURL path = primIO $ prim__getURL path

---------------------------------------------------------------------------
-- Sender accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(sender, w) => sender.tab ? sender.tab.id : -1"
prim__senderTabId : MessageSender -> PrimIO Int32

%foreign "javascript:lambda:(sender, w) => sender.tab ? sender.tab.url : ''"
prim__senderTabUrl : MessageSender -> PrimIO String

export
senderTabId : HasIO io => MessageSender -> io Int32
senderTabId s = primIO $ prim__senderTabId s

export
senderTabUrl : HasIO io => MessageSender -> io String
senderTabUrl s = primIO $ prim__senderTabUrl s
