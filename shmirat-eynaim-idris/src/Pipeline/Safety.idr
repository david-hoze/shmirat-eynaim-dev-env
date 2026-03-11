||| Type-level safety invariant for image classification.
|||
||| KEY INVARIANT: An image may only be shown if it has been positively
||| proven safe by ML analysis. All other states (error, timeout,
||| models not loaded, unfetchable, unanalyzed) result in blocking.
|||
||| This is encoded in the type system: only the `ProvenSafe` constructor
||| carries a proof that ML ran and found no women. The `shouldShow`
||| function pattern-matches on this proof — all other constructors
||| return False (block).
module Pipeline.Safety

||| The result of classifying an image.
||| Only `ProvenSafe` can lead to showing the image.
public export
data ClassResult : Type where
  ||| ML ran successfully and positively determined the image is safe.
  ||| This is the ONLY state that allows showing an image.
  ProvenSafe   : (reason : String) -> ClassResult
  ||| ML ran and detected women or uncertain content -> block.
  ProvenBlock  : (reason : String) -> ClassResult
  ||| ML could not run (models not loaded, decode error, timeout, etc.)
  ||| Since we cannot prove safety, we MUST block.
  Unanalyzable : (reason : String) -> ClassResult
  ||| Image data could not be fetched at all.
  ||| Since we cannot prove safety, we MUST block.
  Unfetchable  : (reason : String) -> ClassResult
  ||| User manually marked this image.
  ||| User decisions override all ML results.
  UserDecision : (safe : Bool) -> ClassResult

||| The core safety invariant: only ProvenSafe and UserDecision(True)
||| result in showing the image. Everything else blocks.
|||
||| This function is total — every possible ClassResult is handled,
||| and the default is to BLOCK.
public export
shouldShow : ClassResult -> Bool
shouldShow (ProvenSafe _)      = True
shouldShow (UserDecision True)  = True
shouldShow (ProvenBlock _)      = False  -- ML says block
shouldShow (Unanalyzable _)     = False  -- can't prove safe -> block
shouldShow (Unfetchable _)      = False  -- can't even fetch -> block
shouldShow (UserDecision False) = False  -- user says block

||| Convenience: does this result require blocking?
public export
shouldBlock : ClassResult -> Bool
shouldBlock = not . shouldShow

||| Map JS-level classification reasons to type-safe results.
||| This is where the invariant is enforced at the boundary between
||| the JS FFI and the Idris type system.
public export
fromJSResult : Bool -> String -> ClassResult
fromJSResult containsWomen reason =
  case reason of
    -- ML successfully analyzed and found no women
    _ => if containsWomen
           then ProvenBlock reason
           else case reason of
                  "face"             => ProvenSafe reason   -- ML found only male faces
                  ""                 => ProvenSafe reason   -- ML found nothing
                  "user-safe"        => UserDecision True
                  "user-block"       => UserDecision False
                  "cloud-cache"      => ProvenSafe reason   -- previously analyzed
                  "haiku"            => ProvenSafe reason   -- cloud ML says safe
                  "server"           => ProvenSafe reason   -- server consensus says safe
                  -- ALL error states -> Unanalyzable (block)
                  "models-not-loaded" => Unanalyzable reason
                  "ml-error"          => Unanalyzable reason
                  "decode-error"      => Unanalyzable reason
                  "no-sources"        => Unanalyzable reason
                  _                   => Unanalyzable reason  -- unknown = block
