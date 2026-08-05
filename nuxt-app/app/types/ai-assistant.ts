export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface AiAssistantResponse {
  response?: string
  error?: string
}
