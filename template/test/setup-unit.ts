Error.stackTraceLimit = Number.POSITIVE_INFINITY
process.env['CLIENT_ORIGIN'] = 'http://localhost:8000'
process.env['DATABASE_URL'] =
  'mongodb://127.0.0.1:27018/template?replicaSet=rs0&directConnection=true'
process.env['LOG_LEVEL'] = 'error'
process.env['NODE_ENV'] = 'test'
process.env['PORT'] = '8002'
process.env['SAMPLE_AUTH_TOKEN'] = 'test-auth-token-value'
