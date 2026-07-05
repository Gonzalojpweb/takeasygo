import { useAuthContext, type AuthContextValue } from "./AuthContext"

// Re-export useAuth as a thin wrapper over the shared context.
// All components and hooks should use this to get shared auth state.
export function useAuth(): AuthContextValue {
  return useAuthContext()
}
