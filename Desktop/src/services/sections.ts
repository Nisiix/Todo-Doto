/**
 * Sezioni di un progetto, aperte dal sottomenu del progetto nella barra
 * laterale, in quest'ordine: Stack (con gli strumenti AI), Todo, Gantt, Allegati. Il parametro di
 * rotta è `p/:id/:section?` (vuoto = Todo).
 */
export const PROJECT_SECTIONS = ['stack', 'todo', 'gantt', 'attachments'] as const
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

/** Sezione dal parametro di rotta; `ai` (versioni precedenti) è ora dentro Stack. */
export function projectSection(param: string | undefined | null): ProjectSection {
  if (param === 'ai') return 'stack'
  return (PROJECT_SECTIONS as readonly string[]).includes(param ?? '') ? (param as ProjectSection) : 'todo'
}

/** Parametro di rotta per una sezione (Todo è la pagina predefinita del progetto). */
export const sectionParam = (s: ProjectSection) => (s === 'todo' ? '' : s)
