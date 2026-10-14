import { reactive } from 'vue'
import { common } from '@/i18n/common'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((v: boolean) => void) | null
}

export const confirmState = reactive<ConfirmState>({ open: false, title: '', resolve: null })

/** Mostra un dialog di conferma e risolve true/false. */
export function useConfirm() {
  return (opts: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      confirmState.resolve?.(false)
      Object.assign(confirmState, { confirmLabel: common.actions.confirm, danger: false, message: '' }, opts, { open: true, resolve })
    })
}

export function settleConfirm(value: boolean) {
  confirmState.open = false
  confirmState.resolve?.(value)
  confirmState.resolve = null
}
