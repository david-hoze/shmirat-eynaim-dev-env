-- Test.Main — Pure Idris test suite for Shmirat Eynaim
--
-- Tests pure logic: priority resolution, ML learning, state handlers.
-- Compile: idris2 --cg node --source-dir src -o test-runner Test/Main.idr
-- Run:     node build/exec/test-runner

module Test.Main

import Test.Assert
import Extension.State
import Extension.Types
import ML.Learning
import Pipeline.Priority
import Data.List
import Data.Maybe

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------

||| Generate a fake 128-dimensional face descriptor.
||| Same formula as the JS tests: Math.sin(seed * 100 + i) * 0.5
fakeDescriptor : Nat -> List Double
fakeDescriptor seed =
  map (\i => sin (cast seed * 100.0 + cast i) * 0.5) [the Nat 0 .. 127]

---------------------------------------------------------------------------
-- Priority resolution tests
---------------------------------------------------------------------------

testPriority : TestRunner -> IO ()
testPriority t = do
  section "Priority Resolution"

  -- analyzeFaces: no faces = safe
  assert t
    (case analyzeFaces [] of Safe NoFaceNoPerson => True; _ => False)
    "analyzeFaces [] = Safe NoFaceNoPerson"

  -- analyzeFaces: female face = block
  assert t
    (case analyzeFaces [("female", 0.95)] of Block FaceDetected => True; _ => False)
    "analyzeFaces [(female, 0.95)] = Block"

  -- analyzeFaces: confident male = safe
  assert t
    (case analyzeFaces [("male", 0.85)] of Safe MaleOnly => True; _ => False)
    "analyzeFaces [(male, 0.85)] = Safe MaleOnly"

  -- analyzeFaces: uncertain male (below threshold) = block
  assert t
    (case analyzeFaces [("male", 0.5)] of Block FaceDetected => True; _ => False)
    "analyzeFaces [(male, 0.5)] = Block (uncertain)"

  -- analyzeFaces: mixed - one female among males = block
  assert t
    (case analyzeFaces [("male", 0.9), ("female", 0.8)] of Block FaceDetected => True; _ => False)
    "analyzeFaces mixed = Block if any female"

  -- combineDetections: no face, person = block
  assert t
    (case combineDetections [] 1 of Block PersonNoFace => True; _ => False)
    "combineDetections [] 1 = Block PersonNoFace"

  -- combineDetections: no face, no person = safe
  assert t
    (case combineDetections [] 0 of Safe NoFaceNoPerson => True; _ => False)
    "combineDetections [] 0 = Safe"

  -- combineDetections: face found, delegates to analyzeFaces
  assert t
    (case combineDetections [("female", 0.9)] 0 of Block FaceDetected => True; _ => False)
    "combineDetections with face delegates to analyzeFaces"

  -- resolveConflict: block wins over safe (strict mode)
  let blockResult = MkPResult (Block FaceDetected) PML 1 0
  let safeResult  = MkPResult (Safe MaleOnly) PServer 0 0
  assert t
    (isBlocked (resolve safeResult blockResult).result)
    "resolve: block wins over safe (strict mode)"

  -- resolveConflict: USER safe overrides block
  let userSafe = MkPResult (Safe UserSafe) PUser 0 0
  assert t
    (not $ isBlocked (resolve blockResult userSafe).result)
    "resolve: USER safe overrides block"

  -- resolveConflict: non-USER safe does NOT override block
  let serverSafe = MkPResult (Safe ServerSafe) PServer 0 0
  assert t
    (isBlocked (resolve blockResult serverSafe).result)
    "resolve: non-USER safe does not override block"

  -- resolveConflict: higher priority wins when both agree
  let mlBlock     = MkPResult (Block FaceDetected) PML 1 0
  let haikuBlock  = MkPResult (Block CloudBlock) PHaiku 0 0
  assert t
    (case (resolve mlBlock haikuBlock).priority of PHaiku => True; _ => False)
    "resolve: higher priority wins when both block"

---------------------------------------------------------------------------
-- ML Learning tests
---------------------------------------------------------------------------

