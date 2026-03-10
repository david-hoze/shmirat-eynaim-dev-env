-- FFI.ML.CocoSsd — COCO-SSD person detection bindings

module FFI.ML.CocoSsd

import FFI.Core

---------------------------------------------------------------------------
-- Types
---------------------------------------------------------------------------

||| A COCO-SSD object detection model.
export
data PersonDetector : Type where [external]

||| A single detection result: {class, score, bbox}.
export
data Detection : Type where [external]

---------------------------------------------------------------------------
-- Model loading
---------------------------------------------------------------------------

%foreign "javascript:lambda:(modelUrl, w) => cocoSsd.load({base: 'lite_mobilenet_v2', modelUrl: modelUrl})"
prim__loadCocoSsd : String -> PrimIO (Promise PersonDetector)

export
loadCocoSsd : HasIO io => String -> io (Promise PersonDetector)
loadCocoSsd modelUrl = primIO $ prim__loadCocoSsd modelUrl

---------------------------------------------------------------------------
-- Detection
---------------------------------------------------------------------------

%foreign "javascript:lambda:(model, tensor, maxDets, threshold, w) => model.detect(tensor, maxDets, threshold)"
prim__detect : PersonDetector -> JsValue -> Int32 -> Double -> PrimIO (Promise (JsArray Detection))

export
detect : HasIO io => PersonDetector -> JsValue -> io (Promise (JsArray Detection))
detect model tensor = primIO $ prim__detect model tensor 20 0.5

---------------------------------------------------------------------------
-- Detection accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(det, w) => det.class"
prim__detClass : Detection -> PrimIO String

%foreign "javascript:lambda:(det, w) => det.score"
prim__detScore : Detection -> PrimIO Double

%foreign "javascript:lambda:(det, w) => det.bbox[2]"
prim__detWidth : Detection -> PrimIO Double

%foreign "javascript:lambda:(det, w) => det.bbox[3]"
prim__detHeight : Detection -> PrimIO Double

export
detClass : HasIO io => Detection -> io String
detClass det = primIO $ prim__detClass det

export
detScore : HasIO io => Detection -> io Double
detScore det = primIO $ prim__detScore det

export
detWidth : HasIO io => Detection -> io Double
detWidth det = primIO $ prim__detWidth det

export
detHeight : HasIO io => Detection -> io Double
detHeight det = primIO $ prim__detHeight det

||| Filter detections to only "person" class with sufficient size.
export
filterPersons : HasIO io => JsArray Detection -> io (List (Double, Double, Double))
filterPersons dets = do
  len <- arrayLength dets
  go 0 len []
  where
    go : Int32 -> Int32 -> List (Double, Double, Double) -> io (List (Double, Double, Double))
    go i n acc =
      if i >= n then pure (reverse acc)
      else do
        det <- arrayGet dets i
        cls <- detClass det
        score <- detScore det
        w <- detWidth det
        h <- detHeight det
        if cls == "person" && score > 0.5 && w > 60.0 && h > 60.0
          then go (i + 1) n ((score, w, h) :: acc)
          else go (i + 1) n acc
