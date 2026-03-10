-- FFI.Core — Foundation types for JavaScript interop.
-- All JS values flow through these opaque wrappers.

module FFI.Core

import Data.Buffer

-- | Opaque JS value. Use when the concrete type doesn't matter.
export
data JsValue : Type where [external]

-- | A JS Promise wrapping a value of type `a`.
export
data Promise : Type -> Type where [external]

-- | A JS Array of `a`.
export
data JsArray : Type -> Type where [external]

-- | A JS Map (string-keyed for extension storage).
export
data JsObject : Type where [external]

-- | Typed wrapper for Float32Array (face descriptors are 128-element vectors).
export
data Float32Array : Type where [external]

-- | Typed wrapper for Uint8Array.
export
data Uint8Array : Type where [external]

-- | An ImageData from a canvas context.
export
data ImageData : Type where [external]

-- | A Blob.
export
data Blob : Type where [external]

-- | An ImageBitmap.
export
data ImageBitmap : Type where [external]

-- | A data URL string (base64-encoded image).
public export
DataUrl : Type
DataUrl = String

-- | An image source URL.
public export
ImageUrl : Type
ImageUrl = String

---------------------------------------------------------------------------
-- JS null/undefined handling
---------------------------------------------------------------------------

%foreign "javascript:lambda: () => null"
prim__null : PrimIO JsValue

%foreign "javascript:lambda: x => x === null || x === undefined"
prim__isNullish : JsValue -> PrimIO Bool

export
jsNull : HasIO io => io JsValue
jsNull = primIO prim__null

export
isNullish : HasIO io => JsValue -> io Bool
isNullish v = primIO $ prim__isNullish v

---------------------------------------------------------------------------
-- Promise handling (no async/await in Idris — use then-chains)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(p, onOk, onErr, w) => p.then(x => onOk(x)(w), e => onErr(String(e))(w))"
prim__thenPromise : Promise a -> (a -> PrimIO b) -> (String -> PrimIO b) -> PrimIO (Promise b)

export
thenPromise : HasIO io => Promise a -> (a -> IO b) -> (String -> IO b) -> io (Promise b)
thenPromise p onOk onErr =
  primIO $ prim__thenPromise p (\x => toPrim $ onOk x) (\e => toPrim $ onErr e)

%foreign "javascript:lambda:(x, w) => Promise.resolve(x)"
prim__resolve : a -> PrimIO (Promise a)

export
resolvePromise : HasIO io => a -> io (Promise a)
resolvePromise x = primIO $ prim__resolve x

%foreign "javascript:lambda:(p1, p2, w) => Promise.all([p1, p2])"
prim__promiseAll2 : Promise a -> Promise b -> PrimIO (Promise JsValue)

---------------------------------------------------------------------------
-- Console
---------------------------------------------------------------------------

%foreign "javascript:lambda:(tag, msg, w) => console.log(tag, msg)"
prim__consoleLog : String -> String -> PrimIO ()

%foreign "javascript:lambda:(tag, msg, w) => console.warn(tag, msg)"
prim__consoleWarn : String -> String -> PrimIO ()

%foreign "javascript:lambda:(tag, msg, w) => console.error(tag, msg)"
prim__consoleError : String -> String -> PrimIO ()

export
seLog : HasIO io => String -> io ()
seLog msg = primIO $ prim__consoleLog "[Shmirat Eynaim]" msg

export
seWarn : HasIO io => String -> io ()
seWarn msg = primIO $ prim__consoleWarn "[Shmirat Eynaim]" msg

export
seError : HasIO io => String -> io ()
seError msg = primIO $ prim__consoleError "[Shmirat Eynaim]" msg

---------------------------------------------------------------------------
-- JSON
---------------------------------------------------------------------------

%foreign "javascript:lambda:(s, w) => JSON.parse(s)"
prim__jsonParse : String -> PrimIO JsValue