testLearning : TestRunner -> IO ()
testLearning t = do
  section "ML Learning"

  -- Euclidean distance: same vector = 0
  let v = [1.0, 2.0, 3.0]
  assert t (euclideanDistance v v == 0.0)
    "euclideanDistance same vector = 0"

  -- Euclidean distance: known triangle
  let a = [0.0, 0.0]
  let b = [3.0, 4.0]
  assert t (euclideanDistance a b == 5.0)
    "euclideanDistance [0,0] [3,4] = 5"

  -- Sigmoid: sigmoid(0) = 0.5
  assert t (sigmoid 0.0 == 0.5)
    "sigmoid(0) = 0.5"

  -- Sigmoid: large positive -> near 1
  assert t (sigmoid 10.0 > 0.99)
    "sigmoid(10) > 0.99"

  -- Sigmoid: large negative -> near 0
  assert t (sigmoid (-10.0) < 0.01)
    "sigmoid(-10) < 0.01"

  -- findNearest: empty database = Nothing
  let query = [0.1, 0.2, 0.3]
  assert t
    (isNothing $ findNearest query [])
    "findNearest empty = Nothing"

  -- findNearest: returns closest match
  let face1 = MkKnownFace [0.1, 0.2, 0.3] "block" "user" 1.0
  let face2 = MkKnownFace [0.9, 0.8, 0.7] "safe" "user" 1.0
  case findNearest [0.1, 0.2, 0.3] [face1, face2] of
    Just m  => assertEq t m.label "block" "findNearest returns closest"
    Nothing => assert t False "findNearest should find a match"

  -- trainClassifier: produces weights of correct length
  let examples = [(fakeDescriptor 0, True), (fakeDescriptor 1, True),
                  (fakeDescriptor 2, False), (fakeDescriptor 3, False),
                  (fakeDescriptor 4, True), (fakeDescriptor 5, False),
                  (fakeDescriptor 6, True), (fakeDescriptor 7, False),
                  (fakeDescriptor 8, True), (fakeDescriptor 9, False)]
  let cw = trainClassifier examples 0.01 100
  assertEq t (length cw.weights) 128
    "trainClassifier produces 128 weights"

  -- predict: returns value in [0, 1]
  let p = predict cw (fakeDescriptor 0)
  assert t (p >= 0.0 && p <= 1.0)
    "predict returns value in [0, 1]"

---------------------------------------------------------------------------
-- State handler tests — Cloud
---------------------------------------------------------------------------

testCloudHandlers : TestRunner -> IO ()
testCloudHandlers t = do
  section "Cloud Handlers"

  -- getCloudStats defaults
  let s0 = initBgState
  let stats0 = getCloudStats s0
  assert t (not stats0.hasApiKey) "default: no API key"
  assertEq t stats0.cloudMode "all" "default: cloudMode = all"
  assertEq t stats0.cloudCallsToday 0 "default: cloudCallsToday = 0"
  assertEq t stats0.cloudSavedCount 0 "default: cloudSavedCount = 0"
  assertEq t stats0.cloudCacheSize 0 "default: cloudCacheSize = 0"

  -- setApiKey
  let s1 = setApiKey s0 "sk-ant-test123"
  let stats1 = getCloudStats s1
  assert t stats1.hasApiKey "hasApiKey after setApiKey"

  -- setCloudMode
  let s2 = setCloudModeH s1 "uncertain"
  assertEq t (getCloudStats s2).cloudMode "uncertain" "cloudMode = uncertain"

  let s3 = setCloudModeH s2 "never"
  assertEq t (getCloudStats s3).cloudMode "never" "cloudMode = never"

  -- clearCloudCache
  let s4 = learnBlock s0 "https://example.com/a.jpg" [fakeDescriptor 0] 1000
  let (s5, cleared) = clearCloudCache s4
  assertEq t cleared 1 "clearCloudCache returns count"
  assertEq t (getCloudStats s5).cloudCacheSize 0 "cache empty after clear"

---------------------------------------------------------------------------
-- State handler tests — Learning
---------------------------------------------------------------------------

