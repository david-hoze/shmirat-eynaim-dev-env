-- FFI.ML.FaceApi — @vladmandic/face-api bindings
--
-- Wraps face detection, gender classification, and face recognition.
-- The ML library runs in the background page context.

module FFI.ML.FaceApi

import FFI.Core

---------------------------------------------------------------------------
-- Types
---------------------------------------------------------------------------

||| A face detection result with age, gender, and optional descriptor.
export
data FaceDetection : Type where [external]

||| TensorFlow.js tensor (3D image tensor).
export
data Tensor3D : Type where [external]

---------------------------------------------------------------------------
-- Backend initialization
---------------------------------------------------------------------------

%foreign "javascript:lambda:(path, w) => faceapi.tf.setWasmPaths(path)"
prim__setWasmPaths : String -> PrimIO ()

%foreign "javascript:lambda:(backend, w) => faceapi.tf.setBackend(backend)"
prim__setBackend : String -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(w) => faceapi.tf.ready()"
prim__tfReady : PrimIO (Promise JsValue)

%foreign "javascript:lambda:(w) => faceapi.tf.getBackend()"
prim__getBackend : PrimIO String

export
setWasmPaths : HasIO io => String -> io ()
setWasmPaths path = primIO $ prim__setWasmPaths path

export
setBackend : HasIO io => String -> io (Promise JsValue)
setBackend backend = primIO $ prim__setBackend backend

export
tfReady : HasIO io => io (Promise JsValue)
tfReady = primIO prim__tfReady

export
getBackend : HasIO io => io String
getBackend = primIO prim__getBackend

---------------------------------------------------------------------------
-- Model loading
---------------------------------------------------------------------------

%foreign "javascript:lambda:(path, w) => faceapi.nets.tinyFaceDetector.loadFromUri(path)"
prim__loadTinyFaceDetector : String -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(path, w) => faceapi.nets.ageGenderNet.loadFromUri(path)"
prim__loadAgeGenderNet : String -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(path, w) => faceapi.nets.faceLandmark68TinyNet.loadFromUri(path)"
prim__loadLandmarkNet : String -> PrimIO (Promise JsValue)

%foreign "javascript:lambda:(path, w) => faceapi.nets.faceRecognitionNet.loadFromUri(path)"
prim__loadRecognitionNet : String -> PrimIO (Promise JsValue)

export
loadTinyFaceDetector : HasIO io => String -> io (Promise JsValue)
loadTinyFaceDetector path = primIO $ prim__loadTinyFaceDetector path

export
loadAgeGenderNet : HasIO io => String -> io (Promise JsValue)
loadAgeGenderNet path = primIO $ prim__loadAgeGenderNet path

export
loadLandmarkNet : HasIO io => String -> io (Promise JsValue)
loadLandmarkNet path = primIO $ prim__loadLandmarkNet path

export
loadRecognitionNet : HasIO io => String -> io (Promise JsValue)
loadRecognitionNet path = primIO $ prim__loadRecognitionNet path

---------------------------------------------------------------------------
-- Face detection
---------------------------------------------------------------------------

-- | Run face detection with age/gender classification.
-- Returns a JS array of detection results.
%foreign "javascript:lambda:(tensor, w) => faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({inputSize: 416, scoreThreshold: 0.3})).withAgeAndGender()"
prim__detectFaces : JsValue -> PrimIO (Promise (JsArray FaceDetection))

-- | Run full pipeline: detection + landmarks + descriptors + age/gender.
%foreign "javascript:lambda:(tensor, w) => faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({inputSize: 416, scoreThreshold: 0.3})).withFaceLandmarks(true).withFaceDescriptors().withAgeAndGender()"
prim__detectFull : JsValue -> PrimIO (Promise (JsArray FaceDetection))

export
detectFaces : HasIO io => JsValue -> io (Promise (JsArray FaceDetection))
detectFaces tensor = primIO $ prim__detectFaces tensor

export
detectFull : HasIO io => JsValue -> io (Promise (JsArray FaceDetection))
detectFull tensor = primIO $ prim__detectFull tensor

---------------------------------------------------------------------------
-- FaceDetection accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(det, w) => det.gender || 'unknown'"
prim__gender : FaceDetection -> PrimIO String

%foreign "javascript:lambda:(det, w) => det.genderProbability || 0"
prim__genderProbability : FaceDetection -> PrimIO Double

%foreign "javascript:lambda:(det, w) => det.age || 0"
prim__age : FaceDetection -> PrimIO Double

%foreign "javascript:lambda:(det, w) => det.descriptor || null"
prim__descriptor : FaceDetection -> PrimIO JsValue

%foreign "javascript:lambda:(det, w) => det.detection ? det.detection.score : 0"
prim__detectionScore : FaceDetection -> PrimIO Double

export
gender : HasIO io => FaceDetection -> io String
gender det = primIO $ prim__gender det

export
genderProbability : HasIO io => FaceDetection -> io Double
genderProbability det = primIO $ prim__genderProbability det

export
age : HasIO io => FaceDetection -> io Double
age det = primIO $ prim__age det

export
descriptor : HasIO io => FaceDetection -> io JsValue
descriptor det = primIO $ prim__descriptor det

export
detectionScore : HasIO io => FaceDetection -> io Double
detectionScore det = primIO $ prim__detectionScore det

---------------------------------------------------------------------------
-- Tensor management
---------------------------------------------------------------------------

%foreign "javascript:lambda:(data, h, w, ch, dtype, world) => faceapi.tf.tensor3d(data, [h, w, ch], dtype)"
prim__tensor3d : JsValue -> Int32 -> Int32 -> Int32 -> String -> PrimIO Tensor3D

%foreign "javascript:lambda:(tensor, world) => tensor.dispose()"
prim__disposeTensor : JsValue -> PrimIO ()

export
disposeTensor : HasIO io => JsValue -> io ()
disposeTensor t = primIO $ prim__disposeTensor t
