import { useRef } from 'react'

export function useDepsChange(
  deps: readonly unknown[],
  data: unknown = {},
): void {
  const prevDeps = useRef<readonly unknown[]>([])

  deps.forEach((value, index) => {
    if (prevDeps.current[index] !== value) {
      console.debug(
        'Dep Changed',
        index,
        { prev: prevDeps.current[index] },
        { next: value },
        data,
      )
    }
  })

  prevDeps.current = [...deps]
}
