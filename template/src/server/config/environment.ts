import { z } from 'zod'

const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535))

const environmentSchema = z.object({
  CLIENT_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1).startsWith('mongodb'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: portSchema.default(8002),
  SAMPLE_AUTH_TOKEN: z.string().min(16),
})

export type Environment = z.infer<typeof environmentSchema>

/** Parses an environment-like record into the server's strict configuration. */
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(input)
}

/** Validated server configuration. Invalid process state fails during startup. */
export const env = parseEnvironment(process.env)