%foreign "javascript:lambda:(v, w) => JSON.stringify(v)"
prim__jsonStringify : JsValue -> PrimIO String

export
jsonParse : HasIO io => String -> io JsValue
jsonParse s = primIO $ prim__jsonParse s

export
jsonStringify : HasIO io => JsValue -> io String
jsonStringify v = primIO $ prim__jsonStringify v

---------------------------------------------------------------------------
-- Timers
---------------------------------------------------------------------------

%foreign "javascript:lambda:(ms, cb, w) => setTimeout(() => cb()(w), ms)"
prim__setTimeout : Int32 -> PrimIO () -> PrimIO Int32

%foreign "javascript:lambda:(id, w) => clearTimeout(id)"
prim__clearTimeout : Int32 -> PrimIO ()

export
setTimeout : HasIO io => Int32 -> IO () -> io Int32
setTimeout ms cb = primIO $ prim__setTimeout ms (toPrim cb)

export
clearTimeout : HasIO io => Int32 -> io ()
clearTimeout id = primIO $ prim__clearTimeout id

---------------------------------------------------------------------------
-- Crypto
---------------------------------------------------------------------------

%foreign "javascript:lambda:(alg, data, w) => crypto.subtle.digest(alg, data)"
prim__cryptoDigest : String -> Uint8Array -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(n, w) => { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }"
prim__randomBytes : Int32 -> PrimIO Uint8Array

export
randomBytes : HasIO io => Int32 -> io Uint8Array
randomBytes n = primIO $ prim__randomBytes n

---------------------------------------------------------------------------
-- Float32Array operations (for face descriptors)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(a, i, w) => a[i]"
prim__f32Get : Float32Array -> Int32 -> PrimIO Double

%foreign "javascript:lambda:(a, w) => a.length"
prim__f32Length : Float32Array -> PrimIO Int32

export
f32Get : HasIO io => Float32Array -> Int32 -> io Double
f32Get a i = primIO $ prim__f32Get a i

export
f32Length : HasIO io => Float32Array -> io Int32
f32Length a = primIO $ prim__f32Length a

---------------------------------------------------------------------------
-- JsArray operations
---------------------------------------------------------------------------

%foreign "javascript:lambda:(a, w) => a.length"
prim__arrayLength : JsArray a -> PrimIO Int32

%foreign "javascript:lambda:(a, i, w) => a[i]"
prim__arrayGet : JsArray a -> Int32 -> PrimIO a

%foreign "javascript:lambda:(a, x, w) => { a.push(x); return a; }"
prim__arrayPush : JsArray a -> a -> PrimIO (JsArray a)

%foreign "javascript:lambda:(w) => []"
prim__newArray : PrimIO (JsArray a)

export
arrayLength : HasIO io => JsArray a -> io Int32
arrayLength a = primIO $ prim__arrayLength a

export
arrayGet : HasIO io => JsArray a -> Int32 -> io a
arrayGet a i = primIO $ prim__arrayGet a i

export
arrayPush : HasIO io => JsArray a -> a -> io (JsArray a)
arrayPush a x = primIO $ prim__arrayPush a x

export
newArray : HasIO io => io (JsArray a)
newArray = primIO prim__newArray

---------------------------------------------------------------------------
-- JsObject property access
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => ({})"
prim__newObject : PrimIO JsObject

%foreign "javascript:lambda:(o, k, w) => o[k]"
prim__objGet : JsObject -> String -> PrimIO JsValue

%foreign "javascript:lambda:(o, k, v, w) => { o[k] = v; return o; }"
prim__objSet : JsObject -> String -> JsValue -> PrimIO JsObject

export
newObject : HasIO io => io JsObject
newObject = primIO prim__newObject

export
objGet : HasIO io => JsObject -> String -> io JsValue
objGet o k = primIO $ prim__objGet o k

export
objSet : HasIO io => JsObject -> String -> JsValue -> io JsObject
objSet o k v = primIO $ prim__objSet o k v
