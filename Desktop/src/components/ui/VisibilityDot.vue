<script setup lang="ts">
import { computed } from 'vue'
import { projectVisibility, type Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { public: 'Visibilità pubblica: visibile a tutti i membri del workspace', restricted: 'Visibilità limitata: visibile solo agli utenti scelti' },
  en: { public: 'Public visibility: visible to every workspace member', restricted: 'Restricted visibility: visible only to the chosen users' },
})

/** Pallino della visibilità del progetto: verde pubblica, arancione limitata. */
const props = defineProps<{ project: Pick<Project, 'visibility' | 'members'> }>()
const restricted = computed(() => projectVisibility(props.project) === 'restricted')
</script>

<template>
  <span
    class="inline-block h-2 w-2 shrink-0 rounded-full"
    :class="restricted ? 'bg-p-alta' : 'bg-ok'"
    :title="restricted ? m.restricted : m.public"
    :aria-label="restricted ? m.restricted : m.public"
    role="img"
    :data-visibility="restricted ? 'restricted' : 'public'"
  />
</template>
