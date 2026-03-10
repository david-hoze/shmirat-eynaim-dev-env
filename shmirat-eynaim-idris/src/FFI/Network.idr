-- FFI.Network — fetch() and Anthropic API bindings

module FFI.Network

import FFI.Core

---------------------------------------------------------------------------
-- Fetch
---------------------------------------------------------------------------

export
data Response : Type where [external]

%foreign "javascript:lambda:(url, w) => fetch(url)"
prim__fetchGet : String -> PrimIO (Promise Response)

%foreign "javascript:lambda:(url, opts, w) => fetch(url, opts)"
prim__fetchWithOpts : String -> JsObject -> PrimIO (Promise Response)

%foreign "javascript:lambda:(resp, w) => resp.ok"
prim__responseOk : Response -> PrimIO Bool

%foreign "javascript:lambda:(resp, w) => resp.status"
prim__responseStatus : Response -> PrimIO Int32

%foreign "javascript:lambda:(resp, w) => resp.json()"
prim__responseJson : Response -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(resp, w) => resp.blob()"
prim__responseBlob : Response -> PrimIO (Promise Blob)

%foreign "javascript:lambda:(resp, w) => resp.text()"
prim__responseText : Response -> PrimIO (Promise String)

export
fetchGet : HasIO io => String -> io (Promise Response)
fetchGet url = primIO $ prim__fetchGet url

export
fetchWithOpts : HasIO io => String -> JsObject -> io (Promise Response)
fetchWithOpts url opts = primIO $ prim__fetchWithOpts url opts

export
responseOk : HasIO io => Response -> io Bool
responseOk resp = primIO $ prim__responseOk resp

export
responseStatus : HasIO io => Response -> io Int32
responseStatus resp = primIO $ prim__responseStatus resp

export
responseJson : HasIO io => Response -> io (Promise JsValue)
responseJson resp = primIO $ prim__responseJson resp

export
responseBlob : HasIO io => Response -> io (Promise Blob)
responseBlob resp = primIO $ prim__responseBlob resp

export
responseText : HasIO io => Response -> io (Promise String)
responseText resp = primIO $ prim__responseText resp

---------------------------------------------------------------------------
-- POST request helper
---------------------------------------------------------------------------

-- | Build a POST request with JSON body and optional auth header.
%foreign "javascript:lambda:(url, body, token, w) => fetch(url, {method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, token ? {'Authorization': 'Bearer ' + token} : {}), body: body, signal: AbortSignal.timeout(5000)})"
prim__postJson : String -> String -> String -> PrimIO (Promise Response)

export
postJson : HasIO io => String -> String -> Maybe String -> io (Promise Response)
postJson url body Nothing  = primIO $ prim__postJson url body ""
postJson url body (Just t) = primIO $ prim__postJson url body t

---------------------------------------------------------------------------
-- Anthropic API (Claude Haiku)
---------------------------------------------------------------------------

-- | Send an image to Claude Haiku for classification.
-- Returns the raw text response ("YES" or "NO").
%foreign "javascript:lambda:(apiKey, mediaType, base64Data, w) => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }, { type: 'text', text: 'Does this image contain a woman or girl? Answer with exactly one word: YES or NO.' }] }] }) }).then(r => r.json()).then(d => d.content && d.content[0] ? d.content[0].text.trim().toUpperCase() : 'ERROR')"
prim__classifyWithHaiku : String -> String -> String -> PrimIO (Promise String)

export
classifyWithHaiku : HasIO io => String -> String -> String -> io (Promise String)
classifyWithHaiku apiKey mediaType base64Data =
  primIO $ prim__classifyWithHaiku apiKey mediaType base64Data
