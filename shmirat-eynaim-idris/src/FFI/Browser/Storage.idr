-- FFI.Browser.Storage — browser.storage.local.* API bindings

module FFI.Browser.Storage

import FFI.Core

---------------------------------------------------------------------------
-- Storage get/set
---------------------------------------------------------------------------

%foreign "browser:lambda:(keys, w) => browser.storage.local.get(JSON.parse(keys))"
prim__storageGet : String -> PrimIO (Promise JsObject)

%foreign "browser:lambda:(obj, w) => browser.storage.local.set(obj)"
prim__storageSet : JsObject -> PrimIO (Promise JsValue)

-- | Get values from storage. Pass a JSON-encoded array of key names.
export
storageGet : HasIO io => List String -> io (Promise JsObject)
storageGet keys =
  let keysJson = "[" ++ joinBy "," (map (\k => "\"" ++ k ++ "\"") keys) ++ "]"
  in primIO $ prim__storageGet keysJson
  where
    joinBy : String -> List String -> String
    joinBy _ [] = ""
    joinBy _ [x] = x
    joinBy sep (x :: xs) = x ++ sep ++ joinBy sep xs

-- | Set values in storage.
export
storageSet : HasIO io => JsObject -> io (Promise JsValue)
storageSet obj = primIO $ prim__storageSet obj
