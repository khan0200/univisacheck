export interface AuthUser {
  id: string | number
  email: string
  username: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface SignupPayload {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface UpdateProfilePayload {
  username: string
}

export interface ChangePasswordPayload {
  newPassword: string
  confirmPassword: string
}
