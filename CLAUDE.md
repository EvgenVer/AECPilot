@AGENTS.md

<!-- CLAUDE.md is Claude Code's entry file: Claude Code loads CLAUDE.md, not AGENTS.md.
     The @AGENTS.md import above pulls the cross-tool router into context at session start,
     so every tool shares one authoritative source of rules with zero duplication here.
     Codex and Antigravity read AGENTS.md natively; only Claude Code needs this shim.
     A symlink is NOT used: on Windows it needs admin/Developer Mode and git does not
     preserve it on checkout. Add Claude-Code-specific instructions below this comment if
     any are ever needed. -->
