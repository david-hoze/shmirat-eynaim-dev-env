-- Test.Assert — Minimal test harness for Idris2.
-- Compile with --cg node, run with Node.js.

module Test.Assert

---------------------------------------------------------------------------
-- Mutable test counters via JS FFI (avoids Data.IORef dependency)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(w) => { globalThis.__testP = 0; globalThis.__testF = 0; return 0; }"
prim__initTests : PrimIO Int

%foreign "javascript:lambda:(w) => { globalThis.__testP++; return 0; }"
prim__incPass : PrimIO Int

%foreign "javascript:lambda:(w) => { globalThis.__testF++; return 0; }"
prim__incFail : PrimIO Int

%foreign "javascript:lambda:(w) => globalThis.__testP"
prim__getPassed : PrimIO Int

%foreign "javascript:lambda:(w) => globalThis.__testF"
prim__getFailed : PrimIO Int

%foreign "javascript:lambda:(code, w) => { process.exit(code); }"
prim__exit : Int -> PrimIO ()

---------------------------------------------------------------------------
-- Test runner (unit token — state is in JS globals)
---------------------------------------------------------------------------

public export
data TestRunner = MkTestRunner

public export
initTests : IO TestRunner
initTests = do
  _ <- primIO prim__initTests
  pure MkTestRunner

---------------------------------------------------------------------------
-- Assertions
---------------------------------------------------------------------------

public export
assert : TestRunner -> Bool -> String -> IO ()
assert _ True name = do
  _ <- primIO prim__incPass
  putStrLn ("  PASS: " ++ name)
assert _ False name = do
  _ <- primIO prim__incFail
  putStrLn ("  FAIL: " ++ name)

public export
assertEq : (Show a, Eq a) => TestRunner -> a -> a -> String -> IO ()
assertEq t got expected name =
  if got == expected
    then assert t True name
    else do
      _ <- primIO prim__incFail
      putStrLn ("  FAIL: " ++ name ++ " (expected " ++ show expected ++ ", got " ++ show got ++ ")")

---------------------------------------------------------------------------
-- Summary and exit
---------------------------------------------------------------------------

public export
summary : TestRunner -> IO ()
summary _ = do
  p <- primIO prim__getPassed
  f <- primIO prim__getFailed
  putStrLn ("\n" ++ show p ++ "/" ++ show (p + f) ++ " tests passed")
  case f of
    0 => pure ()
    _ => primIO (prim__exit 1)

---------------------------------------------------------------------------
-- Section headers
---------------------------------------------------------------------------

public export
section : String -> IO ()
section name = putStrLn ("\n=== " ++ name ++ " ===")
