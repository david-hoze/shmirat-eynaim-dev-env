# Idris 2 for Browser Extensions — Complete Guide

## Table of Contents

1. [What is Idris 2?](#what-is-idris-2)
2. [Progressive Idris (Type Inference)](#progressive-idris-type-inference-for-unannotated-definitions)
3. [Why Idris 2 for Browser Extensions?](#why-idris-2-for-browser-extensions)
4. [Installing on Windows](#installing-on-windows)
5. [The JavaScript Backend](#the-javascript-backend)
6. [FFI (Foreign Function Interface)](#ffi-foreign-function-interface)
7. [Handling Async/Promises](#handling-asyncpromises)
8. [Callbacks and Event Handlers](#callbacks-and-event-handlers)
9. [Wrapping RxJS](#wrapping-rxjs)
10. [Dependent Types for DOM Safety](#dependent-types-for-dom-safety)
11. [The CSS-JS Coupling Bug and How Idris Prevents It](#the-css-js-coupling-bug-and-how-idris-prevents-it)
12. [Generated JS Output](#generated-js-output)
13. [Limitations and Tradeoffs](#limitations-and-tradeoffs)
14. [Comparison with Other Languages](#comparison-with-other-languages)
15. [Resources](#resources)
16. [Compilation Errors We Encountered](#compilation-errors-we-encountered-and-how-to-fix-them)
17. [Gotchas and Pitfalls](#gotchas-and-pitfalls)
18. [Testing in Idris2](#testing-in-idris2---cg-node)
19. [Practical FFI Patterns](#practical-ffi-patterns)
20. [Build Commands Reference](#build-commands-reference)

---

## What is Idris 2?

Idris 2 is a purely functional programming language with **dependent types**. Dependent types let you express arbitrary properties of your program in the type system — including properties that span across CSS and JS boundaries.

- **Current version**: 0.8.0 (released 2025-10-31)
- **Type system**: Full dependent types (types can depend on values)
- **Compilation targets**: Chez Scheme (default), JavaScript (browser & Node.js), C (via RefC)
- **Paradigm**: Pure functional with controlled side effects via `IO` monad
- **License**: BSD-3-Clause

Idris 2 is a research language that's actively maintained but has a small ecosystem. No browser extension has ever been built in Idris 2 — the `shmirat-eynaim-idris/` project in this repo is (as far as we know) the first attempt.

---

## Progressive Idris (Type Inference for Unannotated Definitions)

Our custom Idris2 build (branch `progressive-stage1` on `fork`, david-hoze/Idris2)
includes **progressive type inference** — you can write function definitions
without type annotations and the compiler will infer types.

### Basic Usage

```idris
-- No type annotation needed:
add x y = x + y          -- inferred: Integer -> Integer -> Integer
id' x = x                -- inferred: {0 a : Type} -> a -> a
const' x y = x           -- inferred: {0 a : Type} -> {0 b : Type} -> a -> b -> a
myLength [] = 0
myLength (_ :: xs) = 1 + myLength xs
                          -- inferred: {0 a : Type} -> List a -> Integer
```

### Type Generalization

When a function's argument or return type can't be determined from the definition
(no operator constraints, no constructor patterns), the type is **generalized** —
unsolved type variables become implicit type parameters. This means functions like
`id' x = x` are truly polymorphic, not monomorphic `Integer -> Integer`.

### `--show-inferred-types` Flag

Use `--show-inferred-types` with `--check` to see what types the compiler inferred:

```bash
idris2 --show-inferred-types --check myfile.idr
# Output:
# add : Integer -> Integer -> Integer
# id' : a -> a
```

### What Works

- Simple aliases: `add x y = x + y`, `double x = x + x`
- Identity/const: `id x = x`, `const x y = x`
- Constructor patterns: `myNot True = False; myNot False = True`
- List patterns: `myLength [] = 0; myLength (_ :: xs) = 1 + myLength xs`
- Recursive functions: `factorial 0 = 1; factorial n = n * factorial (n - 1)`
- Case expressions, let bindings, where clauses
- String literal patterns: `greet "world" = "Hello, World!"; greet n = "Hello, " ++ n`
- Polymorphic usage: `id' 42` and `id' "hello"` in the same program

### Known Limitations

- **Higher-order functions**: `apply f x = f x` and `myMap f [] = []` fail because
  the compiler can't infer that `f` is a function type without HM-style unification
- **Pair patterns**: `myFst (x, _) = x` has an elaboration ordering issue
  (`unifyBothApps` picks the wrong hole orientation)
- **Typeclass operations on unresolved types**: Functions using `<`, `>`, `compare`
  fail because `Ord` search runs before the argument type is resolved
- **Typeclass generalization**: `add x y = x + y` infers `Integer -> Integer -> Integer`
  rather than `Num a => a -> a -> a` because the Num constraint is eagerly defaulted

### How It Works (Implementation Overview)

The progressive inference pipeline has three stages:

**Stage 1 — Type Synthesis** (`synthTypeFromPatterns` in ProcessDef.idr):
When a definition has no type annotation, the compiler scans LHS patterns for
constructor heads (e.g., `True`, `[]`, `::`) to determine argument types, and
scans the RHS for return type hints. Numeric literals default to `Integer`.
Remaining unknowns become metavariable holes marked with a `constSolvable` flag.

**Stage 2 — Elaboration**: Standard Idris 2 clause checking runs. The unifier
resolves metavariables where possible. The `constSolvable` flag allows the
unifier to solve certain holes as constant functions when pattern matching
substitutes constructors into metavar arguments (via `tryConstantSolve` in
Unify.idr). This is scoped to only synthesis-created holes to avoid breaking
the 624 existing tests.

**Stage 3 — Generalization** (`generaliseType` in ProcessDef.idr):
After elaboration AND runtime case tree compilation, any remaining unsolved
metavariables in the type are turned into `{0 a : Type} ->` implicit binders.
The case trees are weakened to account for the new arguments, and recursive
self-calls are patched to include erased type applications.

### Test Results

20/21 progressive tests passing, 793/795 full Idris 2 tests passing (2
pre-existing chez-backend failures on Windows). Zero regressions.

Full status: `docs/progressive/STATE.md` in the Idris2 repo.

---

## Why Idris 2 for Browser Extensions?

The core problem: CSS and JS share the DOM as mutable state. CSS can silently destroy data that JS needs to read. No mainstream language prevents this.

Idris 2's dependent types can encode **"this element has a readable background-image URL"** as a type-level fact. Marking an element as pending (adding a CSS class) **consumes the proof** that the URL is readable. Attempting to read the URL after marking pending is a **compile-time type error**.

This is qualitatively different from:

| Language | What it catches | How |
|----------|----------------|-----|
| TypeScript | Wrong argument types | Structural types |
| Rust | Shared mutable access | Ownership + lifetimes |
| Pony | Capability violations | Reference capabilities |
| **Idris 2** | **Any expressible property** | **Mathematical proof** |

---

## Installing on Windows

### The Problem

Idris 2 does **not** provide pre-built Windows binaries. The only community Windows build ([hawkend/idris2-windows](https://github.com/hawkend/idris2-windows)) is from February 2021 (Idris 2 v0.3 era) and is far too outdated.

You must build from source, which requires:
1. A C compiler (GCC via MSYS2)
2. Chez Scheme (the default backend Idris 2 bootstraps with)
3. `make`

### Option A: MSYS2 + Build from Source (Recommended)

#### Step 1: Install MSYS2

Download and install from https://www.msys2.org

After installation, edit `C:\msys64\mingw64.ini` and add:
```
MSYS2_PATH_TYPE=inherit
```

This lets MSYS2 see your Windows PATH (needed for Chez Scheme).

#### Step 2: Install Build Tools

Open MSYS2 MinGW64 terminal (`mingw64.exe`) and run:

```bash
pacman -Syu
pacman -S make mingw-w64-x86_64-gcc
```

#### Step 3: Install Chez Scheme

Download from https://github.com/cisco/ChezScheme/releases

**IMPORTANT**: Install to a path **without spaces** (e.g., `C:\chez`, NOT `C:\Program Files\Chez Scheme`). Spaces in paths break the Idris 2 build.

Add the Chez Scheme binary directory to your PATH. The binary is typically at:
```
C:\chez\bin\ta6nt\scheme.exe
```

Verify:
```bash
scheme --version
# Should print something like "10.1.0"
```

#### Step 4: Clone and Build Idris 2

```bash
git clone https://github.com/idris-lang/Idris2.git
cd Idris2

# Tell the build system where Chez Scheme is
export SCHEME=scheme

# Bootstrap (uses pre-generated Scheme sources, no existing Idris needed)
make bootstrap

# Install (default: ~/.idris2/)
make install
```

Add `~/.idris2/bin` to your PATH:
```bash
echo 'export PATH="$HOME/.idris2/bin:$PATH"' >> ~/.bashrc
```

Verify:
```bash
idris2 --version
# Should print "Idris 2, version 0.8.0"
```

### Option B: Using pack (Package Manager)

[pack](https://github.com/stefan-hoeck/idris2-pack) is the community package manager for Idris 2. It handles installing the compiler and libraries.

**Prerequisite**: Chez Scheme must already be installed (Step 3 above).

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/stefan-hoeck/idris2-pack/main/install.bash)"
```

After installation, add `$HOME/.local/bin` to PATH, then:

```bash
pack switch latest    # Install latest Idris 2
pack install idris2-dom  # Install DOM bindings library
```

### Option C: Docker (If Available)

If you have Docker on Windows:

```bash
docker run -it --rm -v $(pwd):/work snazzybucket/idris2:latest
```

This gives you a Linux environment with Idris 2 pre-installed.

### Option D: WSL (Windows Subsystem for Linux)

If you have WSL:

```bash
# In WSL (Ubuntu):
sudo apt install chezscheme make gcc
git clone https://github.com/idris-lang/Idris2.git
cd Idris2
export SCHEME=chezscheme
make bootstrap && make install
```

### Common Windows Issues

| Issue | Fix |
|-------|-----|
| `scheme: command not found` | Add Chez Scheme to PATH. The binary might be `scheme.exe` or `chez.exe` |
| `make: command not found` | Install via MSYS2: `pacman -S make` |
| Build fails with path errors | Avoid spaces in all paths. Use `C:\chez` not `C:\Program Files\...` |
| `cc: command not found` | Install GCC via MSYS2: `pacman -S mingw-w64-x86_64-gcc` |
| Git Bash alone doesn't work | Git Bash (MINGW64) lacks `make` and `gcc`. Use full MSYS2. |
| `idris2` runs but JS backend fails | JS backend is built-in since v0.5.0. Try `idris2 --cg javascript -o test.js Test.idr` |

### Verifying the JS Backend

Create a test file:

```idris
-- Test.idr
module Main

main : IO ()
main = putStrLn "Hello from Idris 2!"
```

Compile to JavaScript:

```bash
idris2 --cg javascript -o test.js Test.idr
```

Run:

```bash
node build/exec/test.js
# Should print: Hello from Idris 2!
```

---

## The JavaScript Backend

Idris 2 has two JavaScript code generators built in:

```bash
# Browser target (self-contained JS file)
idris2 --cg javascript -o output.js MyModule.idr

# Node.js target
idris2 --cg node -o output.js MyModule.idr
```

### Output Directives

```bash
--directive pretty    # (default) Readable, properly indented
--directive compact   # Single-line functions, minimal spaces
--directive minimal   # Obfuscated names, smallest output
```

All three produce functionally identical code. Use `pretty` for development, `minimal` for production (can be further reduced with Google Closure Compiler).

### What the Output Looks Like

Idris 2 compiles to a single JS file containing:
- The Idris runtime (lazy evaluation, tail-call optimization, numeric ops)
- All compiled Idris functions as JS functions
- The `main` function executed at load time

**Runtime representation:**
- Lists: `{h:0}` (empty), `{h:1, a1: head, a2: tail}` (cons)
- Data constructors: objects with tag `h` and fields `a1`, `a2`, ...
- Lazy values: thunks cached after first evaluation (`__lazy` function)
- Partial application: closures
- Tail recursion: optimized via `__tailRec` loop
- `_idrisworld`: the IO world token (passed through IO computations)

**Example — a simple function:**

```idris
greet : String -> String
greet name = "Hello, " ++ name ++ "!"
```

Compiles to approximately:

```javascript
function Main_greet($0) {
  return ("Hello, " + $0 + "!");
}
```

**Numeric types:**

| Idris Type | JS Type |
|-----------|---------|
| `Int`, `Int8`–`Int32`, `Bits8`–`Bits32`, `Char`, `Double` | `Number` |
| `Int64`, `Bits64`, `Integer` | `BigInt` |
| `String` | `string` |
| `()` | `undefined` |

---

## FFI (Foreign Function Interface)

The FFI is how Idris 2 calls JavaScript. Every browser API, DOM operation, and library call goes through FFI declarations.

### Basic Syntax

```idris
%foreign "javascript:lambda:(arg1, arg2) => jsExpression"
prim__functionName : Type1 -> Type2 -> PrimIO ReturnType
```

### Target Specifiers

You can provide different implementations for different targets:

```idris
%foreign "browser:lambda:x => document.body.innerHTML = x"
         "node:lambda:x => process.stdout.write(x)"
prim__output : String -> PrimIO ()
```

- `"javascript:lambda:..."` — works in both Node and browser
- `"browser:lambda:..."` — browser only
- `"node:lambda:..."` — Node.js only

### Type Mappings

| Idris Type | JS Receives |
|-----------|-------------|
| `String` | `string` |
| `Int`, `Bits32`, etc. | `Number` |
| `Double` | `Number` |
| `Bool` | `Number` (0 or 1) — **not** JS `true`/`false` |
| `AnyPtr` | any JS value (opaque) |
| `()` | `undefined` |

**Important**: Idris `Bool` maps to 0/1 in JS, not `true`/`false`. When passing Idris booleans to JS APIs that expect real booleans, convert explicitly:

```idris
%foreign "javascript:lambda:(b, w) => someApi(b === 1)"
prim__callApi : Bool -> PrimIO ()
```

### Wrapping JS Objects

The standard pattern for opaque JS type wrappers:

```idris
-- 1. Declare an external type (no Idris representation)
export
data DomNode : Type where [external]

-- 2. Write FFI bindings
%foreign "browser:lambda:() => document.body"
prim__body : PrimIO DomNode

-- 3. Wrap in a safe Idris function
body : HasIO io => io DomNode
body = primIO prim__body
```

### Accessing Properties

```idris
%foreign "browser:lambda:el => el.tagName"
prim__tagName : DomNode -> PrimIO String

%foreign "browser:lambda:el => el.children.length"
prim__childCount : DomNode -> PrimIO Int32
```

### Setting Properties

```idris
%foreign "browser:lambda:(el, val) => { el.textContent = val; }"
prim__setTextContent : DomNode -> String -> PrimIO ()
```

### Multi-line FFI (Complex JS)

Use triple-quoted strings for complex JS:

```idris
%foreign """javascript:lambda:(url, w) => {
  return fetch(url)
    .then(r => r.json())
    .then(data => JSON.stringify(data));
}"""
prim__fetchJson : String -> PrimIO (Promise String)
```

### PrimIO and IO Interaction

All FFI functions must use `PrimIO` (primitive IO). To use them in normal Idris `IO` code:

```idris
-- FFI declaration (PrimIO)
%foreign "javascript:lambda:(msg, w) => console.log(msg)"
prim__log : String -> PrimIO ()

-- Wrapped for Idris IO
log : HasIO io => String -> io ()
log msg = primIO $ prim__log msg
```

Key functions:
- `primIO : PrimIO a -> IO a` — lift PrimIO to IO
- `toPrim : IO a -> PrimIO a` — convert IO back to PrimIO (needed for callbacks)

---

## Handling Async/Promises

Idris 2 has **no async/await**. Promises are handled via `.then()` chains through the FFI.

### Declaring a Promise Type

```idris
export
data Promise : Type -> Type where [external]
```

### Creating Promises

```idris
%foreign "javascript:lambda:(x, w) => Promise.resolve(x)"
prim__resolve : a -> PrimIO (Promise a)
```

### Consuming Promises (.then)

```idris
%foreign "javascript:lambda:(p, onOk, onErr, w) => p.then(x => onOk(x)(w), e => onErr(String(e))(w))"
prim__then : Promise a -> (a -> PrimIO b) -> (String -> PrimIO b) -> PrimIO (Promise b)

-- Wrapped:
thenPromise : HasIO io => Promise a -> (a -> IO b) -> (String -> IO b) -> io (Promise b)
thenPromise p onOk onErr =
  primIO $ prim__then p (\x => toPrim $ onOk x) (\e => toPrim $ onErr e)
```

### Promise.all

```idris
%foreign "javascript:lambda:(p1, p2, w) => Promise.all([p1, p2])"
prim__all2 : Promise a -> Promise b -> PrimIO (Promise JsValue)
```

### Common Pattern: Wrapping an Async JS Function

```idris
-- JS function that returns a Promise
%foreign "javascript:lambda:(url, w) => fetch(url)"
prim__fetch : String -> PrimIO (Promise Response)

-- Use it in Idris:
fetchAndProcess : String -> IO ()
fetchAndProcess url = do
  promise <- primIO $ prim__fetch url
  _ <- thenPromise promise
    (\resp => do
      ok <- responseOk resp
      if ok then putStrLn "Success" else putStrLn "Failed"
    )
    (\err => putStrLn $ "Error: " ++ err)
  pure ()
```

---

## Callbacks and Event Handlers

### Pure Callbacks (No Side Effects)

```idris
%foreign "javascript:lambda:(f, arr) => arr.filter(x => f(x))"
prim__jsFilter : (Int32 -> Bool) -> JsArray Int32 -> JsArray Int32
```

### IO Callbacks (Side Effects)

**Critical pattern**: Idris IO callbacks are curried and return a thunk. The JS side must call the result with the world token `(w)`:

```idris
%foreign "browser:lambda:(event, callback, node, w) => node.addEventListener(event, x => callback(x)(w))"
prim__addEventListener : String -> (JsValue -> PrimIO ()) -> DomNode -> PrimIO ()
```

Note `callback(x)(w)`:
- `callback(x)` — apply the Idris function to the event argument
- `(w)` — invoke the resulting PrimIO thunk with the world token

**Multi-argument callbacks** are curried:

```idris
-- Idris function (a -> b -> PrimIO c) becomes JS: f(a)(b)(w)
%foreign "javascript:lambda:(f, a, b, w) => f(a)(b)(w)"
prim__apply2 : (String -> Int32 -> PrimIO ()) -> String -> Int32 -> PrimIO ()
```

### Event Listener Example

```idris
onClick : HasIO io => DomNode -> (JsValue -> IO ()) -> io ()
onClick node handler =
  primIO $ prim__addEventListener "click" (\ev => toPrim $ handler ev) node
```

---

## Wrapping RxJS

No RxJS wrapper exists for Idris 2. Here's how to build one from scratch.

### Step 1: Define Opaque Types

```idris
export
data Observable : Type -> Type where [external]

export
data Subject : Type -> Type where [external]

export
data Subscription : Type where [external]
```

### Step 2: Creation Functions

```idris
%foreign "javascript:lambda:(x, w) => rxjs.of(x)"
prim__of : a -> PrimIO (Observable a)

%foreign "javascript:lambda:(w) => rxjs.EMPTY"
prim__empty : PrimIO (Observable a)

%foreign "javascript:lambda:(promise, w) => rxjs.from(promise)"
prim__fromPromise : Promise a -> PrimIO (Observable a)

%foreign "javascript:lambda:(w) => new rxjs.Subject()"
prim__newSubject : PrimIO (Subject a)
```

### Step 3: Subscribe

```idris
%foreign "javascript:lambda:(obs, onNext, onErr, onComplete, w) => obs.subscribe({next: x => onNext(x)(w), error: e => onErr(String(e))(w), complete: () => onComplete(w)})"
prim__subscribe : Observable a
  -> (a -> PrimIO ())
  -> (String -> PrimIO ())
  -> PrimIO ()
  -> PrimIO Subscription
```

### Step 4: Operators

```idris
-- map
%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.map(x => f(x)))"
prim__map : (a -> b) -> Observable a -> PrimIO (Observable b)

-- filter
%foreign "javascript:lambda:(pred, obs, w) => obs.pipe(rxjs.filter(x => pred(x)))"
prim__filter : (a -> Bool) -> Observable a -> PrimIO (Observable a)

-- mergeMap (for async operations)
%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.mergeMap(x => f(x)(w)))"
prim__mergeMap : (a -> PrimIO (Observable b)) -> Observable a -> PrimIO (Observable b)

-- bufferTime
%foreign "javascript:lambda:(ms, obs, w) => obs.pipe(rxjs.bufferTime(ms))"
prim__bufferTime : Int32 -> Observable a -> PrimIO (Observable (JsArray a))

-- merge (combine streams)
%foreign "javascript:lambda:(a, b, w) => rxjs.merge(a, b)"
prim__merge : Observable a -> Observable a -> PrimIO (Observable a)
```

### Pragmatic Approach for Complex Pipelines

For complex multi-operator pipelines, it's more practical to write the entire pipeline as a single FFI call rather than composing individual operators in Idris:

```idris
%foreign """javascript:lambda:(obs, batchMs, w) =>
  obs.pipe(
    rxjs.bufferTime(batchMs),
    rxjs.filter(arr => arr.length > 0),
    rxjs.mergeMap(batch => processBatch(batch))
  )"""
prim__batchPipeline : Observable a -> Int32 -> PrimIO (Observable b)
```

This sacrifices some type safety for significantly less FFI boilerplate.

---

## Dependent Types for DOM Safety

This is what makes Idris 2 unique for this problem.

### Phantom Types (Lightweight Approach)

Tag elements with their lifecycle state:

```idris
data Discovered : Type where MkDiscovered : Discovered
data Pending    : Type where MkPending    : Pending
data Safe       : Type where MkSafe       : Safe
data Blocked    : Type where MkBlocked    : Blocked

-- Element carries a phantom type parameter
data Element : (state : Type) -> Type where [external]
```

Functions accept only elements in the correct state:

```idris
-- Can ONLY read URL from Discovered elements
getImageSrc : Element Discovered -> IO String

-- Transitions Discovered → Pending (consumes the Discovered element)
markPending : Element Discovered -> IO (Element Pending)

-- Transitions Pending → Safe or Blocked
markSafe    : Element Pending -> IO (Element Safe)
markBlocked : Element Pending -> IO (Element Blocked)
```

The CSS-JS bug becomes a type error:

```idris
broken : Element Discovered -> IO String
broken el = do
  pending <- markPending el    -- el is consumed; pending : Element Pending
  getImageSrc pending          -- TYPE ERROR: Pending ≠ Discovered
```

### Dependent Types (Full Power)

You can go further with actual dependent types — encoding **proofs** that properties hold:

```idris
-- A proof that an element has a readable background-image
data HasReadableBg : Element s -> Type where
  MkReadable : (el : Element s) -> (url : String) -> HasReadableBg el

-- Discovering an image produces a proof
discover : (el : Element Discovered) -> IO (Maybe (HasReadableBg el))

-- Reading requires the proof
readUrl : (el : Element s) -> HasReadableBg el -> String
readUrl _ (MkReadable _ url) = url

-- Marking pending CONSUMES the proof (linear types)
markPending : (el : Element Discovered)
           -> HasReadableBg el
           -> IO (Element Pending, String)  -- returns the URL separately
```

After `markPending`, the `HasReadableBg` proof is gone. You can't call `readUrl` because you don't have the proof anymore.

### CSS-JS Property Contract (Advanced)

You could even parse CSS at compile time and prove non-interference:

```idris
-- Type-level representation of CSS properties
data CSSProperty = BackgroundImage | Opacity | Display | Visibility

-- A proof that a CSS ruleset doesn't write a given property
data DoesntWrite : List CSSProperty -> CSSProperty -> Type where
  NotInList : Not (Elem prop props) -> DoesntWrite props prop

-- A function that reads a property requires proof CSS doesn't write it
readProp : (writeSet : List CSSProperty)
        -> DoesntWrite writeSet BackgroundImage  -- proof of non-interference
        -> Element s
        -> IO String
```

This is the most extreme form — you'd need compile-time CSS parsing, which is theoretically possible in Idris 2 but extremely ambitious.

---

## The CSS-JS Coupling Bug and How Idris Prevents It

### The Bug (in JavaScript)

```css
/* content.css */
.shmirat-eynaim-pending[style*="background-image"] {
  background-image: none !important;
}
```

```javascript
// content.js
function getImageSrc(el) {
  // This returns "none" because CSS destroyed it!
  const bg = getComputedStyle(el).backgroundImage;
  // ...
}
```

CSS set `background-image: none` on pending elements. JS read the URL via `getComputedStyle` and got "none". The URL was destroyed before it could be processed.

### Why It's Impossible in Idris

The Idris port in `shmirat-eynaim-idris/` prevents this via the `discoverImage` function in `Extension/Properties.idr`:

```idris
discoverImage : RawElement -> IO (Maybe ImageRef)
discoverImage rawEl = do
  -- Step 1: Cast to Discovered
  discovered <- unsafeCastElement rawEl

  -- Step 2: Extract URL BEFORE CSS modification
  url <- getImageSrc discovered    -- Only works on Element Discovered

  -- Step 3: Mark pending (CSS takes over visual properties)
  pending <- markPending discovered  -- Consumes Discovered → Pending

  -- Step 4: URL is now in ImageRef.url (an Idris String, immune to CSS)
  pure $ Just $ MkImageRef url pending Nothing
```

After `markPending`:
- `getImageSrc pending` would be a **type error** (Pending ≠ Discovered)
- The URL lives in `ImageRef.url` (a pure Idris `String`) — CSS can't touch it
- All downstream classification operates on `ImageRef.url`, never the DOM

**The bug is not "caught" — it is structurally impossible to write.**

---

## Generated JS Output

### Size Considerations

| Program | Generated JS Size |
|---------|-------------------|
| Hello World | ~50 KB |
| With DOM bindings | ~200-500 KB |
| Full extension (estimated) | ~1-2 MB |

The Idris runtime adds baseline overhead. Google Closure Compiler can reduce size by ~30%.

For comparison, the current `background.js` is ~1,653 lines of handwritten JS. The Idris version would compile to roughly 3-5x that size due to the runtime and functional overhead.

### Performance Characteristics

- **Lazy evaluation**: Values are computed on demand. This adds thunk overhead but can skip unnecessary computations.
- **Curried functions**: Every multi-argument function is curried (one argument at a time). This is slower than direct multi-argument JS calls.
- **BigInt for large integers**: `Int64` and `Integer` use JS `BigInt`, which is slower than `Number`.
- **No GC pauses from Idris**: Idris values are regular JS objects, garbage collected by V8/SpiderMonkey normally.
- **Tail-call optimization**: Tail-recursive functions are compiled to loops (no stack overflow).

**Bottom line**: Idris-compiled JS is ~2-5x slower than handwritten JS for equivalent logic. For this extension, the bottleneck is ML inference (TensorFlow.js), not pipeline logic, so the overhead is acceptable.

### Debugging

- **No source maps**: Idris 2 does not generate JS source maps. Debugging requires reading the generated JS.
- **Function names**: With `--directive pretty`, function names reflect the Idris module structure: `Extension_Properties_discoverImage`, `Pipeline_Priority_analyzeFaces`, etc.
- **With `--directive minimal`**: Function names are obfuscated. Only use for production.

---

## Limitations and Tradeoffs

### What Idris 2 Gets You

1. **Compile-time proof that CSS and JS don't interfere** on shared DOM properties
2. **Pure, testable decision logic** — priority resolution, gender thresholds, KNN matching are all pure functions with no IO
3. **Exhaustive pattern matching** — impossible to forget a case in classification result handling
4. **No null/undefined errors** — `Maybe` forces explicit handling of missing values

### What It Costs

1. **Massive FFI boilerplate** — every browser API, DOM method, and library function needs a `%foreign` declaration. The `shmirat-eynaim-idris/` port has ~200 FFI declarations.
2. **No async/await** — all async code becomes `.then()` chains, which are verbose and harder to read than `async/await`.
3. **No existing ecosystem** — no WebExtension library, no RxJS bindings, no TensorFlow bindings. Everything must be wrapped from scratch.
4. **Painful Windows install** — requires MSYS2 + Chez Scheme + building from source.
5. **Larger output** — 3-5x more JS than handwritten code.
6. **Slower execution** — 2-5x overhead from functional abstractions (currying, thunks, lazy evaluation).
7. **Debugging is hard** — no source maps, generated code is hard to trace back to Idris source.
8. **Tiny community** — hard to get help. Fewer than 100 active Idris 2 developers worldwide (estimated).
9. **Learning curve** — dependent types are a paradigm shift. Expect weeks to become productive.

### Is It Worth It?

For **this specific bug class** (CSS-JS DOM coupling): **the type system is overkill**. The WeakMap pattern (store URLs in JS memory, never read back from DOM) is a simpler fix that achieves the same safety.

For **broader correctness guarantees** (no missed cases in classification, provably correct priority resolution, no null pointer errors): Idris provides guarantees no other practical language can.

The honest answer: **write the pure logic in Idris, keep the FFI-heavy DOM/browser code in TypeScript**. The sweet spot is a hybrid where the decision logic is provably correct (Idris) and the glue code is practical (TypeScript).

---

## Comparison with Other Languages

### For the CSS-JS coupling bug specifically

| Language | Prevents the bug? | How? | Runs in browser? | Practical? |
|----------|-------------------|------|------------------|------------|
| **JavaScript** | No | N/A | Yes | Yes |
| **TypeScript** | No (branded types = partial) | Structural types | Yes | Yes |
| **Rust** | Yes | Ownership + borrow checker | Yes (WASM) | Moderate |
| **Pony** | Yes | Reference capabilities | No | No |
| **Elm** | Yes (eliminates the problem) | Virtual DOM | Yes | Moderate |
| **PureScript** | Partially | Effect rows | Yes | Moderate |
| **Gleam** | No | Immutability (doesn't extend to DOM) | Yes (JS target) | Moderate |
| **Idris 2** | Yes (strongest) | Dependent types + proofs | Yes (JS target) | Low |

### Performance ranking

1. **Rust** (WASM) — near-native speed
2. **JavaScript** (handwritten) — baseline
3. **TypeScript** — same as JS (compiles to JS)
4. **Gleam** — slightly slower than JS (functional overhead)
5. **PureScript** — similar to Gleam
6. **Elm** — similar, with virtual DOM overhead
7. **Idris 2** — 2-5x slower than handwritten JS
8. **Pony** — N/A (can't run in browser)

### Recommendation

- **Most practical**: Rust (via WASM) for the ML pipeline + TypeScript for DOM/browser code
- **Most correct**: Idris 2 for pure logic + TypeScript for FFI-heavy code
- **Best compromise**: TypeScript with branded types + WeakMap pattern + ESLint rules

---

## Resources

### Official Documentation
- [Idris 2 Documentation](https://idris2.readthedocs.io/en/latest/)
- [JavaScript Backend Guide](https://idris2.readthedocs.io/en/latest/backends/javascript.html)
- [FFI Reference](https://idris2.readthedocs.io/en/latest/ffi/ffi.html)
- [Windows Prerequisites](https://idris2.readthedocs.io/en/latest/tutorial/windows.html)

### Source Code
- [Idris 2 GitHub](https://github.com/idris-lang/Idris2)
- [Idris 2 Releases](https://github.com/idris-lang/Idris2/releases) (source only, no binaries)
- [INSTALL.md](https://github.com/idris-lang/Idris2/blob/main/INSTALL.md)

### Libraries
- [idris2-dom](https://github.com/stefan-hoeck/idris2-dom) — Typed DOM/HTML/Web API bindings (generated from WebIDL)
- [pack](https://github.com/stefan-hoeck/idris2-pack) — Package manager
- [idris2-dom examples](https://github.com/stefan-hoeck/idris2-dom/tree/main/examples) — Browser app examples

### Learning
- [Type-Driven Development with Idris](https://www.manning.com/books/type-driven-development-with-idris) — Book (Idris 1, but concepts apply)
- [Idris 2: Quantitative Type Theory in Practice](https://arxiv.org/abs/2104.00480) — Academic paper
- [A Crash Course in Idris 2](https://idris2.readthedocs.io/en/latest/tutorial/index.html) — Official tutorial

### Community
- [Idris Discord](https://discord.gg/YXmWC5yKYM)
- [Idris Discourse](https://discourse.idris-lang.org/)

### This Project
- `shmirat-eynaim-idris/` — The Idris 2 port of the Shmirat Eynaim extension
- `shmirat-eynaim-idris/BUILD.md` — Build instructions
- `shmirat-eynaim-idris/src/Extension/Properties.idr` — The key module that prevents the CSS-JS bug
- `shmirat-eynaim-idris/src/Pipeline/Priority.idr` — Pure decision logic (testable without browser)
- `shmirat-eynaim-idris/src/ML/Learning.idr` — Pure KNN and classifier algorithms

---

## Compilation Errors We Encountered (And How to Fix Them)

This section documents every compilation error we hit during the project and the root cause and fix for each. These are traps that future Idris2-to-JS projects will likely hit too.

### 1. "Not the end of a block entry, check indentation"

**Context**: Using `.field` accessor syntax inside `let` bindings in `do` blocks.

```idris
-- BROKEN: .field syntax in let binding within do block
summary _ = do
  let total = st.passed + st.failed   -- Parse error here
  putStrLn (show total)
```

**Root cause**: The Idris2 parser has issues with `.field` postfix accessor syntax in certain positions inside `let` bindings within `do` blocks. The parser interprets the `.` as the start of a new block or operator and fails.

**Fix**: Avoid `.field` syntax in `let` inside `do` blocks. Use either:
- Pattern matching to destructure the value
- Helper functions that extract the field
- Rewrite using `fst`/`snd` for tuples
- Use JS FFI globals instead of records (what we did for the test harness)

```idris
-- WORKS: avoid the problematic pattern entirely
-- We replaced the IORef-based test state with JS FFI globals
%foreign "javascript:lambda:(w) => globalThis.__testP"
prim__getPassed : PrimIO Int
```

### 2. "Can't find an implementation for Integral Nat"

**Context**: Trying to use `mod` on `Nat` values.

```idris
-- BROKEN
let label = cast $ mod i 2   -- Nat doesn't implement Integral
```

**Root cause**: `Nat` does not implement the `Integral` interface in Idris2. The `mod` function requires `Integral`, which is only implemented for `Int`, `Integer`, etc.

**Fix**: Either:
- Convert to `Int` first: `mod (cast i) 2`
- Use a different approach (e.g., just use a constant value)
- Use `Integer` instead of `Nat`

```idris
-- WORKS
let label = mod (the Integer (cast i)) 2

-- Or just avoid it
let label = 1  -- if you only need a constant
```

### 3. "Undefined name Data.IORef.IORef. Did you mean: IORes?"

**Context**: Trying to use `Data.IORef` for mutable state.

```idris
import Data.IORef
-- Error: Can't find module Data.IORef
```

**Root cause**: The bootstrapped Idris2 on Windows (built from source with Chez Scheme) does not include `Data.IORef` in its standard library. `IORef` is part of `contrib` or `base` packages that may not be fully available in the bootstrap build.

**Fix**: Use JS FFI globals as a workaround:

```idris
-- Instead of IORef, use JS global variables
%foreign "javascript:lambda:(w) => { globalThis.__counter = 0; return 0; }"
prim__initCounter : PrimIO Int

%foreign "javascript:lambda:(w) => { globalThis.__counter++; return 0; }"
prim__incCounter : PrimIO Int

%foreign "javascript:lambda:(w) => globalThis.__counter"
prim__getCounter : PrimIO Int
```

This works for both `--cg javascript` (browser) and `--cg node` (tests).

### 4. "Mismatch between: IO () and io ()"

**Context**: Mixing polymorphic `HasIO io =>` with concrete `IO ()` in function signatures.

```idris
-- BROKEN
export
handleMessage : HasIO io => RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> io ()
handleMessage msg sender respond = do
  -- ...
  respond result   -- respond : JsValue -> IO ()
  -- Error: Can't unify 'IO ()' with 'io ()'
```

**Root cause**: `respond` has type `JsValue -> IO ()` (concrete `IO`), but the function body is in polymorphic `io` context (from `HasIO io =>`). Idris2 can't unify the concrete `IO` with the abstract `io`.

**Fix**: Use concrete `IO ()` in the function signature instead of `HasIO io =>`:

```idris
-- WORKS
export
handleMessage : RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO ()
```

**General rule**: If any of your callbacks or parameters use concrete `IO`, the whole function should use concrete `IO`. Only use `HasIO io =>` when everything in the function can be polymorphic.

### 5. "%foreign string must be a single line"

**Context**: Trying to write multi-line FFI declarations.

```idris
-- BROKEN (with regular string)
%foreign "javascript:lambda:(w) => {
  var x = 1;
  return x;
}"
prim__foo : PrimIO Int
```

**Root cause**: The `%foreign` directive requires a single-line string literal (or a proper multi-line string).

**Fix**: Use triple-quoted strings or pack everything onto one line:

```idris
-- OPTION 1: Triple-quoted string
%foreign """javascript:lambda:(w) => {
  var x = 1;
  return x;
}"""
prim__foo : PrimIO Int

-- OPTION 2: Single line (preferred for simple functions)
%foreign "javascript:lambda:(w) => { var x = 1; return x; }"
prim__foo : PrimIO Int
```

**Practical note**: For complex JS (like the Haiku API call), single-line strings get very long but work. Use semicolons and ternaries to keep everything on one line. Alternatively, define the complex function as a named JS function in an external file and just reference it in the FFI.

### 6. "Undefined name Main.xxx" / "Not exported"

**Context**: Trying to use a function from another module without proper export.

**Root cause**: Functions default to private in Idris2.

**Fix**: Use `public export` (exposes definition + implementation) or `export` (exposes name only):

```idris
-- Private (default) — only visible in this module
myHelper : Nat -> Nat

-- Export name only — callers can use it but can't pattern match on constructors
export
data Observable : Type -> Type where [external]

-- Export everything — callers can see constructors, use in pattern matching
public export
data BlockReason = FaceDetected | PersonNoFace | CloudBlock
```

**Rule of thumb**:
- `public export` for types, records, constructors, and functions you want fully visible
- `export` for opaque types (like FFI wrappers) where you want to hide internals
- No annotation for internal helpers

### 7. Indentation / Block Errors

**Context**: Various "not the end of a block entry" or "expected end of input" errors.

**Root cause**: Idris2 is indentation-sensitive (like Haskell/Python). Misaligned `let`/`in`, `do`, `case`, or `where` blocks cause parse errors.

**Key rules**:
- `let ... in` in expressions: the `in` must be at the same indentation or less than `let`
- `let` in `do` blocks: NO `in` keyword needed
- `case ... of` branches: must all start at the same column
- `where` block: contents indented further than the parent definition
- `do` blocks: all statements at the same indentation level

```idris
-- CORRECT let-in
learnBlock s url descriptors now =
  let newFaces = map (\d => MkFaceEntry d url now) descriptors
      faces'   = takeLast maxKnownFaces (s.knownFaces ++ newFaces)
  in { knownFaces := faces' } s
--^^-- 'in' aligned with 'let'

-- CORRECT let in do (no 'in')
main = do
  let x = 42
  putStrLn (show x)
--^^-- next statement at same level as 'let'

-- CORRECT case
case msgT of
  "toggle" => handleToggle
  "reset"  => handleReset
  _        => handleUnknown
--^^-- all branches aligned

-- CORRECT where
euclideanDistance a b = sqrt (sumOfSquares a b 0.0)
  where
    sumOfSquares : List Double -> List Double -> Double -> Double
    sumOfSquares [] _ acc = acc
--  ^^^^-- indented past parent
```

---

## Gotchas and Pitfalls

### 1. `Nat` is NOT `Int`

`Nat` is the default for many standard library functions:
- `length : List a -> Nat`
- Range syntax `[0 .. 10]` defaults to `Nat`
- List indices use `Nat`

But `Nat` has limitations:
- No `Integral` instance (no `mod`, `div`)
- No negative values (saturating subtraction: `minus 3 5 = 0`)
- Represented as Church numerals internally — can be slow for large values
- Need explicit `cast` to convert: `cast {to=Double} n`

```idris
-- Disambiguate range type
[the Nat 0 .. 127]        -- List of Nat
[the Int 0 .. 127]        -- List of Int
map (\i => ...) [the Nat 0 .. 127]
```

### 2. Bool in FFI = 0/1, not true/false

Idris `Bool` compiles to JS `0` (False) or `1` (True), NOT `true`/`false`.

```idris
-- If you pass Bool to a JS API that checks truthiness, 1 works (truthy).
-- But if the API does === true, it breaks.

-- Safe: convert in the FFI lambda
%foreign "javascript:lambda:(b, w) => someApi(!!b)"  -- !! converts 0/1 to false/true
prim__callApi : Bool -> PrimIO ()
```

### 3. Callbacks in FFI are Curried

An Idris function `(a -> b -> PrimIO c)` compiles to `f(a)(b)(w)` in JS, not `f(a, b, w)`.

```idris
-- If JS expects f(a, b), you need to adapt:
%foreign "javascript:lambda:(f, w) => something.on((a, b) => f(a)(b)(w))"
prim__onEvent : (String -> Int32 -> PrimIO ()) -> PrimIO ()
```

The `(w)` at the end is the world token — every PrimIO callback needs it.

### 4. `elem` Requires `Eq` Instance

```idris
elem url s.manualBlocklist  -- Works because String has Eq

-- For custom types, you need:
public export
Eq MyType where
  a == b = ...
```

### 5. Record Update Syntax: `{ field := value } record`

Note the space between `}` and the record name, and that the record comes AFTER the braces:

```idris
-- CORRECT
{ blockingEnabled := True } s
{ knownFaces := [], trainingData := [] } s

-- WRONG (common mistake)
s { blockingEnabled := True }     -- Won't work
s.blockingEnabled := True         -- Not valid Idris syntax
```

### 6. No String Interpolation

Idris2 has no template literals or string interpolation. Use `++` for concatenation:

```idris
putStrLn ("Count: " ++ show n ++ " items")
```

### 7. `the` for Type Disambiguation

When Idris2 can't infer a type, use `the`:

```idris
the Int 0           -- literal 0 as Int
the Nat 42          -- literal 42 as Nat
the (List Int) []   -- empty list of Int
[the Nat 0 .. 127]  -- range producing List Nat
```

### 8. `$` Operator (Application)

`$` is function application with lowest precedence (like Haskell):

```idris
primIO $ prim__setApiKey key
-- is the same as:
primIO (prim__setApiKey key)

-- Chains nicely:
assert t $ isBlocked $ resolve a b
```

### 9. case Expression Returns Must Be Same Type

All branches of a `case` expression must return the same type:

```idris
-- This works: all branches return Bool
case analyzeFaces faces of
  Block FaceDetected => True
  Safe MaleOnly      => True
  _                  => False
```

### 10. `Maybe` Forces Explicit Null Handling

There's no implicit null in Idris2. Every "possibly missing" value is `Maybe a`:

```idris
case findNearest query faces of
  Just m  => doSomething m.label
  Nothing => handleMissing

-- Common helpers:
isNothing : Maybe a -> Bool
isJust    : Maybe a -> Bool
fromMaybe : a -> Maybe a -> a
```

### 11. Phantom Types Require `believe_me` or `unsafeCast` at Boundaries

The phantom type pattern (Element Discovered/Pending/Safe/Blocked) is enforced at compile time, but at the boundary with JS you need an unsafe cast:

```idris
-- When you get a raw element from querySelectorAll, cast it:
discovered <- unsafeCastElement rawEl  -- Element () -> Element Discovered
```

The safety guarantee is that after this single unsafe boundary, all subsequent state transitions are type-checked.

### 12. `foldl` vs `foldr` for Large Lists

`foldl` is strict (left fold) — use for accumulating values:
```idris
foldl (\acc, x => acc + x) 0 xs
```

Be careful with `foldr` on large lists (can stack overflow without tail-call optimization).

### 13. Imports Must Be Explicit

Unlike Haskell, Idris2 doesn't re-export by default. If module B imports A, and module C imports B, C does NOT see A's exports. C must also `import A`.

### 14. `where` Functions Can't Access Type Class Constraints

```idris
-- A `where` helper doesn't automatically inherit constraints from the parent
myFunc : Show a => a -> String
myFunc x = helper x
  where
    helper : a -> String   -- Show constraint not available here!
    helper y = show y      -- ERROR
```

Fix: repeat the constraint on the `where` function, or use `let` instead.

### 15. Package Files (.ipkg)

Two types of ipkg files:
```
-- Main library/app (compiles to browser JS)
package shmirat-eynaim
opts = "--cg javascript --directive pretty"
sourcedir = "src"
modules = FFI.Core, Extension.Background, ...

-- Test package (compiles to Node JS)
package shmirat-eynaim-test
opts = "--cg node"
sourcedir = "src"
builddir = "build-test"     -- Separate build dir to avoid conflicts
main = Test.Main
executable = test-runner
```

The `builddir` must be different between packages to prevent `.ttc` file conflicts.

---

## Testing in Idris2 (--cg node)

### Test Architecture

We compile tests with `--cg node` (Node.js backend) and run with `node`. This avoids needing any browser infrastructure for testing pure logic.

```
shmirat-eynaim-idris/
├── src/
│   ├── Test/
│   │   ├── Assert.idr       -- Minimal test harness
│   │   └── Main.idr         -- 105 test cases
│   ├── Extension/
│   │   └── State.idr        -- Pure state logic (what we're testing)
│   └── ...
├── test.ipkg                 -- Test build config
└── build-test/exec/test-runner  -- Compiled test binary
```

### Test Harness Pattern (Without IORef)

Since `Data.IORef` isn't available in bootstrapped Idris2, we use JS globals:

```idris
module Test.Assert

-- Mutable counters via JS FFI
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

-- Unit token type (no state, counters in JS globals)
public export
data TestRunner = MkTestRunner

public export
initTests : IO TestRunner
initTests = do
  _ <- primIO prim__initTests
  pure MkTestRunner

-- Assertions
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
      putStrLn ("  FAIL: " ++ name ++ " (expected " ++ show expected
                ++ ", got " ++ show got ++ ")")

-- Summary and exit (exit code 1 on failure)
public export
summary : TestRunner -> IO ()
summary _ = do
  p <- primIO prim__getPassed
  f <- primIO prim__getFailed
  putStrLn ("\n" ++ show p ++ "/" ++ show (p + f) ++ " tests passed")
  case f of
    0 => pure ()
    _ => primIO (prim__exit 1)
```

### Testing Pure Functions

The key pattern: factor business logic into pure functions (`BgState -> BgState`), then test them with no IO mocking:

```idris
testLearning : TestRunner -> IO ()
testLearning t = do
  section "Learning Handlers"

  let s0 = initBgState   -- Pure initial state
  let s1 = learnBlock s0 "https://example.com/face.jpg" [fakeDescriptor 1] 1000
  let stats = getLearningStats s1
  assertEq t stats.knownFacesCount 1 "learnBlock: 1 face"
  assertEq t stats.trainingDataCount 1 "learnBlock: 1 training entry"
```

No browser, no DOM, no mocking. Pure functions in, pure values out.

### Build and Run

```bash
cd shmirat-eynaim-idris

# Build tests
idris2 --build test.ipkg

# Run tests
node build-test/exec/test-runner

# Expected output:
# Shmirat Eynaim — Idris Test Suite
#
# === Priority Resolution ===
#   PASS: analyzeFaces [] = Safe NoFaceNoPerson
#   PASS: analyzeFaces [(female, 0.95)] = Block
#   ...
# 105/105 tests passed
```

### Test Data Generators

For 128-dimensional face descriptors, use deterministic generation:

```idris
fakeDescriptor : Nat -> List Double
fakeDescriptor seed =
  map (\i => sin (cast seed * 100.0 + cast i) * 0.5) [the Nat 0 .. 127]
```

This produces unique, reproducible vectors for each seed value.

---

## Practical FFI Patterns

### Pattern 1: Global Mutable State

When the extension needs mutable state accessible from multiple handlers:

```idris
-- Initialize state object on window
%foreign "javascript:lambda:(w) => { window.__seState = { enabled: true, count: 0 }; }"
prim__initState : PrimIO ()

-- Read state fields
%foreign "javascript:lambda:(w) => window.__seState.enabled"
prim__getEnabled : PrimIO Bool

-- Mutate state
%foreign "javascript:lambda:(w) => { window.__seState.count++; }"
prim__incrementCount : PrimIO ()
```

### Pattern 2: Passing Idris Callbacks to JS Event Systems

```idris
-- browser.runtime.onMessage.addListener
%foreign "javascript:lambda:(handler, w) => { browser.runtime.onMessage.addListener(function(msg, sender, sendResponse) { handler(msg)(sender)(function(resp) { sendResponse(resp); return 0; })(w); return true; }); }"
prim__onMessage : (RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> PrimIO ())
               -> PrimIO ()

-- Note the callback chain: handler(msg)(sender)(respond)(w)
-- Each argument is applied separately (curried)
-- The inner respond callback is wrapped to match JS sendResponse
```

### Pattern 3: Fire-and-Forget Async (No Promise Handling)

For operations where you don't need the result (e.g., saving to storage):

```idris
-- Just call the async function, ignore the promise
%foreign "javascript:lambda:(w) => { browser.storage.local.set({key: 'value'}).catch(function(e) { console.error(e); }); }"
prim__saveState : PrimIO ()

-- In Idris:
handleToggle = do
  primIO prim__toggle
  primIO prim__saveState    -- fire and forget
  respond result
```

### Pattern 4: Wrapping a JS Library (RxJS, face-api.js)

1. Define opaque external types
2. Write creation/destruction FFI functions
3. Write operator FFI functions
4. Wrap in safe Idris functions with `HasIO io =>` constraint

```idris
-- Step 1: Opaque type
export
data Observable : Type -> Type where [external]

-- Step 2: Creation
%foreign "javascript:lambda:(x, w) => rxjs.of(x)"
prim__of : a -> PrimIO (Observable a)

export
ofValue : HasIO io => a -> io (Observable a)
ofValue x = primIO $ prim__of x

-- Step 3: Operators
%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.map(x => f(x)))"
prim__mapObs : (a -> b) -> Observable a -> PrimIO (Observable b)

export
mapObs : HasIO io => (a -> b) -> Observable a -> io (Observable b)
mapObs f obs = primIO $ prim__mapObs f obs
```

### Pattern 5: Type-Safe State Machine via Phantom Types

See `FFI/DOM/Element.idr` for the full pattern. Key idea:

```idris
-- State transitions consume the old type and produce the new type
markPending  : Element Discovered -> IO (Element Pending)   -- D -> P
markSafe     : Element Pending    -> IO (Element Safe)      -- P -> S
markBlocked  : Element Pending    -> IO (Element Blocked)   -- P -> B

-- Override transitions (for later reclassification)
overrideToBlocked : Element Safe    -> IO (Element Blocked)  -- S -> B
overrideToSafe    : Element Blocked -> IO (Element Safe)     -- B -> S

-- Function that only accepts elements in the right state
getImageSrc : Element Discovered -> IO ImageUrl  -- Only Discovered!
```

Compile-time guarantee: you cannot read the URL after marking pending.

---

## Build Commands Reference

```bash
cd shmirat-eynaim-idris

# Compile background script (browser JS)
idris2 --cg javascript --source-dir src -o background-idris.js src/Extension/Background.idr

# Compile content script
idris2 --cg javascript --source-dir src -o content-idris.js src/Extension/Content.idr

# Compile popup script
idris2 --cg javascript --source-dir src -o popup-idris.js src/Extension/Popup.idr

# Build and run tests
idris2 --build test.ipkg
node build-test/exec/test-runner

# Output locations:
# build/exec/background-idris.js  → copy to shmirat-eynaim/background-idris.js
# build/exec/content-idris.js     → copy to shmirat-eynaim/content-idris.js
# build/exec/popup-idris.js       → copy to shmirat-eynaim/popup/popup-idris.js
```

### PATH Requirements (Windows/MSYS2)

```bash
export PATH="/home/natanh/Idris2/build/exec:$PATH"  # idris2 binary
export PATH="/c/Users/natanh/tools/node:$PATH"       # node binary
```