testLearningHandlers : TestRunner -> IO ()
testLearningHandlers t = do
  section "Learning Handlers"

  -- Initial state
  let s0 = initBgState
  let stats0 = getLearningStats s0
  assertEq t stats0.knownFacesCount 0 "initial: knownFacesCount = 0"
  assertEq t stats0.knownSafeFacesCount 0 "initial: knownSafeFacesCount = 0"
  assertEq t stats0.trainingDataCount 0 "initial: trainingDataCount = 0"
  assert t (not stats0.classifierTrained) "initial: classifier not trained"

  -- exportLearning: empty
  let ex0 = exportLearning s0
  assert t (ex0.knownFaces == []) "initial export: no knownFaces"
  assert t (ex0.manualBlocklist == []) "initial export: no blocklist"
  assert t (isNothing ex0.classifierWeights) "initial export: no weights"

  -- learnBlock
  let desc1 = fakeDescriptor 1
  let desc2 = fakeDescriptor 2
  let url = "https://example.com/face1.jpg"
  let s1 = learnBlock s0 url [desc1, desc2] 1000
  let stats1 = getLearningStats s1
  assertEq t stats1.knownFacesCount 2 "learnBlock: 2 faces"
  assertEq t stats1.trainingDataCount 2 "learnBlock: 2 training entries"
  let ex1 = exportLearning s1
  assert t (elem url ex1.manualBlocklist) "learnBlock: url in blocklist"
  assertEq t (length ex1.knownFaces) 2 "learnBlock: 2 face entries"
  case ex1.knownFaces of
    (f :: _) => do
      assert t (f.descriptor == desc1) "learnBlock: first descriptor matches"
      assertEq t f.url url "learnBlock: url matches"
    _ => assert t False "learnBlock: should have face entries"
  case ex1.trainingData of
    (td :: _) => assertEq t td.label 1 "learnBlock: training label = 1"
    _ => assert t False "learnBlock: should have training data"

  -- learnSafe
  let desc3 = fakeDescriptor 3
  let safeUrl = "https://example.com/safe1.jpg"
  let s2 = learnSafe s0 safeUrl [desc3] 1000
  let stats2 = getLearningStats s2
  assertEq t stats2.knownSafeFacesCount 1 "learnSafe: 1 safe face"
  assertEq t stats2.trainingDataCount 1 "learnSafe: 1 training entry"
  let ex2 = exportLearning s2
  assert t (elem safeUrl ex2.manualSafelist) "learnSafe: url in safelist"
  case ex2.trainingData of
    (td :: _) => assertEq t td.label 0 "learnSafe: training label = 0"
    _ => assert t False "learnSafe: should have training data"

  -- learnBlock removes from safelist
  let reclassUrl = "https://example.com/reclassified.jpg"
  let s3 = learnSafe s0 reclassUrl [fakeDescriptor 4] 1000
  assert t (elem reclassUrl (exportLearning s3).manualSafelist)
    "before reclassify: in safelist"
  let s4 = learnBlock s3 reclassUrl [fakeDescriptor 5] 2000
  let ex4 = exportLearning s4
  assert t (elem reclassUrl ex4.manualBlocklist)
    "after block: in blocklist"
  assert t (not $ elem reclassUrl ex4.manualSafelist)
    "after block: removed from safelist"

  -- learnSafe removes from blocklist
  let reclassUrl2 = "https://example.com/reclassified2.jpg"
  let s5 = learnBlock s0 reclassUrl2 [fakeDescriptor 6] 1000
  assert t (elem reclassUrl2 (exportLearning s5).manualBlocklist)
    "before reclassify: in blocklist"
  let s6 = learnSafe s5 reclassUrl2 [fakeDescriptor 7] 2000
  let ex6 = exportLearning s6
  assert t (elem reclassUrl2 ex6.manualSafelist)
    "after safe: in safelist"
  assert t (not $ elem reclassUrl2 ex6.manualBlocklist)
    "after safe: removed from blocklist"

  -- resetLearning
  let s7 = learnBlock s0 "https://a.com/1.jpg" [fakeDescriptor 10] 1000
  let s8 = learnSafe s7 "https://b.com/2.jpg" [fakeDescriptor 11] 1000
  let stats8 = getLearningStats s8
  assertEq t stats8.knownFacesCount 1 "before reset: 1 face"
  assertEq t stats8.knownSafeFacesCount 1 "before reset: 1 safe face"
  let s9 = resetLearning s8
  let stats9 = getLearningStats s9
  assertEq t stats9.knownFacesCount 0 "after reset: 0 faces"
  assertEq t stats9.knownSafeFacesCount 0 "after reset: 0 safe faces"
  assertEq t stats9.trainingDataCount 0 "after reset: 0 training"
  assert t (not stats9.classifierTrained) "after reset: no classifier"
  let ex9 = exportLearning s9
  assert t (ex9.manualBlocklist == []) "after reset: empty blocklist"
  assert t (ex9.manualSafelist == []) "after reset: empty safelist"

---------------------------------------------------------------------------
-- State handler tests — Import/Export
---------------------------------------------------------------------------

