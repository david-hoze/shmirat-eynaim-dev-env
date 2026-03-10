-- Pipeline.Classification — RxJS-driven multi-source classification pipeline
--
-- Mirrors the JS createClassificationPipeline function, but with:
--   1. Type-safe Observable composition
--   2. ImageRef (URL captured at discovery, never re-read from DOM)
--   3. Pure priority resolution (no IO in the decision logic)

module Pipeline.Classification

import FFI.Core
import FFI.RxJS.Observable
import FFI.RxJS.Subject
import FFI.RxJS.Operators
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
export
cacheSource : HasIO io
  => (ImageUrl -> IO (Maybe ClassificationResult))  -- cache lookup function
  -> ImageUrl
  -> io (Observable PrioritizedResult)
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
  => (DataUrl -> IO (Promise (JsArray FaceDetection)))  -- face detection fn
  -> (DataUrl -> IO (Promise (JsArray Detection)))       -- person detection fn
  -> DataUrl
  -> io (Observable PrioritizedResult)
mlSource detectFacesFn detectPersonsFn dataUrl = do
  obs <- defer $ do
    -- Run face detection and person detection in parallel (via JS Promise.all)
    -- For simplicity in Idris FFI, we run them sequentially here.
    -- In production, wrap both in promises and use Promise.all via FFI.
    facesPromise <- detectFacesFn dataUrl
    faceObs <- fromPromise facesPromise

    -- Process face results and produce classification
    resultObs <- mergeMapObs (\faces => do
      -- Extract gender info from face detections
      len <- arrayLength faces
      genderPairs <- extractGenders faces 0 len []

      -- Run person detection
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

    -- Catch errors → strict mode block
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
  => (DataUrl -> IO (Promise String))  -- rate-limited Haiku call
  -> DataUrl
  -> io (Observable PrioritizedResult)
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
      empty  -- Haiku unavailable → no result (don't block pipeline)
      ) resultObs
  pure obs

---------------------------------------------------------------------------
-- Classification source: Shared Server
---------------------------------------------------------------------------

||| Look up classification from shared server.
export
serverSource : HasIO io
  => (ImageUrl -> IO (Promise JsValue))  -- server lookup fn
  -> ImageUrl
  -> io (Observable PrioritizedResult)
serverSource lookupFn url = do
  obs <- defer $ do
    promise <- lookupFn url
    respObs <- fromPromise promise

    resultObs <- mergeMapObs (\jsVal => do
      nullish <- isNullish jsVal
      if nullish
        then empty  -- No server result
        else do
          -- Parse server response
          -- In practice, check voteBlock/voteSafe counts
          ofValue $ MkPResult (Block ServerBlock) PServer 0 0
      ) respObs

    catchErrorObs (\_ => empty) resultObs
  pure obs

---------------------------------------------------------------------------
-- Full pipeline: merge all sources with priority resolution
---------------------------------------------------------------------------

||| Create the full classification pipeline for an image.
||| Merges cache, ML, server, and Haiku sources.
||| Returns a Subject that emits the best result as sources complete.
|||
||| The pipeline uses strict mode resolution:
|||   - BLOCK wins over SAFE (unless USER says SAFE)
|||   - First result is emitted immediately
|||   - Later sources can escalate (safe → block) but not downgrade
export
createPipeline : HasIO io
  => Observable PrioritizedResult   -- cache source
  -> Observable PrioritizedResult   -- ML source
  -> Observable PrioritizedResult   -- server source
  -> Observable PrioritizedResult   -- Haiku source
  -> io (Observable PrioritizedResult)
createPipeline cacheObs mlObs serverObs haikuObs = do
  -- Merge all sources — they emit independently as they complete
  merged <- merge4 cacheObs mlObs serverObs haikuObs

  -- The priority resolution happens in the subscriber (stateful),
  -- not in the Observable chain (which is stateless).
  -- We use share() so multiple subscribers see the same emissions.
  share merged

---------------------------------------------------------------------------
-- Classifying an image (main entry point)
---------------------------------------------------------------------------

||| Classify an image using the full multi-source pipeline.
||| Returns a Promise of the first result (for the content script).
||| The pipeline continues running after the first result — later sources
||| may trigger overrides via tab messaging.
|||
||| Takes an ImageRef (URL already captured, safe from CSS mutation).
export
classifyImage : HasIO io
  => ImageRef
  -> (ImageUrl -> IO (Maybe ClassificationResult))   -- cache lookup
  -> (DataUrl -> IO (Promise (JsArray FaceDetection))) -- face detect
  -> (DataUrl -> IO (Promise (JsArray Detection)))     -- person detect
  -> (DataUrl -> IO (Promise String))                  -- Haiku classify
  -> (ImageUrl -> IO (Promise JsValue))                -- server lookup
  -> io (Promise PrioritizedResult)
classifyImage ref lookupCache detectFacesFn detectPersonsFn haikuFn serverFn = do
  -- Create sources
  cacheObs  <- cacheSource lookupCache ref.url
  serverObs <- serverSource serverFn ref.url

  -- ML and Haiku need dataUrl — skip if not available
  mlObs <- case ref.dataUrl of
    Nothing => empty
    Just du => mlSource detectFacesFn detectPersonsFn du

  haikuObs <- case ref.dataUrl of
    Nothing => empty
    Just du => haikuSource haikuFn du

  -- Merge into pipeline
  pipeline <- createPipeline cacheObs mlObs serverObs haikuObs

  -- Add strict-mode default (if no source emits, block)
  withDefault <- defaultIfEmpty
    (MkPResult (Block NoSources) PCache 0 0)
    pipeline

  -- Return first result as Promise
  firstValueFrom withDefault
