<script setup lang="ts">
import { formatMarkdown } from '~/utils/markdown'

const { isOpen, isExpanded, isWaiting, showSuggestions, messages, toggleOpen, toggleExpanded, sendMessage } = useAiAssistant()

const inputValue = ref('')
const messagesEl = ref<HTMLElement | null>(null)

async function handleSend() {
  const text = inputValue.value
  inputValue.value = ''
  await sendMessage(text)
}

function handleSuggestion(query: string) {
  sendMessage(query)
}

watch([messages, isWaiting], async () => {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}, { deep: true })

watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    document.getElementById('ai-chat-input')?.focus()
  }
})
</script>

<template>
  <div class="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-2 scale-95"
    >
      <div
        v-if="isOpen"
        class="flex flex-col bg-white dark:bg-[var(--color-card-dark)] rounded-2xl shadow-2xl border border-[var(--color-border)] dark:border-white/[0.08] overflow-hidden origin-bottom-right transition-[width,height] duration-200"
        :class="isExpanded ? 'w-[min(92vw,480px)] h-[min(85vh,680px)]' : 'w-[min(92vw,380px)] h-[min(75vh,560px)]'"
      >
        <div class="flex items-center justify-between px-4 py-3 bg-primary-900 text-white shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="flex items-center justify-center size-9 rounded-full bg-white/10 text-lg">🎓</div>
            <div class="flex flex-col leading-tight">
              <span class="font-semibold text-sm">SalomKorea AI</span>
              <span class="text-[11px] text-white/70">Maslahatchi · Online</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="flex items-center justify-center size-7 rounded-lg hover:bg-white/10 transition-colors" aria-label="Kengaytirish" @click="toggleExpanded">
              <UIcon :name="isExpanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="size-4" />
            </button>
            <button type="button" class="flex items-center justify-center size-7 rounded-lg hover:bg-white/10 transition-colors" aria-label="Yopish" @click="toggleOpen">
              <UIcon name="i-lucide-x" class="size-4.5" />
            </button>
          </div>
        </div>

        <div ref="messagesEl" class="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[var(--color-bg)] dark:bg-[var(--color-bg-dark)]">
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed prose-chat"
              :class="msg.role === 'user'
                ? 'bg-primary-900 text-white rounded-br-md'
                : 'bg-white dark:bg-white/5 text-[var(--color-text-primary)] dark:text-white border border-[var(--color-border)] dark:border-white/[0.08] rounded-bl-md'"
            >
              <span v-if="msg.role === 'user'">{{ msg.content }}</span>
              <div v-else v-html="formatMarkdown(msg.content)" />
            </div>
          </div>

          <div v-if="isWaiting" class="flex justify-start">
            <div class="rounded-2xl rounded-bl-md px-4 py-3 bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/[0.08]">
              <div class="flex items-center gap-1">
                <span v-for="i in 3" :key="i" class="size-1.5 rounded-full bg-[var(--color-text-secondary)] animate-bounce" :style="{ animationDelay: `${i * 0.12}s` }" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="showSuggestions" class="flex flex-wrap gap-1.5 px-4 py-2.5 border-t border-[var(--color-border)] dark:border-white/[0.08] shrink-0">
          <button
            v-for="s in AI_SUGGESTIONS"
            :key="s.query"
            type="button"
            class="text-[11.5px] font-medium px-2.5 py-1.5 rounded-sm bg-primary-700 text-white hover:bg-primary-800 transition-colors"
            @click="handleSuggestion(s.query)"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="flex items-center gap-2 px-3 py-3 border-t border-[var(--color-border)] dark:border-white/[0.08] shrink-0">
          <input
            id="ai-chat-input"
            v-model="inputValue"
            type="text"
            maxlength="1000"
            placeholder="Savolingizni yozing..."
            class="flex-1 min-w-0 rounded-md bg-neutral-100 dark:bg-white/5 px-3.5 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-primary-500/30 text-[var(--color-text-primary)] dark:text-white placeholder:text-[var(--color-text-secondary)]"
            @keydown.enter="handleSend"
          >
          <button
            type="button"
            class="flex items-center justify-center size-9 rounded-md bg-primary-900 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0 hover:bg-primary-800 transition-colors"
            :disabled="!inputValue.trim() || isWaiting"
            aria-label="Yuborish"
            @click="handleSend"
          >
            <UIcon name="i-lucide-send" class="size-4" />
          </button>
        </div>
        <p class="px-4 pb-2.5 text-[10.5px] text-[var(--color-text-secondary)] shrink-0">
          ⚠️ AI xato qilishi mumkin. Ma'lumotlarni ikki marta tekshiring.
        </p>
      </div>
    </Transition>

    <button
      type="button"
      class="flex items-center justify-center size-14 rounded-full bg-primary-900 text-white shadow-lg hover:bg-primary-800 hover:scale-105 active:scale-95 transition-all"
      aria-label="Suhbatni boshlash"
      @click="toggleOpen"
    >
      <UIcon :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-message-circle'" class="size-6" />
    </button>
  </div>
</template>

<style scoped>
.prose-chat :deep(ul) { padding-left: 1.1em; margin: 0.4em 0; }
.prose-chat :deep(li) { margin: 0.15em 0; }
.prose-chat :deep(strong) { font-weight: 600; }
.prose-chat :deep(p) { margin: 0.4em 0; }
.prose-chat :deep(p:first-child) { margin-top: 0; }
.prose-chat :deep(p:last-child) { margin-bottom: 0; }
.prose-chat :deep(table) { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 12.5px; }
.prose-chat :deep(th), .prose-chat :deep(td) { border: 1px solid var(--color-border); padding: 4px 8px; text-align: left; }
.prose-chat :deep(th) { background: rgba(0,0,0,0.03); font-weight: 600; }
</style>
