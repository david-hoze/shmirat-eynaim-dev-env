-- ML.Detection — ML inference orchestration
--
-- Coordinates face-api.js and COCO-SSD detection in the background context.
-- All ML operations happen here — content script never touches ML.

module ML.Detection

import FFI.Core
import FFI.ML.FaceApi
import FFI.ML.CocoSsd
import FFI.DOM.Canvas
import FFI.Browser.Runtime
import Extension.Types
import Pipeline.Priority

---------------------------------------------------------------------------
-- Model state
---------------------------------------------------------------------------

-- Models are loaded once at startup and stored in JS globals.
-- We track readiness via a ReplaySubject in the background module.

---------------------------------------------------------------------------
-- Image preprocessing
---------------------------------------------------------------------------

||| Convert a data URL to ImageData for tensor creation.
||| Resizes to maxDim (default 416) to match face-api input size.
export
dataUrlToImageData : HasIO io => DataUrl -> Int32 -> io (Promise ImageData)
dataUrlToImageData dataUrl maxDim = primIO $ prim__dataUrlToImageData dataUrl maxDim
  where
    %foreign "javascript:lambda:(dataUrl, maxDim, w) => { return fetch(dataUrl).then(r => r.blob()).then(b => createImageBitmap(b)).then(bmp => { var wd = bmp.width, ht = bmp.height; if (wd > maxDim || ht > maxDim) { var scale = maxDim / Math.max(wd, ht); wd = Math.round(wd * scale); ht = Math.round(ht * scale); } var canvas = new OffscreenCanvas(wd, ht); var ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, wd, ht); bmp.close(); return ctx.getImageData(0, 0, wd, ht); }); }"
    prim__dataUrlToImageData : DataUrl -> Int32 -> PrimIO (Promise ImageData)

---------------------------------------------------------------------------
-- Full ML inference
---------------------------------------------------------------------------

||| Run the complete ML pipeline on an image data URL.
||| Returns (faces, persons) for the classification decision.
export
runMLInference : HasIO io
  => DataUrl
  -> io (Promise JsValue)  -- Returns {faces: [...], persons: [...]}
runMLInference dataUrl = primIO $ prim__runML dataUrl
  where
    -- This is a composite FFI call that runs the full pipeline in JS
    -- to avoid the overhead of multiple Idris↔JS boundary crossings.
    %foreign "javascript:lambda:(dataUrl, w) => { return fetch(dataUrl).then(r => r.blob()).then(b => createImageBitmap(b)).then(bmp => { var wd = bmp.width, ht = bmp.height; var maxDim = 416; if (wd > maxDim || ht > maxDim) { var scale = maxDim / Math.max(wd, ht); wd = Math.round(wd * scale); ht = Math.round(ht * scale); } var canvas = new OffscreenCanvas(wd, ht); var ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, wd, ht); bmp.close(); var imageData = ctx.getImageData(0, 0, wd, ht); var tensor = faceapi.tf.tensor3d(new Uint8Array(imageData.data.buffer), [ht, wd, 4], 'int32'); var facePromise = faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({inputSize: 416, scoreThreshold: 0.3})).withAgeAndGender(); var personPromise = window.__sePersonDetector ? window.__sePersonDetector.detect(tensor, 20, 0.5) : Promise.resolve([]); return Promise.all([facePromise, personPromise]).then(function(results) { tensor.dispose(); return {faces: results[0], persons: results[1]}; }); }); }"
    prim__runML : DataUrl -> PrimIO (Promise JsValue)

---------------------------------------------------------------------------
-- Image resizing for Haiku API
---------------------------------------------------------------------------

||| Resize an image data URL to max 512px for sending to Haiku.
||| Returns the resized data URL as JPEG (smaller payload).
export
resizeForHaiku : HasIO io => DataUrl -> io (Promise DataUrl)
resizeForHaiku dataUrl = primIO $ prim__resize dataUrl
  where
    %foreign "javascript:lambda:(dataUrl, w) => { return fetch(dataUrl).then(r => r.blob()).then(b => createImageBitmap(b)).then(bmp => { var wd = bmp.width, ht = bmp.height; if (wd <= 512 && ht <= 512) { bmp.close(); return dataUrl; } var scale = 512 / Math.max(wd, ht); wd = Math.round(wd * scale); ht = Math.round(ht * scale); var canvas = new OffscreenCanvas(wd, ht); var ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, wd, ht); bmp.close(); return canvas.convertToBlob({type: 'image/jpeg', quality: 0.8}).then(blob => new Promise(resolve => { var reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); })); }); }"
    prim__resize : DataUrl -> PrimIO (Promise DataUrl)
