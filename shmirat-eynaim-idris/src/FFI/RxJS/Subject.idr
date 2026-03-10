-- FFI.RxJS.Subject — Subject and ReplaySubject bindings

module FFI.RxJS.Subject

import FFI.Core
import FFI.RxJS.Observable

---------------------------------------------------------------------------
-- Subject (multicast Observable + Observer)
---------------------------------------------------------------------------

||| An RxJS Subject that can both emit and be subscribed to.
export
data Subject : Type -> Type where [external]

%foreign "javascript:lambda:(w) => new rxjs.Subject()"
prim__newSubject : PrimIO (Subject a)

%foreign "javascript:lambda:(subj, val, w) => subj.next(val)"
prim__next : Subject a -> a -> PrimIO ()

%foreign "javascript:lambda:(subj, w) => subj.complete()"
prim__complete : Subject a -> PrimIO ()

%foreign "javascript:lambda:(subj, err, w) => subj.error(err)"
prim__error : Subject a -> String -> PrimIO ()

-- | A Subject is also an Observable — upcast it.
%foreign "javascript:lambda:(subj, w) => subj.asObservable()"
prim__asObservable : Subject a -> PrimIO (Observable a)

export
newSubject : HasIO io => io (Subject a)
newSubject = primIO prim__newSubject

export
next : HasIO io => Subject a -> a -> io ()
next subj val = primIO $ prim__next subj val

export
complete : HasIO io => Subject a -> io ()
complete subj = primIO $ prim__complete subj

export
subjectError : HasIO io => Subject a -> String -> io ()
subjectError subj err = primIO $ prim__error subj err

export
asObservable : HasIO io => Subject a -> io (Observable a)
asObservable subj = primIO $ prim__asObservable subj

---------------------------------------------------------------------------
-- ReplaySubject (replays N most recent values to new subscribers)
---------------------------------------------------------------------------

||| An RxJS ReplaySubject with a buffer of size `n`.
export
data ReplaySubject : Type -> Type where [external]

%foreign "javascript:lambda:(n, w) => new rxjs.ReplaySubject(n)"
prim__newReplaySubject : Int32 -> PrimIO (ReplaySubject a)

%foreign "javascript:lambda:(subj, val, w) => subj.next(val)"
prim__replayNext : ReplaySubject a -> a -> PrimIO ()

%foreign "javascript:lambda:(subj, w) => subj.complete()"
prim__replayComplete : ReplaySubject a -> PrimIO ()

%foreign "javascript:lambda:(subj, w) => subj.asObservable()"
prim__replayAsObservable : ReplaySubject a -> PrimIO (Observable a)

export
newReplaySubject : HasIO io => Int32 -> io (ReplaySubject a)
newReplaySubject n = primIO $ prim__newReplaySubject n

export
replayNext : HasIO io => ReplaySubject a -> a -> io ()
replayNext subj val = primIO $ prim__replayNext subj val

export
replayComplete : HasIO io => ReplaySubject a -> io ()
replayComplete subj = primIO $ prim__replayComplete subj

export
replayAsObservable : HasIO io => ReplaySubject a -> io (Observable a)
replayAsObservable subj = primIO $ prim__replayAsObservable subj
