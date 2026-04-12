import { EJSON } from './index'
import { stableStringify } from './stable-stringify'

export type StringifyOptions = {
  indent?: boolean | number | string
  canonical?: boolean
}

export const stringify = (item: any, options?: StringifyOptions) => {
  const json = EJSON.toJSONValue(item)

  const space =
    options?.indent === true
      ? 2
      : ((options?.indent as number | string) ?? undefined)

  if (options?.canonical) {
    return stableStringify(json, space)
  }

  return options?.indent
    ? JSON.stringify(json, null, space)
    : JSON.stringify(json)
}
