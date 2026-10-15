---
name: docs-maintenance
description: Update user instructions when installation, configuration, usage, or verification commands change.
---

# Maintain user instructions

Identify the changed user-visible behavior and update only its relevant instructions:
prerequisites, commands, expected inputs/outputs, and actionable failure guidance.
Use a CHANGELOG only when the project already uses one or the user requests it.

Check that documented commands/paths match the implemented interface. Distinguish
examples from executed results. Explain limitations in the user's terms without
copying internal implementation ceremony into product flows.

Keep project idea/requirements/route/progress in their owning documents; do not
duplicate them in README or reopen planning for an ordinary usage-doc correction.
Toolkit guides belong in .agents/docs; project documentation remains project-owned.
Inspect the final diff and return to the shared workflow.
