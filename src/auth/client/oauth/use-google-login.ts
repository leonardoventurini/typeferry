import { useGoogleLogin } from '@react-oauth/google'
import { useCallback } from 'react'

import { useClient } from '../../../react/hooks/use-client'

export interface UseGoogleLoginOptions {
  /**
   * Server method to call with the authorization code.
   * @default 'auth.google'
   */
  method?: string

  /**
   * Async hook that runs after Google returns the auth code but
   * before the server call. Return additional params to merge
   * with `{ code }`, or return `false` to abort the flow.
   *
   * Useful for reCAPTCHA, analytics, or pre-flight checks.
   */
  beforeServerCall?: (
    code: string,
  ) => Promise<Record<string, unknown> | false>

  /** Called after successful authentication and context update. */
  onSuccess?: () => void

  /** Called when any step of the flow fails. */
  onError?: (error: unknown) => void
}

/**
 * Hook that returns a trigger function for the Google OAuth popup flow.
 *
 * On user consent it exchanges the authorization code with the server,
 * updates the bifrost client context, and reconnects the socket with
 * the new credentials.
 *
 * @example
 * ```tsx
 * const login = useBifrostGoogleLogin({
 *   beforeServerCall: async () => {
 *     const token = await executeRecaptcha('google_signup')
 *     return token ? { recaptchaToken: token } : false
 *   },
 * })
 *
 * <button onClick={() => login()}>Sign in with Google</button>
 * ```
 */
export function useBifrostGoogleLogin(
  options: UseGoogleLoginOptions = {},
): () => void {
  const {
    method = 'auth.google',
    beforeServerCall,
    onSuccess,
    onError,
  } = options

  const client = useClient()

  const login = useGoogleLogin({
    onSuccess: async ({ code }) => {
      try {
        let extraParams: Record<string, unknown> = {}

        if (beforeServerCall) {
          const result = await beforeServerCall(code)
          if (result === false) return
          extraParams = result
        }

        const { token, exp, iat } = await client.call(
          method,
          { code, ...extraParams },
          { http: true },
        )

        await client.setContextAndReInit({
          isGoogleAuth: true,
          token,
          exp,
          iat,
          _tokenReceivedAt: Date.now(),
        })

        onSuccess?.()
      } catch (error) {
        onError?.(error)
      }
    },
    flow: 'auth-code',
    select_account: true,
  })

  return useCallback(() => login(), [login])
}
