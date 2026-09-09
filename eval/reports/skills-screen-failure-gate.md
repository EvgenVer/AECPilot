# Capabilities: one failed request blanks all of its tabs, including the ones that loaded

**Component:** `apps/desktop` — Capabilities screen (`src/app/skills/index.tsx`)
**Versions checked:** every release in the pinned checkout — v2026.8.13 through v2026.8.27, and `29112bef` (v2026.8.31, 0.21.0). Present in all
**Severity:** the Tools tab becomes unreachable when an unrelated request fails; the panel names the wrong subsystem
**Report status:** written 2026-09-09 for upstream; not filed by us — see "Handover".

---

## Summary

The Capabilities screen loads two independent resources with two independent queries:

* `getSkills()` → `GET /api/skills` (`src/api/skills.ts:13`)
* `getToolsets()` → `GET /api/tools/toolsets` (`src/api/toolsets.ts:17`)

Both feed a single failure gate that sits **above** the tab switch, so either failure
replaces the body of **both** the Skills and the Tools tab with the same
"Skills failed to load" panel — even on the tab whose own data arrived intact.

The tab strip is rendered outside that gate, so the screen contradicts itself: the
tab header shows a real count (`Tools 1`) next to a panel claiming nothing loaded.

## Impact

The Tools tab is where a toolset's provider is configured — the web-search and
web-extract providers among them. When `/api/skills` fails for a reason that has
nothing to do with tools — an older backend that does not serve the route, a
permission error, a profile whose gateway is unreachable — the door to tool
configuration is closed by that unrelated failure. There is no way past the panel
except making the *other* request succeed.

The symmetric case is worse for a different reason. When `/api/tools/toolsets` is the
half that fails, the panel still reads "Skills failed to load" (`i18n/en.ts:1289`),
and its `description` is `skillsError`, which in that case is `undefined` — so the
screen names a subsystem that is fine and gives no detail about the one that is not.

## Affected code (line numbers as of `29112bef`, v2026.8.31 / 0.21.0)

`apps/desktop/src/app/skills/index.tsx:301-315` — the two independent queries:

```tsx
const {
  data: skills,
  isError: skillsFailed,
  error: skillsError
} = useQuery({ queryKey: [...SKILLS_QUERY_KEY, scopeKey], queryFn: () => getSkills(scopeProfile), staleTime: 0 })

const { data: toolsets, isError: toolsetsFailed } = useQuery({
  queryKey: [...TOOLSETS_QUERY_KEY, scopeKey],
  queryFn: () => getToolsets(scopeProfile),
  staleTime: 0
})
```

`apps/desktop/src/app/skills/index.tsx:779-783` — the tab strip, outside the gate:

```tsx
tabs={[
  { id: 'skills', label: t.skills.tabSkills, meta: skills?.length ?? null },
  { id: 'toolsets', label: t.skills.tabToolsets, meta: toolsets ? visibleToolsetCount(toolsets) : null },
  { id: 'mcp', label: t.skills.tabMcp }
]}
```

`apps/desktop/src/app/skills/index.tsx:799-812` — the gate itself. Both conditions
mix the two resources with `||`:

```tsx
) : (skillsFailed || toolsetsFailed) && (!skills || !toolsets) ? (
  <PanelEmpty
    action={<Button onClick={() => void refreshCapabilities()} size="sm">{t.skills.refresh}</Button>}
    description={skillsError instanceof Error ? skillsError.message : undefined}
    icon="error"
    title={t.skills.skillsLoadFailed}
  />
) : !skills || !toolsets ? (
  <PageLoader label={t.skills.loading} />
) : mode === 'skills' ? (
```

The MCP tab is unaffected: its branch sits above this one.

## Reproduction

1. Serve `GET /api/tools/toolsets` normally, with at least one toolset.
2. Make `GET /api/skills` fail (500, or any status the client rejects).
3. Open Capabilities and switch to the **Tools** tab.

**Expected:** the toolsets list, since its request succeeded.
**Actual:** the "Skills failed to load" panel, on a tab whose header reads `Tools 1`.

Reverse the two (skills fine, toolsets failing) and open the **Skills** tab: same
panel, same title, and no error text at all, because `skillsError` is `undefined`.

This is not hypothetical for us: we run the screen against our own mock gateway,
which served `/api/tools/toolsets` but not yet `/api/skills`. The Tools tab came up
blank, and for half an hour it read as "the tab click does not switch tabs" — the
tab was switching fine. The counter next to the empty panel is what pointed at the
gate.

## Why the current tests stay green

`apps/desktop/src/app/skills/index.test.tsx` has 11 tests and every one of them
resolves both queries (`getSkills.mockResolvedValue(...)`, `getToolsets.mockResolvedValue(...)`).
No test rejects either query, so the failure branch is never entered — and the branch
that is never entered is exactly the one that cannot tell the two resources apart.

## Suggested fix

Gate on the resource the **active tab** actually needs. Both branches need it: fixing
only the error branch moves the Tools tab from a wrong error panel to a loader that
never resolves, because `!skills` still holds there.

```tsx
const tabFailed = mode === 'skills' ? skillsFailed : toolsetsFailed
const tabData = mode === 'skills' ? skills : toolsets
const tabError = mode === 'skills' ? skillsError : toolsetsError // needs `error:` on the toolsets query

) : tabFailed && !tabData ? (
  <PanelEmpty
    action={<Button onClick={() => void refreshCapabilities()} size="sm">{t.skills.refresh}</Button>}
    description={tabError instanceof Error ? tabError.message : undefined}
    icon="error"
    title={mode === 'skills' ? t.skills.skillsLoadFailed : t.skills.toolsetsLoadFailed}
  />
) : !tabData ? (
  <PageLoader label={t.skills.loading} />
) : mode === 'skills' ? (
```

Two small additions this needs: `error: toolsetsError` on the toolsets query, and a
`toolsetsLoadFailed` string — `i18n/en.ts` has no equivalent of `skillsLoadFailed`
for toolsets today, which is itself a hint that this case was never rendered.

The empty-state helper `capabilityEmpty('tools')` further down already distinguishes
the two tabs, so the screen's own vocabulary supports the split.

## Version evidence

Blob hashes of `apps/desktop/src/app/skills/index.tsx` in the pinned checkout:

| release | blob | gate present |
|---|---|---|
| v2026.8.13 | `9335d293dc38` | yes (line 572) |
| v2026.8.16 / v2026.8.16.2 | `5f12039c01ac` | yes |
| v2026.8.18 | `cc895b7cfbf9` | yes |
| v2026.8.19 / v2026.8.27 | `464d84e928f4` | yes |
| `29112bef` (v2026.8.31) | `fc24be915761` | yes (line 799) |

The file changed four times across that range; the gate's text
(`(skillsFailed || toolsetsFailed) && (!skills || !toolsets)`) is identical in all of
them, only its line number moves.

## Handover

This report was prepared by the AECPilot team, which vendors Hermes Desktop files
verbatim and does not patch them toward a local fix — a patch here would be dropped
at the next re-copy and would only help one product. Filing upstream is the owner's
decision and the owner's action; nothing was sent from here.

This is the second such report; the first is `a2a-signature-defect.md` in the same
folder.
