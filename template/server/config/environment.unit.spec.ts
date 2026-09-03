import { describe, expect, it } from 'typeferry/test'

import { parseEnvironment } from '@/server/config/environment'

const validEnvironment: NodeJS.ProcessEnv = {
  CLIENT_ORIGIN: 'http://localhost:8000',
  DATABASE_URL:
    'mongodb://127.0.0.1:27018/template?replicaSet=rs0&directConnection=true',
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
  PORT: '8002',
  SAMPLE_AUTH_TOKEN: 'test-auth-token-value',
}

describe('parseEnvironment', () => {
  it('returns typed values for valid process configuration', () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'test',
      PORT: 8002,
    })
  })

  it('rejects missing secrets and invalid ports', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, SAMPLE_AUTH_TOKEN: '' }),
    ).toThrow()
    expect(() =>
      parseEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow()
  })
})
