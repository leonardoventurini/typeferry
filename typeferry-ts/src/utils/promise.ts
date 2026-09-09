export function getPromise<T = unknown>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>(r => {
    resolve = r
  })

  return {
    promise,
    resolve,
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function randomSleep(min = 50, max = 200): Promise<void> {
  return sleep(Math.floor(Math.random() * (max - min) + min))
}
