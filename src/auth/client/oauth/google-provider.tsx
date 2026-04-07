import { GoogleOAuthProvider as ReactGoogleOAuthProvider } from '@react-oauth/google'
import type { ReactNode } from 'react'

export interface GoogleOAuthProviderProps {
  clientId: string
  children: ReactNode
}

/**
 * Wraps the application tree with Google OAuth context.
 * Thin re-export of `@react-oauth/google`'s provider for
 * consistency with the bifrost auth module surface.
 */
export function GoogleOAuthProvider({
  clientId,
  children,
}: GoogleOAuthProviderProps): ReactNode {
  return (
    <ReactGoogleOAuthProvider clientId={clientId}>
      {children}
    </ReactGoogleOAuthProvider>
  )
}
