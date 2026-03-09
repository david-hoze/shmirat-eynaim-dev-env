# Multi-Agent Coordination

You are one of multiple Claude Code agents working in this repository.
A coordination tool `claude-collab` is available in your PATH.

## Automatic registration

A SessionStart hook (`session-start-init.sh`) automatically runs `claude-collab init` when your session begins, using a name derived from your session ID (e.g. `agent-a3f8b201`). You do NOT need to register manually.

## Messaging

Use **Claude Code's native messaging system** to communicate with other agents. Do NOT use `claude-collab send` or `claude-collab read` \x2014 those are deprecated.

## Shared working directory

All agents run in the same repository directory. When another agent commits or pushes, you already have the changes on disk \x2014 do NOT run `git pull` or `git fetch`. Just read the files directly. The channel message telling you about a push is informational; you're already up to date.

## Hooks \x2014 automatic init, claim, and cleanup

Three hooks in `.claude/hooks/` automate the collaboration workflow:

- **`session-start-init.sh`** (SessionStart) \x2014 automatically runs `claude-collab init` to register the agent.
- **`pre-edit-claim.sh`** (PreToolUse on Edit|Write) \x2014 automatically runs `claude-collab files claim` before every file edit. You do NOT need to manually claim files.
- **`session-end-cleanup.sh`** (SessionEnd) \x2014 automatically runs `claude-collab cleanup` when your session ends. You do NOT need to manually clean up.

**What you still do manually:**
- `claude-collab commit $HASH -m "message"` when you're done with your feature \x2014 commit deliberately, not after every edit

## The one rule

**Commit through the tool.** Run `claude-collab commit $HASH -m "message"` instead of raw git. NEVER run `git add`, `git commit`, or `git checkout` directly.

## The workflow: edit \x2192 commit

```
# ... edit files ...                          # 1. Edit (claim is automatic via hook)
claude-collab commit $HASH -m "message"       # 2. Commit when feature is done (stages, commits, and unclaims)
```

`commit` automatically unclaims the committed files \x2014 you do NOT need to run `files unclaim` afterward. Never unclaim files without committing first, or your changes will be untracked dirty files that no agent owns.

## When a claim is rejected

If `files claim` fails because another agent has the file:

1. Message the other agent using Claude Code's native messaging to negotiate who edits what, or whether to co-claim.
2. Once agreed, co-claim:
```
claude-collab files claim $HASH <file> --shared
```

## Committing shared files

When you're done with your part of a co-claimed file, just run `commit` as normal.

- If the other agent isn't done yet, your files will be **staged** (git add) and you're free to work on other things.
- You can keep claiming and committing new files even while waiting \x2014 only the already-staged files are held back.
- When the last agent runs `commit`, the actual git commit happens with everyone's changes included.

You don't need to wait. You don't need to coordinate the commit timing. Just `commit` when you're done and move on.

## Shared resources

Some operations are physically exclusive \x2014 only one agent can run them at a time.
Run `claude-collab reservations` to check what's available.

Before running tests, builds, or package installs:
```
claude-collab reserve $HASH test
npm test
claude-collab release $HASH test
```

If the resource is busy, the command waits until it's free. Always release when done.

If the resource's TTL has expired (stale reservation), `reserve` will **fail** and name the holder \x2014 it will NOT auto-take over. When this happens:

1. **Message the holder** using `SendMessage` \x2014 ask if they're done, or ask them to run your task while they still have the resource (smarter than waiting for a handoff).
2. Wait for their response.
3. Once they release, retry `claude-collab reserve`.

Never try to work around a stale reservation. The holder may still be actively using it (TTL was just too short).

If you need to release and immediately re-reserve (e.g., running tests again), use `--renew` to do it atomically:
```
claude-collab reserve $HASH test --renew
```
This avoids a race condition where another agent grabs the resource between your `release` and `reserve`.

## When you're done

Don't clean up immediately if other agents are still working \x2014 check for messages first and see if there are any help requests you can handle. Once everything is settled, you're done.
