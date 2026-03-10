-- ML.Learning — KNN matching and logistic regression classifier
--
-- Pure mathematical functions for the learning system.
-- Face descriptors are 128-dimensional Float64 vectors.

module ML.Learning

import Data.List
import Extension.Types

---------------------------------------------------------------------------
-- Euclidean distance
---------------------------------------------------------------------------

||| Compute Euclidean distance between two 128-element descriptor vectors.
||| Pure function — no IO needed.
public export
euclideanDistance : List Double -> List Double -> Double
euclideanDistance a b = sqrt (sumOfSquares a b 0.0)
  where
    sumOfSquares : List Double -> List Double -> Double -> Double
    sumOfSquares [] _ acc = acc
    sumOfSquares _ [] acc = acc
    sumOfSquares (x :: xs) (y :: ys) acc =
      let diff = x - y
      in sumOfSquares xs ys (acc + diff * diff)

---------------------------------------------------------------------------
-- KNN matching
---------------------------------------------------------------------------

||| Result of a KNN lookup.
public export
record KnnMatch where
  constructor MkKnnMatch
  label    : String   -- "block" or "safe"
  distance : Double
  source   : String   -- "user" or "haiku"

||| Find the nearest neighbor in a list of known faces.
||| Returns Nothing if the database is empty.
public export
findNearest : List Double -> List KnownFace -> Maybe KnnMatch
findNearest _ [] = Nothing
findNearest query faces =
  let matches = map (\f =>
        let dist = euclideanDistance query f.descriptorData
            -- User-flagged examples get a distance bonus (closer match)
            adjusted = if f.source == "user" then dist * 0.8 else dist
        in MkKnnMatch f.label adjusted f.source
        ) faces
  in case matches of
       [] => Nothing
       (x :: xs) => Just (foldl (\a, b => if a.distance < b.distance then a else b) x xs)

||| Check if a descriptor matches a known blocked face.
public export
matchesBlockedFace : List Double -> List KnownFace -> Maybe KnnMatch
matchesBlockedFace query faces =
  case findNearest query (filter (\f => f.label == "block") faces) of
    Just m  => if m.distance < 0.5 then Just m else Nothing
    Nothing => Nothing

||| Check if a descriptor matches a known safe face.
public export
matchesSafeFace : List Double -> List KnownFace -> Maybe KnnMatch
matchesSafeFace query faces =
  case findNearest query (filter (\f => f.label == "safe") faces) of
    Just m  => if m.distance < 0.4 then Just m else Nothing
    Nothing => Nothing

---------------------------------------------------------------------------
-- Logistic regression classifier
---------------------------------------------------------------------------

||| Sigmoid activation function.
public export
sigmoid : Double -> Double
sigmoid x = 1.0 / (1.0 + exp (negate x))

||| Classifier weights: 128 weights + 1 bias.
public export
record ClassifierWeights where
  constructor MkWeights
  weights : List Double  -- 128 elements
  bias    : Double

||| Predict using logistic regression.
||| Returns probability of "block" (> 0.5 = block, < 0.5 = safe).
public export
predict : ClassifierWeights -> List Double -> Double
predict cw descriptor =
  let dotProduct = sum (zipWith (*) cw.weights descriptor)
  in sigmoid (dotProduct + cw.bias)

||| Train logistic regression on labeled examples.
||| Uses gradient descent with given learning rate and iterations.
||| Pure function — no side effects.
public export
trainClassifier : List (List Double, Bool) -> Double -> Nat -> ClassifierWeights
trainClassifier examples lr iterations =
  let initWeights = replicate 128 0.0
      initBias    = 0.0
      initCw      = MkWeights initWeights initBias
  in iterate iterations initCw
  where
    gradientStep : ClassifierWeights -> List (List Double, Bool) -> Double -> ClassifierWeights
    gradientStep cw [] _ = cw
    gradientStep cw ((desc, label) :: rest) rate =
      let pred   = predict cw desc
          target = if label then 1.0 else 0.0
          err    = pred - target
          -- Update weights: w_i -= lr * err * x_i
          newW   = zipWith (\w, x => w - rate * err * x) cw.weights desc
          newB   = cw.bias - rate * err
      in gradientStep (MkWeights newW newB) rest rate

    iterate : Nat -> ClassifierWeights -> ClassifierWeights
    iterate Z cw = cw
    iterate (S n) cw =
      let cw' = gradientStep cw examples lr
      in iterate n cw'
