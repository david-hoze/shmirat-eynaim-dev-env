-- Extension.State — Pure background state and message handler logic
--
-- All state transitions are pure functions: BgState -> BgState
-- No IO, no FFI, no browser APIs. Fully testable.

module Extension.State

import Data.List
import Data.Maybe
import ML.Learning

---------------------------------------------------------------------------
-- Constants
---------------------------------------------------------------------------

public export
maxKnownFaces : Nat
maxKnownFaces = 1000

public export
maxTrainingData : Nat
maxTrainingData = 500

---------------------------------------------------------------------------
-- Data types
---------------------------------------------------------------------------

||| A stored face entry (for KNN matching database).
public export
record FaceEntry where
  constructor MkFaceEntry
  descriptor : List Double
  url        : String
  timestamp  : Nat

public export
Eq FaceEntry where
  a == b = a.descriptor == b.descriptor
        && a.url == b.url
        && a.timestamp == b.timestamp

public export
Show FaceEntry where
  show f = "FaceEntry(" ++ f.url ++ ")"

||| A training data entry (for logistic regression).
public export
record TrainingEntry where
  constructor MkTrainingEntry
  descriptor : List Double
  label      : Int  -- 1 = block, 0 = safe

public export
Eq TrainingEntry where
  a == b = a.descriptor == b.descriptor && a.label == b.label

public export
Show TrainingEntry where
  show t = "TrainingEntry(label=" ++ show t.label ++ ")"

||| A cloud cache entry.
public export
record CloudCacheEntry where
  constructor MkCloudCacheEntry
  containsWomen : Bool
  timestamp     : Nat

---------------------------------------------------------------------------
-- Background state (pure, no IO)
---------------------------------------------------------------------------

public export
record BgState where
  constructor MkBgState
  blockingEnabled    : Bool
  whitelist          : List String
  manualBlocklist    : List String
  manualSafelist     : List String
  knownFaces         : List FaceEntry
  knownSafeFaces     : List FaceEntry
  trainingData       : List TrainingEntry
  classifierWeights  : Maybe ClassifierWeights
  cloudCache         : List (String, CloudCacheEntry)
  cloudCallsToday    : Nat
  cloudCallsDate     : String
  cloudSavedCount    : Nat
  anthropicApiKey    : String
  cloudMode          : String   -- "all" | "uncertain" | "never"
  serverEnabled      : Bool
  debugTiming        : Bool

||| Initial empty state.
public export
initBgState : BgState
initBgState = MkBgState
  True [] [] [] [] [] [] Nothing [] 0 "" 0 "" "all" True False

---------------------------------------------------------------------------
-- Utilities
---------------------------------------------------------------------------

takeLast : Nat -> List a -> List a
takeLast n xs =
  let l = length xs
  in if l <= n then xs else drop (minus l n) xs

lookupAssoc : String -> List (String, a) -> Maybe a
lookupAssoc _ [] = Nothing
lookupAssoc key ((k, v) :: rest) =
  if k == key then Just v else lookupAssoc key rest

insertAssoc : String -> a -> List (String, a) -> List (String, a)
insertAssoc key val xs = (key, val) :: filter (\p => fst p /= key) xs

---------------------------------------------------------------------------
-- Response types
---------------------------------------------------------------------------

public export
record CloudStats where
  constructor MkCloudStats
  cloudMode       : String
  hasApiKey        : Bool
  cloudCallsToday : Nat
  cloudSavedCount : Nat
  cloudCacheSize  : Nat

public export
record LearningStats where
  constructor MkLearningStats
  knownFacesCount     : Nat
  knownSafeFacesCount : Nat
  trainingDataCount   : Nat
  classifierTrained   : Bool

public export
record LearningExport where
  constructor MkLearningExport
  knownFaces        : List FaceEntry
  knownSafeFaces    : List FaceEntry
  manualBlocklist   : List String
  manualSafelist    : List String
  trainingData      : List TrainingEntry
  classifierWeights : Maybe ClassifierWeights

---------------------------------------------------------------------------
-- Query handlers (state -> response, no mutation)
---------------------------------------------------------------------------

public export
getCloudStats : BgState -> CloudStats
getCloudStats s = MkCloudStats
  s.cloudMode
  (s.anthropicApiKey /= "")
  s.cloudCallsToday
  s.cloudSavedCount
  (length s.cloudCache)

public export
getLearningStats : BgState -> LearningStats
getLearningStats s = MkLearningStats
  (length s.knownFaces)
  (length s.knownSafeFaces)
  (length s.trainingData)
  (isJust s.classifierWeights)

public export
exportLearning : BgState -> LearningExport
exportLearning s = MkLearningExport
  s.knownFaces s.knownSafeFaces
  s.manualBlocklist s.manualSafelist
  s.trainingData s.classifierWeights

||| Look up a URL in the cloud cache.
public export
lookupCloudCache : BgState -> String -> Maybe CloudCacheEntry
lookupCloudCache s url = lookupAssoc url s.cloudCache

---------------------------------------------------------------------------
-- Internal: maybe retrain classifier
---------------------------------------------------------------------------

