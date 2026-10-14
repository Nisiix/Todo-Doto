import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { Check, RotateCcw, Trash2, Undo2, X } from 'lucide-vue-next'
import type { MenuItem } from '@/components/ui/BaseMenu.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from './useConfirm'
import { firstLine } from '@/services/items'
import type { Item } from '@/types'

/**
 * Le azioni su un elemento (completa, riapri, cestina con "Annulla", elimina
 * definitivamente) e il menu che le espone, in un unico posto: riga della
 * lista, pannello di dettaglio e scorciatoie da tastiera usano questo, così
 * permessi, conferme e messaggi sono sempre gli stessi.
 */
export function useItemActions(item: MaybeRefOrGetter<Item>, projectId: MaybeRefOrGetter<string>, readOnly: MaybeRefOrGetter<boolean | undefined> = false) {
  const ws = useWorkspaceStore()
  const ui = useUiStore()
  const confirm = useConfirm()
  const it = () => toValue(item)
  const pid = () => toValue(projectId)

  const locked = computed(() => !!toValue(readOnly))
  const canComplete = computed(() => !locked.value && it().bucket === 'todo')
  const canReopen = computed(() => !locked.value && it().bucket !== 'todo')
  const canTrash = computed(() => !locked.value && it().bucket !== 'trash' && ws.canTrashItem(it()))
  const canDelete = computed(() => !locked.value && it().bucket === 'trash' && ws.canPurge)

  const complete = () => ws.moveItem(pid(), it().id, 'done')
  const reopen = () => ws.moveItem(pid(), it().id, 'todo')
  function trash() {
    const id = it().id
    const p = pid()
    ws.moveItem(p, id, 'trash')
    ui.toast('Spostato nel cestino', 'info', { label: 'Annulla', run: () => ws.moveItem(p, id, 'todo') })
  }
  async function deleteForever() {
    const ok = await confirm({
      title: `Eliminare definitivamente «${firstLine(it().title)}»?`,
      message: 'Commenti, domande e tutto il resto andranno persi. Non si può annullare.',
      confirmLabel: 'Elimina per sempre',
      danger: true,
    })
    if (ok) {
      if (ui.selectedItemId === it().id) ui.selectedItemId = null
      await ws.deleteItemForever(pid(), it().id)
    }
  }

  /** Voci del menu "⋯", in base a contenitore e permessi. */
  const menu = computed<MenuItem[]>(() => {
    if (locked.value) return []
    const b = it().bucket
    const trashEntry: MenuItem[] = canTrash.value ? [{ label: 'Sposta nel cestino', icon: Trash2, danger: true, onSelect: trash }] : []
    if (b === 'todo') return [{ label: 'Segna come completato', icon: Check, onSelect: complete }, ...trashEntry]
    if (b === 'done') return [{ label: 'Riapri', icon: Undo2, onSelect: reopen }, ...trashEntry]
    return [
      { label: 'Ripristina in Da fare', icon: RotateCcw, onSelect: reopen },
      ...(canDelete.value ? [{ label: 'Elimina definitivamente', icon: X, danger: true, onSelect: deleteForever } satisfies MenuItem] : []),
    ]
  })

  /**
   * Scorciatoie sull'elemento (quando la riga ha il fuoco): C completa o
   * riapre, Canc sposta nel cestino. Restituisce true se il tasto è stato usato.
   */
  function handleKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const k = e.key.toLowerCase()
    if (k === 'c') {
      if (canComplete.value) complete()
      else if (canReopen.value) reopen()
      else return false
      return true
    }
    if (e.key === 'Delete') {
      if (!canTrash.value) return false
      trash()
      return true
    }
    return false
  }

  return { canComplete, canReopen, canTrash, canDelete, complete, reopen, trash, deleteForever, menu, handleKey }
}
