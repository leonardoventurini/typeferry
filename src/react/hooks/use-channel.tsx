import { NO_CHANNEL } from '../../utils'
import { useClient } from './use-client'

export function useChannel(channel: string = NO_CHANNEL) {
  const client = useClient()

  return client.channel(channel)
}
