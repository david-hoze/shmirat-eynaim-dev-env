-- Pipeline.Priority — Strict mode priority resolution (pure, no IO)
--
-- This module contains the decision logic for resolving conflicts between
-- classification sources. It is pure Idris — no FFI, no IO, fully testable.

module Pipeline.Priority

import Extension.Types

---------------------------------------------------------------------------
-- Gender classification thresholds
---------------------------------------------------------------------------

||| Minimum confidence to consider a face "male".
||| Below this, the face is treated as potentially female (strict mode).
public export
maleConfidenceThreshold : Double
maleConfidenceThreshold = 0.65

||| Minimum confidence for KNN blocked face match.
public export
knnBlockThreshold : Double
knnBlockThreshold = 0.5

||| Minimum confidence for KNN safe face match.
public export
knnSafeThreshold : Double
knnSafeThreshold = 0.4

||| Minimum confidence for trained classifier.
public export
classifierThreshold : Double
classifierThreshold = 0.5

||| Minimum person detection bounding box dimension.
public export
minPersonDim : Double
minPersonDim = 60.0

||| Minimum person detection confidence.
public export
personConfidenceThreshold : Double
personConfidenceThreshold = 0.5

||| Server vote threshold — minimum votes to trust a server result.
public export
serverVoteThreshold : Nat
serverVoteThreshold = 2

---------------------------------------------------------------------------
-- Face analysis decision
---------------------------------------------------------------------------

||| Given a list of (gender, genderProbability) pairs from face detection,
||| determine if the image should be blocked.
|||
||| Logic:
|||   - If ANY face is female → BLOCK
|||   - If ANY face has confidence < 0.65 for male → BLOCK (uncertain = strict)
|||   - If ALL faces are confidently male (> 0.65) → SAFE
public export
analyzeFaces : List (String, Double) -> ClassificationResult
analyzeFaces [] = Safe NoFaceNoPerson  -- No faces found
analyzeFaces faces =
  let hasFemaleOrUncertain = any isFemaleOrUncertain faces
  in if hasFemaleOrUncertain
       then Block FaceDetected
       else Safe MaleOnly
  where
    isFemaleOrUncertain : (String, Double) -> Bool
    isFemaleOrUncertain (gender, prob) =
      not (gender == "male" && prob >= maleConfidenceThreshold)

---------------------------------------------------------------------------
-- Combined ML decision (faces + persons)
---------------------------------------------------------------------------

||| Combine face detection and person detection results.
|||
||| Decision matrix:
|||   Face found + male (>0.65)     → SHOW
|||   Face found + female/uncertain → HIDE
|||   No face + person detected     → HIDE (strict: person without identifiable male face)
|||   No face + no person           → SHOW
public export
combineDetections : List (String, Double) -> Nat -> ClassificationResult
combineDetections faces personCount =
  case faces of
    [] => if personCount > 0
            then Block PersonNoFace   -- Person but no face → strict mode
            else Safe NoFaceNoPerson  -- Nothing detected → safe
    _  => analyzeFaces faces

---------------------------------------------------------------------------
-- Pipeline resolution (re-export from Types for convenience)
---------------------------------------------------------------------------

||| Resolve a conflict between two prioritized results.
||| Strict mode: BLOCK wins unless USER says SAFE.
public export
resolve : PrioritizedResult -> PrioritizedResult -> PrioritizedResult
resolve = resolveConflict
