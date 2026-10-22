import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { projectFolderOf, projectParts, projectShareText, shareState, workspaceParts, workspaceShareText, type ShareCheck } from '@/services/sharing'
import type { Project } from '@/types'

/**
 * Si può condividere con gli altri membri? Il workspace e i suoi progetti se
 * la cartella Dati è in rete (le cartelle dei progetti possono stare anche in
 * locale, con lo stesso percorso su ogni PC; vedi services/sharing.ts). Conta
 * solo nei workspace di rete: in locale c'è un solo utente.
 */
export function useSharing() {
  const ws = useWorkspaceStore()
  const dataPath = computed(() => ws.storage?.root ?? '')

  const workspace = computed<ShareCheck>(() => shareState(workspaceParts(dataPath.value, ws.projectsRoot)))
  const workspaceText = computed(() => (ws.isNetwork ? workspaceShareText(workspace.value) : ''))

  const project = (p: Pick<Project, 'name' | 'stack'>): ShareCheck => shareState(projectParts(dataPath.value, projectFolderOf(p, ws.projectsRoot)))
  /** Perché il progetto non si può condividere ('' se si può, o se il controllo è in corso). */
  const projectText = (p: Pick<Project, 'name' | 'stack'>) => (ws.isNetwork ? projectShareText(project(p)) : '')

  return { dataPath, workspace, workspaceText, project, projectText }
}
