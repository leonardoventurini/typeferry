export type EJSONTypeFactory = (value: unknown) => unknown

export const customTypes = new Map<string, EJSONTypeFactory>()