maybeRetrain : List TrainingEntry -> Maybe ClassifierWeights -> Maybe ClassifierWeights
maybeRetrain td existing =
  if length td >= 10
    then Just (trainClassifier (map (\t => (t.descriptor, t.label == 1)) td) 0.01 100)
    else existing

---------------------------------------------------------------------------
-- Mutation handlers (state -> state)
---------------------------------------------------------------------------

public export
setApiKey : BgState -> String -> BgState
setApiKey s key = { anthropicApiKey := key } s

public export
setCloudModeH : BgState -> String -> BgState
setCloudModeH s mode = { cloudMode := mode } s

||| Learn that an image contains a woman (block it).
||| Adds descriptors to knownFaces and trainingData (label=1),
||| adds URL to manualBlocklist, removes from manualSafelist,
||| caches as containsWomen=True, and retrains if >= 10 examples.
public export
learnBlock : BgState -> String -> List (List Double) -> Nat -> BgState
learnBlock s url descriptors now =
  let newFaces    = map (\d => MkFaceEntry d url now) descriptors
      faces'      = takeLast maxKnownFaces (s.knownFaces ++ newFaces)
      newTraining = map (\d => MkTrainingEntry d 1) descriptors
      training'   = takeLast maxTrainingData (s.trainingData ++ newTraining)
      blocklist'  = if elem url s.manualBlocklist
                      then s.manualBlocklist
                      else s.manualBlocklist ++ [url]
      safelist'   = filter (/= url) s.manualSafelist
      cache'      = insertAssoc url (MkCloudCacheEntry True now) s.cloudCache
      weights'    = maybeRetrain training' s.classifierWeights
  in { knownFaces := faces'
     , trainingData := training'
     , manualBlocklist := blocklist'
     , manualSafelist := safelist'
     , cloudCache := cache'
     , classifierWeights := weights'
     } s

||| Learn that an image is safe (no women).
||| Adds descriptors to knownSafeFaces and trainingData (label=0),
||| adds URL to manualSafelist, removes from manualBlocklist,
||| caches as containsWomen=False, and retrains if >= 10 examples.
public export
learnSafe : BgState -> String -> List (List Double) -> Nat -> BgState
learnSafe s url descriptors now =
  let newFaces    = map (\d => MkFaceEntry d url now) descriptors
      safeFaces'  = takeLast maxKnownFaces (s.knownSafeFaces ++ newFaces)
      newTraining = map (\d => MkTrainingEntry d 0) descriptors
      training'   = takeLast maxTrainingData (s.trainingData ++ newTraining)
      safelist'   = if elem url s.manualSafelist
                      then s.manualSafelist
                      else s.manualSafelist ++ [url]
      blocklist'  = filter (/= url) s.manualBlocklist
      cache'      = insertAssoc url (MkCloudCacheEntry False now) s.cloudCache
      weights'    = maybeRetrain training' s.classifierWeights
  in { knownSafeFaces := safeFaces'
     , trainingData := training'
     , manualSafelist := safelist'
     , manualBlocklist := blocklist'
     , cloudCache := cache'
     , classifierWeights := weights'
     } s

||| Reset all learning data.
public export
resetLearning : BgState -> BgState
resetLearning s =
  { knownFaces := []
  , knownSafeFaces := []
  , manualBlocklist := []
  , manualSafelist := []
  , trainingData := []
  , classifierWeights := Nothing
  } s

||| Import learning data, merging with existing state.
||| Respects MAX_KNOWN_FACES and MAX_TRAINING_DATA caps.
||| Deduplicates manual blocklist/safelist URLs.
public export
importLearning : BgState -> LearningExport -> BgState
importLearning s imp =
  let faces'     = takeLast maxKnownFaces (s.knownFaces ++ imp.knownFaces)
      safeFaces' = takeLast maxKnownFaces (s.knownSafeFaces ++ imp.knownSafeFaces)
      blocklist' = nub (s.manualBlocklist ++ imp.manualBlocklist)
      safelist'  = nub (s.manualSafelist ++ imp.manualSafelist)
      training'  = takeLast maxTrainingData (s.trainingData ++ imp.trainingData)
      weights'   = case imp.classifierWeights of
                     Just w  => Just w
                     Nothing => s.classifierWeights
      weights''  = maybeRetrain training' weights'
  in { knownFaces := faces'
     , knownSafeFaces := safeFaces'
     , manualBlocklist := blocklist'
     , manualSafelist := safelist'
     , trainingData := training'
     , classifierWeights := weights''
     } s

||| Clear the cloud cache. Returns updated state and count of cleared entries.
public export
clearCloudCache : BgState -> (BgState, Nat)
clearCloudCache s =
  let count = length s.cloudCache
  in ({ cloudCache := [] } s, count)

||| Toggle blocking on/off.
public export
toggle : BgState -> BgState
toggle s = { blockingEnabled := not s.blockingEnabled } s

||| Add a domain to the whitelist.
public export
addWhitelist : BgState -> String -> BgState
addWhitelist s domain =
  if domain == "" || elem domain s.whitelist
    then s
    else { whitelist := s.whitelist ++ [domain] } s

||| Remove a domain from the whitelist.
public export
removeWhitelist : BgState -> String -> BgState
removeWhitelist s domain =
  { whitelist := filter (/= domain) s.whitelist } s
