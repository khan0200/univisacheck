import type {
  AuthResponse,
  ChangePasswordPayload,
  LoginPayload,
  SignupPayload,
  UpdateProfilePayload
} from '~/types/auth'

const AUTH_URL = '/api/auth'

export function useAuthService() {
  const { apiFetch } = useApiFetch()

  function login(payload: LoginPayload) {
    return apiFetch<AuthResponse>(`${AUTH_URL}?action=login`, {
      method: 'POST',
      body: payload
    })
  }

  function signup(payload: SignupPayload) {
    return apiFetch<AuthResponse>(`${AUTH_URL}?action=signup`, {
      method: 'POST',
      body: payload
    })
  }

  function me() {
    return apiFetch<{ user: AuthResponse['user'] }>(`${AUTH_URL}?action=me`)
  }

  function updateProfile(payload: UpdateProfilePayload) {
    return apiFetch<AuthResponse>(`${AUTH_URL}?action=update-profile`, {
      method: 'POST',
      body: payload
    })
  }

  function changePassword(payload: ChangePasswordPayload) {
    return apiFetch<{ success: boolean }>(`${AUTH_URL}?action=change-password`, {
      method: 'POST',
      body: payload
    })
  }

  return { login, signup, me, updateProfile, changePassword }
}