testImportExport : TestRunner -> IO ()
testImportExport t = do
  section "Import/Export"

  let s0 = initBgState

  -- importLearning merges data
  let s1 = learnBlock s0 "https://a.com/1.jpg" [fakeDescriptor 20] 1000
  let imp = MkLearningExport
        [MkFaceEntry (fakeDescriptor 21) "https://c.com/3.jpg" 1000]
        [MkFaceEntry (fakeDescriptor 22) "https://d.com/4.jpg" 1000]
        ["https://e.com/5.jpg"]
        ["https://f.com/6.jpg"]
        [MkTrainingEntry (fakeDescriptor 23) 1]
        Nothing
  let s2 = importLearning s1 imp
  let ex2 = exportLearning s2
  assertEq t (length ex2.knownFaces) 2 "import: merged knownFaces"
  assertEq t (length ex2.knownSafeFaces) 1 "import: imported knownSafeFaces"
  assert t (elem "https://a.com/1.jpg" ex2.manualBlocklist)
    "import: original blocklist preserved"
  assert t (elem "https://e.com/5.jpg" ex2.manualBlocklist)
    "import: imported blocklist added"
  assert t (elem "https://f.com/6.jpg" ex2.manualSafelist)
    "import: imported safelist added"
  assertEq t (length ex2.trainingData) 2 "import: merged training data"

  -- importLearning deduplicates URLs
  let dupeUrl = "https://dupe.com/face.jpg"
  let s3 = learnBlock s0 dupeUrl [fakeDescriptor 30] 1000
  let s4 = importLearning s3 (MkLearningExport [] [] [dupeUrl] [] [] Nothing)
  let dupeCount = length $ filter (== dupeUrl) (exportLearning s4).manualBlocklist
  assertEq t dupeCount 1 "import: deduplicates blocklist URLs"

  -- importLearning respects MAX_KNOWN_FACES cap
  let bigFaces = map (\i => MkFaceEntry (fakeDescriptor i) ("https://example.com/" ++ show i ++ ".jpg") 0) [the Nat 0 .. 1099]
  let s5 = importLearning s0 (MkLearningExport bigFaces [] [] [] [] Nothing)
  let stats5 = getLearningStats s5
  assert t (stats5.knownFacesCount <= 1000) "import: respects MAX_KNOWN_FACES"
  let ex5 = exportLearning s5
  assertEq t (length ex5.knownFaces) 1000 "import: exactly 1000 faces"
  case ex5.knownFaces of
    (f :: _) => assertEq t f.url "https://example.com/100.jpg"
                  "import: keeps last 1000 (first = entry 100)"
    _ => assert t False "should have faces"

  -- importLearning respects MAX_TRAINING_DATA cap
  let bigTd = map (\i => MkTrainingEntry (fakeDescriptor i) 1) [the Nat 0 .. 599]
  let s6 = importLearning s0 (MkLearningExport [] [] [] [] bigTd Nothing)
  let stats6 = getLearningStats s6
  assert t (stats6.trainingDataCount <= 500) "import: respects MAX_TRAINING_DATA"

  -- importLearning with classifierWeights
  let importedWeights = MkWeights (replicate 128 0.1) 0.5
  let s7 = importLearning s0 (MkLearningExport [] [] [] [] [] (Just importedWeights))
  let ex7 = exportLearning s7
  case ex7.classifierWeights of
    Just cw => do
      assertEq t (length cw.weights) 128 "import: weights has 128 elements"
      assert t (cw.bias == 0.5) "import: bias = 0.5"
    Nothing => assert t False "import: classifierWeights should be Just"
  assert t (getLearningStats s7).classifierTrained
    "import: classifierTrained = True"

---------------------------------------------------------------------------
-- State handler tests — Classifier training
---------------------------------------------------------------------------

testClassifier : TestRunner -> IO ()
testClassifier t = do
  section "Classifier Training"

  let s0 = initBgState

  -- Does NOT train with fewer than 10 examples
  let s1 = foldl (\s, i => learnBlock s
              ("https://example.com/few-" ++ show i ++ ".jpg")
              [fakeDescriptor (200 + i)] 1000)
            s0 [the Nat 0 .. 8]  -- 9 examples
  let stats1 = getLearningStats s1
  assertEq t stats1.trainingDataCount 9 "9 training examples"
  assert t (not stats1.classifierTrained) "not trained with < 10 examples"

  -- DOES train after 10th example
  let s2 = learnBlock s1 "https://example.com/tenth.jpg"
            [fakeDescriptor 209] 1000
  let stats2 = getLearningStats s2
  assertEq t stats2.trainingDataCount 10 "10 training examples"
  assert t stats2.classifierTrained "trained after 10 examples"

  let ex2 = exportLearning s2
  case ex2.classifierWeights of
    Just cw => do
      assertEq t (length cw.weights) 128 "classifier: 128 weights"
      assert t True "classifier: bias exists"
    Nothing => assert t False "classifier: should have weights"

