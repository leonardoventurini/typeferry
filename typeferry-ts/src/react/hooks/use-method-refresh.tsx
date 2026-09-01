import { useCallback } from 'react'

export const useMethodRefresh = ({
  authenticated,
  caller,
  client,
  params,
  method,
  setError,
  setLoading,
  setResult,
  shouldCall,
  startLoading,
  methodOptions,
  defaultValue,
  deps,
}) => {
  return useCallback(
    (callback?) => {
      if (!method) return
      if (!shouldCall) return
      if (!caller) return

      if (authenticated && !client.authenticated) {
        setLoading(false)
        setResult(defaultValue)
        return
      }

      startLoading()

      let successful = false

      caller
        .call(client, method, params, methodOptions)
        .then(_result => {
          setResult(_result)
          setError(undefined)
          successful = true
        })
        .catch(e => {
          console.error(e)
          setError(e)
          setResult(undefined)
        })
        .finally(() => {
          startLoading.cancel()
          setLoading(false)
          if (typeof callback === 'function') callback()
        })
    },
    [
      client,
      method,
      params,
      setResult,
      setLoading,
      setError,
      client?.authenticated,
      defaultValue,
      ...Object.values(methodOptions),
      ...deps,
    ],
  )
}
