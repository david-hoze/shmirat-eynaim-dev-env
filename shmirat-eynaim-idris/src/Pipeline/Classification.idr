-- Pipeline.Classification — Native Rx multi-source classification pipeline
--
-- Uses the native Rx library (Rx.*) — no RxJS dependency.
-- The Temperature phantom type tracks Cold vs Hot observables.
--
--   1. Type-safe Observable composition (Cold/Hot distinction)
--   2. ImageRef (URL captured at discovery, never re-read from DOM)
--   3. Pure priority resolution (no IO in the decision logic)

module Pipeline.Classification

import FFI.Core
import Rx.Core
import Rx.Observable
import Rx.Subject
import Rx.Operators
import FFI.Network
import FFI.ML.FaceApi
import FFI.ML.CocoSsd
import Data.String
import Extension.Types
import Pipeline.Priority

---------------------------------------------------------------------------
-- Classification source: Cache
---------------------------------------------------------------------------

||| Check local cache for a previously classified URL.
||| Returns immediately if found, EMPTY if not.
||| Returns Cold — each subscriber triggers a fresh cache lookup.
export
cacheSource : HasIO io
  => (ImageUrl -> IO (Maybe ClassificationResult))
  -> ImageUrl
  -> io (Observable Cold PrioritizedResult)
cacheSource lookupCache url = do
  obs <- defer $ do
    result <- lookupCache url
    case result of
      Nothing => empty
      Just r  => ofValue $ MkPResult r PCache 0 0
  pure obs

---------------------------------------------------------------------------
-- Classification source: Local ML
---------------------------------------------------------------------------

||| Run face-api.js + COCO-SSD inference on an image.
||| Returns a PrioritizedResult with ML priority.
export
mlSource : HasIO io
  => (DataUrl -> IO (Promise (JsArray FaceDetection)))
  -> (DataUrl -> IO (Promise (JsArray Detection)))
  -> DataUrl
  -> io (Observable Cold PrioritizedResult)
mlSource detectFacesFn detectPersonsFn dataUrl = do
  obs <- defer $ do
    facesPromise <- detectFacesFn dataUrl
    faceObs <- fromPromise facesPromise

    resultObs <- mergeMapObs (\faces => do
      len <- arrayLength faces
      genderPairs <- extractGenders faces 0 len []

      personsPromise <- detectPersonsFn dataUrl
      personObs <- fromPromise personsPromise
      mergeMapObs (\persons => do
        personList <- filterPersons persons
        let personCount = length personList
        let faceCount   = length genderPairs
        let result = combineDetections genderPairs personCount
        ofValue $ MkPResult result PML faceCount personCount
        ) personObs
      ) faceObs

    catchErrorObs (\err => do
      seError $ "ML error: " ++ err
      ofValue $ MkPResult (Block ErrorBlock) PML 0 0
      ) resultObs
  pure obs
  where
    extractGenders : JsArray FaceDetection -> Int32 -> Int32
      -> List (String, Double) -> IO (List (String, Double))
    extractGenders dets i n acc =
      if i >= n then pure (reverse acc)
      else do
        det <- arrayGet dets i
        g <- gender det
        gp <- genderProbability det
        extractGenders dets (i + 1) n ((g, gp) :: acc)

---------------------------------------------------------------------------
-- Classification source: Haiku (Cloud API)
---------------------------------------------------------------------------

||| Send image to Claude Haiku for classification.
export
haikuSource : HasIO io
  => (DataUrl -> IO (Promise String))
  -> DataUrl
  -> io (Observable Cold PrioritizedResult)
haikuSource classifyFn dataUrl = do
  obs <- defer $ do
    promise <- classifyFn dataUrl
    respObs <- fromPromise promise

    resultObs <- mapObs (\answer =>
      let containsWomen = answer == "YES" || isPrefixOf "YES" answer
          result = if containsWomen
                     then Block CloudBlock
                     else Safe CloudSafe
      in MkPResult result PHaiku 0 0
      ) respObs

    catchErrorObs (\err => do
      seWarn $ "Haiku error: " ++ err
      Rx.Observable.empty
      ) resultObs
  pure obs

---------------------------------------------------------------------------
-- Classification source: Shared Server
---------------------------------------------------------------------------

||| Look up classification from shared server.
export
serverSource : HasIO io
  => (ImageUrl -> IO (Promise JsValue))
  -> ImageUrl
  -> io (Observable Cold PrioritizedResult)
serverSource lookupFn url = do
  obs <- defer $ do
    promise <- lookupFn url
    respObs <- fromPromise promise

    resultObs <- mergeMapObs (\jsVal => do
      nullish <- isNullish jsVal
      if nullish
        then Rx.Observable.empty
        else do
          ofValue $ MkPResult (Block ServerBlock) PServer 0 0
      ) respObs

    catchErrorObs (\_ => Rx.Observable.empty) resultObs
  pure obs

---------------------------------------------------------------------------
-- Full pipeline: merge all sources with priority resolution
---------------------------------------------------------------------------

||| Create the full classification pipeline for an image.
||| Merges cache, ML, server, and Haiku sources into a Hot shared observable.
|||
||| Type safety: each source is Cold (per-subscriber), merge produces Cold,
||| share converts to Hot (multicast). The type tracks this progression.
export
createPipeline : HasIO io
  => Observable Cold PrioritizedResult   -- cache source
  -> Observable Cold PrioritizedResult   -- ML source
  -> Observable Cold PrioritizedResult   -- server source
  -> Observable Cold PrioritizedResult   -- Haiku source
  -> io (Observable Hot PrioritizedResult)
createPipeline cacheObs mlObs serverObs haikuObs = do
  merged <- merge4 cacheObs mlObs serverObs haikuObs
  share merged

---------------------------------------------------------------------------
-- Classifying an image (main entry point)
---------------------------------------------------------------------------

||| Classify an image using the full multi-source pipeline.
||| Returns a Promise of the first result.
export
classifyImage : HasIO io
  => ImageRef
  -> (ImageUrl -> IO (Maybe ClassificationResult))
  -> (DataUrl -> IO (Promise (JsArray FaceDetection)))
  -> (DataUrl -> IO (Promise (JsArray Detection)))
  -> (DataUrl -> IO (Promise String))
  -> (ImageUrl -> IO (Promise JsValue))
  -> io (Promise PrioritizedResult)
classifyImage ref lookupCache detectFacesFn detectPersonsFn haikuFn serverFn = do
  cacheObs  <- cacheSource lookupCache ref.url
  serverObs <- serverSource serverFn ref.url

  mlObs <- case ref.dataUrl of
    Nothing => Rx.Observable.empty
    Just du => mlSource detectFacesFn detectPersonsFn du

  haikuObs <- case ref.dataUrl of
    Nothing => Rx.Observable.empty
    Just du => haikuSource haikuFn du

  pipeline <- createPipeline cacheObs mlObs serverObs haikuObs

  withDefault <- defaultIfEmpty
    (MkPResult (Block NoSources) PCache 0 0)
    pipeline

  firstValueFrom withDefault
