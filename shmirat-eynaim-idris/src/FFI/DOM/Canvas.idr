-- FFI.DOM.Canvas — OffscreenCanvas and canvas 2D context bindings

module FFI.DOM.Canvas

import FFI.Core

---------------------------------------------------------------------------
-- Canvas types
---------------------------------------------------------------------------

export
data OffscreenCanvas : Type where [external]

export
data CanvasContext2D : Type where [external]

---------------------------------------------------------------------------
-- OffscreenCanvas
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w, h, world) => new OffscreenCanvas(w, h)"
prim__newOffscreenCanvas : Int32 -> Int32 -> PrimIO OffscreenCanvas

%foreign "javascript:lambda:(canvas, world) => canvas.getContext('2d')"
prim__getContext2D : OffscreenCanvas -> PrimIO CanvasContext2D

export
newOffscreenCanvas : HasIO io => Int32 -> Int32 -> io OffscreenCanvas
newOffscreenCanvas w h = primIO $ prim__newOffscreenCanvas w h

export
getContext2D : HasIO io => OffscreenCanvas -> io CanvasContext2D
getContext2D canvas = primIO $ prim__getContext2D canvas

---------------------------------------------------------------------------
-- Drawing
---------------------------------------------------------------------------

%foreign "javascript:lambda:(ctx, img, x, y, w, h, world) => ctx.drawImage(img, x, y, w, h)"
prim__drawImage : CanvasContext2D -> JsValue -> Int32 -> Int32 -> Int32 -> Int32 -> PrimIO ()

%foreign "javascript:lambda:(ctx, x, y, w, h, world) => ctx.getImageData(x, y, w, h)"
prim__getImageData : CanvasContext2D -> Int32 -> Int32 -> Int32 -> Int32 -> PrimIO ImageData

export
drawImage : HasIO io => CanvasContext2D -> JsValue -> Int32 -> Int32 -> Int32 -> Int32 -> io ()
drawImage ctx img x y w h = primIO $ prim__drawImage ctx img x y w h

export
getImageData : HasIO io => CanvasContext2D -> Int32 -> Int32 -> Int32 -> Int32 -> io ImageData
getImageData ctx x y w h = primIO $ prim__getImageData ctx x y w h

---------------------------------------------------------------------------
-- Blob/DataURL conversion
---------------------------------------------------------------------------

%foreign "javascript:lambda:(canvas, type, quality, world) => canvas.convertToBlob({type: type, quality: quality})"
prim__convertToBlob : OffscreenCanvas -> String -> Double -> PrimIO (Promise Blob)

export
convertToBlob : HasIO io => OffscreenCanvas -> String -> Double -> io (Promise Blob)
convertToBlob canvas mimeType quality = primIO $ prim__convertToBlob canvas mimeType quality

---------------------------------------------------------------------------
-- ImageBitmap
---------------------------------------------------------------------------

%foreign "javascript:lambda:(blob, world) => createImageBitmap(blob)"
prim__createImageBitmap : Blob -> PrimIO (Promise ImageBitmap)

%foreign "javascript:lambda:(bmp, world) => bmp.width"
prim__bitmapWidth : ImageBitmap -> PrimIO Int32

%foreign "javascript:lambda:(bmp, world) => bmp.height"
prim__bitmapHeight : ImageBitmap -> PrimIO Int32

%foreign "javascript:lambda:(bmp, world) => bmp.close()"
prim__closeBitmap : ImageBitmap -> PrimIO ()

export
createImageBitmap : HasIO io => Blob -> io (Promise ImageBitmap)
createImageBitmap blob = primIO $ prim__createImageBitmap blob

export
bitmapWidth : HasIO io => ImageBitmap -> io Int32
bitmapWidth bmp = primIO $ prim__bitmapWidth bmp

export
bitmapHeight : HasIO io => ImageBitmap -> io Int32
bitmapHeight bmp = primIO $ prim__bitmapHeight bmp

export
closeBitmap : HasIO io => ImageBitmap -> io ()
closeBitmap bmp = primIO $ prim__closeBitmap bmp

---------------------------------------------------------------------------
-- Tensor creation (for ML inference)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(imageData, world) => { var d = imageData.data; var h = imageData.height; var w = imageData.width; return faceapi.tf.tensor3d(new Uint8Array(d.buffer), [h, w, 4], 'int32'); }"
prim__imageDataToTensor : ImageData -> PrimIO JsValue

export
imageDataToTensor : HasIO io => ImageData -> io JsValue
imageDataToTensor imgData = primIO $ prim__imageDataToTensor imgData
