<script setup lang="ts">
import { ref } from 'vue'
import dayjs from 'dayjs'
import { Trash2 } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import MentionTextarea from './MentionTextarea.vue'
import RichText from './RichText.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Item } from '@/types'

const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const draft = ref('')

async function send() {
  const t = draft.value.trim()
  if (!t) return
  draft.value = ''
  await ws.addComment(props.projectId, props.item.id, t)
}
const canDelete = (authorId: string) => !props.readOnly && (ws.isAdmin || authorId === ws.currentUser?.id)
</script>

<template>
  <section>
    <h3 class="mb-2 text-[13px] font-semibold text-ink-2">Commenti <span class="tabular-nums text-ink-3">{{ item.comments.length || '' }}</span></h3>
    <ul class="space-y-3">
      <li v-for="c in item.comments" :key="c.id" class="group flex gap-2.5">
        <UserAvatar :name="ws.userName(c.authorId)" size="sm" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 text-[12px]">
            <span class="font-semibold text-ink">{{ ws.userName(c.authorId) }}</span>
            <span class="text-ink-3" :title="dayjs(c.createdAt).format('D MMM YYYY HH:mm')">{{ dayjs(c.createdAt).fromNow() }}</span>
            <button
              v-if="canDelete(c.authorId)"
              class="ml-auto rounded p-0.5 text-ink-3 opacity-0 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
              title="Elimina commento"
              @click="ws.deleteComment(projectId, item.id, c.id)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
          <p class="text-[13.5px] leading-relaxed"><RichText :text="c.text" /></p>
        </div>
      </li>
    </ul>
    <p v-if="readOnly && !item.comments.length" class="text-[12.5px] text-ink-3">Nessun commento.</p>
    <div v-if="!readOnly" class="mt-3 flex gap-2.5">
      <UserAvatar :name="ws.currentUser?.displayName ?? '?'" size="sm" class="mt-1.5" />
      <div class="flex-1">
        <MentionTextarea v-model="draft" :placeholder="ws.isNetwork ? 'Scrivi un commento, @ per taggare' : 'Scrivi un commento'" @submit="send" />
        <p class="mt-1 text-[11.5px] text-ink-3">Invio per pubblicare, Shift+Invio per andare a capo</p>
      </div>
    </div>
  </section>
</template>