---------------------------------------------------------------------------
-- State handler tests — Full round-trip
---------------------------------------------------------------------------

testRoundTrip : TestRunner -> IO ()
testRoundTrip t = do
  section "Full Round-Trip"

  let s0 = initBgState
  let blockUrl = "https://example.com/blocked.jpg"
  let safeUrl  = "https://example.com/safe.jpg"

  -- 1. Learn some data
  let s1 = learnBlock s0 blockUrl [fakeDescriptor 300, fakeDescriptor 301] 1000
  let s2 = learnSafe s1 safeUrl [fakeDescriptor 302] 1000

  -- 2. Export
  let exported = exportLearning s2
  assertEq t (length exported.knownFaces) 2 "roundtrip: 2 known faces"
  assertEq t (length exported.knownSafeFaces) 1 "roundtrip: 1 safe face"
  assert t (exported.manualBlocklist == [blockUrl]) "roundtrip: blocklist"
  assert t (exported.manualSafelist == [safeUrl]) "roundtrip: safelist"
  assertEq t (length exported.trainingData) 3 "roundtrip: 3 training entries"

  -- 3. Reset
  let s3 = resetLearning s2
  let afterReset = exportLearning s3
  assert t (afterReset.knownFaces == []) "roundtrip: reset knownFaces"
  assert t (afterReset.manualBlocklist == []) "roundtrip: reset blocklist"

  -- 4. Re-import
  let s4 = importLearning s3 exported

  -- 5. Verify restored
  let restored = exportLearning s4
  assertEq t (length restored.knownFaces) 2 "roundtrip: restored faces"
  assertEq t (length restored.knownSafeFaces) 1 "roundtrip: restored safe"
  assert t (elem blockUrl restored.manualBlocklist) "roundtrip: restored blocklist"
  assert t (elem safeUrl restored.manualSafelist) "roundtrip: restored safelist"
  assertEq t (length restored.trainingData) 3 "roundtrip: restored training"

  -- Descriptors should match
  case restored.knownFaces of
    (f1 :: f2 :: _) => do
      assert t (f1.descriptor == fakeDescriptor 300) "roundtrip: descriptor 1 matches"
      assert t (f2.descriptor == fakeDescriptor 301) "roundtrip: descriptor 2 matches"
    _ => assert t False "roundtrip: should have 2 face entries"

---------------------------------------------------------------------------
-- State handler tests — Toggle & Whitelist
---------------------------------------------------------------------------

testToggleWhitelist : TestRunner -> IO ()
testToggleWhitelist t = do
  section "Toggle & Whitelist"

  let s0 = initBgState
  assert t s0.blockingEnabled "initial: blocking enabled"

  let s1 = toggle s0
  assert t (not s1.blockingEnabled) "after toggle: blocking disabled"

  let s2 = toggle s1
  assert t s2.blockingEnabled "after double toggle: blocking enabled"

  -- addWhitelist
  let s3 = addWhitelist s0 "example.com"
  assert t (elem "example.com" s3.whitelist) "addWhitelist: domain added"
  assertEq t (length s3.whitelist) 1 "addWhitelist: one entry"

  -- addWhitelist: no duplicates
  let s4 = addWhitelist s3 "example.com"
  assertEq t (length s4.whitelist) 1 "addWhitelist: no duplicate"

  -- addWhitelist: empty string ignored
  let s5 = addWhitelist s0 ""
  assertEq t (length s5.whitelist) 0 "addWhitelist: empty ignored"

  -- removeWhitelist
  let s6 = removeWhitelist s3 "example.com"
  assertEq t (length s6.whitelist) 0 "removeWhitelist: removed"

---------------------------------------------------------------------------
-- Main
---------------------------------------------------------------------------

main : IO ()
main = do
  putStrLn "Shmirat Eynaim — Idris Test Suite\n"
  t <- initTests
  testPriority t
  testLearning t
  testCloudHandlers t
  testLearningHandlers t
  testImportExport t
  testClassifier t
  testRoundTrip t
  testToggleWhitelist t
  summary t
