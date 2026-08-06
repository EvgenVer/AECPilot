// Which of the two applications is on screen.
//
// The donor's app assumes a working directory exists; ours will not give the
// agent one until the user has chosen a vault (SPEC: the agent's working dir IS
// the vault). So the gate is a hard either/or rather than a screen inside their
// shell: no project → our Welcome; project open → their application, and there
// is no way back, exactly as before the migration.

import { type ReactNode, useEffect, useState } from 'react'

import Welcome from './Welcome'

export function ProjectGate({ children }: { children: ReactNode }) {
  const [hasProject, setHasProject] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    const unsubscribe = window.aecpilot.onProjectOpened(() => setHasProject(true))

    void window.aecpilot.getCurrentProject().then((project) => {
      // The read races the unmount, and it also races the push above: a project
      // opened while this promise was in flight must not be overwritten by the
      // stale "no project" it resolves with.
      if (mounted) setHasProject((current) => current ?? project !== null)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // `undefined` is "main has not answered yet". Painting Welcome during that
  // gap would flash the wrong screen at every start with a project already
  // open, which is the common case.
  if (hasProject === undefined) return null
  if (!hasProject) return <Welcome />

  return <>{children}</>
}
