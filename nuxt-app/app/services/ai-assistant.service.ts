import type { AiAssistantResponse, ChatMessage } from '~/types/ai-assistant'

const AI_ASSISTANT_URL = '/api/ai-assistant'

export function useAiAssistantService() {
  const config = useRuntimeConfig()

  function sendMessage(message: string, history: ChatMessage[]) {
    return $fetch<AiAssistantResponse>(`${config.public.apiBase}${AI_ASSISTANT_URL}`, {
      method: 'POST',
      body: { message, history }
    })
  }

  return { sendMessage }
}
