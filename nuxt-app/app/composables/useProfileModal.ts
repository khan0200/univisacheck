export function useProfileModal() {
  const open = useState('profile-modal-open', () => false)
  return { open, show: () => (open.value = true) }
}
