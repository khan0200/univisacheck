import type { ChatMessage } from '~/types/ai-assistant'

const WELCOME_MESSAGE = 'Salom! Men Janubiy Koreya bo\'yicha SalomKorea AI maslahatchisiman. 🇰🇷\n\nKoreyada o\'qish, universitet tanlash, viza olish tartibi (D-2/D-4), grantlar va zarur hujjatlar bo\'yicha savollaringizga javob bera olaman.'

export const AI_SUGGESTIONS = [
  { label: '🧮 Viza Kalkulyator', query: 'Viza imkoniyat kalkulyatori boshlash' },
  { label: '🥇 1% Universitetlar', query: 'Qaysi universitetlar 1% yengillashtirilgan?' },
  { label: '📊 IELTS 5.5 Grantlar', query: 'IELTS 5.5 bilan qanday grantlar bor?' },
  { label: '🛂 Viza Hujjatlari', query: 'Viza olish uchun qanday hujjatlar kerak?' },
  { label: '💰 Bankshot nima?', query: 'Bankshot va KDB bank ma\'lumotnomasi nima?' }
]

/** Chat widget state/orchestration — shared singleton so the floating widget persists across page navigations. */
export function useAiAssistant() {
  const isOpen = useState('ai-chat-open', () => false)
  const isExpanded = useState('ai-chat-expanded', () => false)
  const isWaiting = useState('ai-chat-waiting', () => false)
  const showSuggestions = useState('ai-chat-suggestions', () => true)
  const messages = useState<ChatMessage[]>('ai-chat-messages', () => [{ role: 'assistant', content: WELCOME_MESSAGE }])

  const { sendMessage: sendMessageToApi } = useAiAssistantService()

  function toggleOpen() {
    isOpen.value = !isOpen.value
  }

  function toggleExpanded() {
    isExpanded.value = !isExpanded.value
  }

  function close() {
    isOpen.value = false
    isExpanded.value = false
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isWaiting.value) return

    showSuggestions.value = false
    const historyBeforeSend = [...messages.value]
    messages.value.push({ role: 'user', content: trimmed })
    isWaiting.value = true

    try {
      const data = await sendMessageToApi(trimmed, historyBeforeSend)
      if (data.error) {
        messages.value.push({ role: 'assistant', content: `❌ Xatolik yuz berdi: ${data.error}` })
      } else if (data.response) {
        messages.value.push({ role: 'assistant', content: data.response })
      } else {
        messages.value.push({ role: 'assistant', content: 'Siz yuborgan so\'rov bo\'yicha javob olinmadi.' })
      }
    } catch (e: any) {
      const displayMsg = e?.data?.error || e?.message || 'Kechirasiz, tarmoq xatoligi sababli javob olish imkoni bo\'lmadi.'
      messages.value.push({ role: 'assistant', content: `❌ Xatolik: ${displayMsg}` })
    } finally {
      isWaiting.value = false
    }
  }

  return { isOpen, isExpanded, isWaiting, showSuggestions, messages, toggleOpen, toggleExpanded, close, sendMessage }
}
