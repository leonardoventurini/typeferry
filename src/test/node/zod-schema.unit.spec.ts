import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Errors } from '../../utils'
import { TestUtility } from '../test-utility'

describe('Zod Schema Validation', () => {
  const test = new TestUtility()

  describe('basic validation', () => {
    it('validates required string fields', async () => {
      test.server.addMethod(
        'zod:string:required',
        ({ name }) => `Hello, ${name}!`,
        {
          schema: z.object({
            name: z.string().min(1),
          }),
        },
      )

      await expect(test.client.call('zod:string:required', {})).rejects.toThrow(
        Errors.INVALID_PARAMS,
      )

      await expect(
        test.client.call('zod:string:required', { name: '' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:string:required', {
        name: 'World',
      })
      expect(result).toBe('Hello, World!')
    })

    it('validates number fields', async () => {
      test.server.addMethod('zod:number', ({ count }) => count * 2, {
        schema: z.object({
          count: z.number().int().positive(),
        }),
      })

      await expect(
        test.client.call('zod:number', { count: -1 }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      await expect(
        test.client.call('zod:number', { count: 1.5 }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:number', { count: 5 })
      expect(result).toBe(10)
    })

    it('validates boolean fields', async () => {
      test.server.addMethod('zod:boolean', ({ enabled }) => !enabled, {
        schema: z.object({
          enabled: z.boolean(),
        }),
      })

      await expect(
        test.client.call('zod:boolean', { enabled: 'true' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:boolean', { enabled: true })
      expect(result).toBe(false)
    })
  })

  describe('optional and nullable fields', () => {
    it('accepts undefined for optional fields', async () => {
      test.server.addMethod(
        'zod:optional',
        ({ required, optional }) => ({ required, optional }),
        {
          schema: z.object({
            required: z.string(),
            optional: z.string().optional(),
          }),
        },
      )

      const result = await test.client.call('zod:optional', {
        required: 'value',
      })
      expect(result).toEqual({ required: 'value', optional: undefined })
    })

    it('accepts null for nullable fields', async () => {
      test.server.addMethod('zod:nullable', ({ value }) => ({ value }), {
        schema: z.object({
          value: z.string().nullable(),
        }),
      })

      const result = await test.client.call('zod:nullable', { value: null })
      expect(result).toEqual({ value: null })
    })
  })

  describe('complex schemas', () => {
    it('validates nested objects', async () => {
      test.server.addMethod(
        'zod:nested',
        ({ user }) => `${user.profile.name} (${user.email})`,
        {
          schema: z.object({
            user: z.object({
              email: z.string().email(),
              profile: z.object({
                name: z.string().min(1),
              }),
            }),
          }),
        },
      )

      await expect(
        test.client.call('zod:nested', {
          user: { email: 'invalid', profile: { name: 'Test' } },
        }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:nested', {
        user: { email: 'test@example.com', profile: { name: 'Test User' } },
      })
      expect(result).toBe('Test User (test@example.com)')
    })

    it('validates arrays', async () => {
      test.server.addMethod('zod:array', ({ items }) => items.length, {
        schema: z.object({
          items: z.array(z.string().min(1)),
        }),
      })

      await expect(
        test.client.call('zod:array', { items: ['valid', '', 'also valid'] }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:array', {
        items: ['a', 'b', 'c'],
      })
      expect(result).toBe(3)
    })

    it('validates array of objects', async () => {
      test.server.addMethod(
        'zod:array:objects',
        ({ contacts }) => contacts.map(c => c.value),
        {
          schema: z.object({
            contacts: z.array(
              z.object({
                field: z.string(),
                value: z.string(),
              }),
            ),
          }),
        },
      )

      const result = await test.client.call('zod:array:objects', {
        contacts: [
          { field: 'email', value: 'test@test.com' },
          { field: 'phone', value: '123-456' },
        ],
      })
      expect(result).toEqual(['test@test.com', '123-456'])
    })
  })

  describe('enum validation', () => {
    it('validates enum values', async () => {
      test.server.addMethod('zod:enum', ({ status }) => `Status: ${status}`, {
        schema: z.object({
          status: z.enum(['active', 'inactive', 'pending']),
        }),
      })

      await expect(
        test.client.call('zod:enum', { status: 'invalid' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:enum', { status: 'active' })
      expect(result).toBe('Status: active')
    })
  })

  describe('union types', () => {
    it('validates union types', async () => {
      test.server.addMethod('zod:union', ({ id }) => typeof id, {
        schema: z.object({
          id: z.union([z.string().uuid(), z.number().int()]),
        }),
      })

      await expect(
        test.client.call('zod:union', { id: 'not-uuid' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result1 = await test.client.call('zod:union', { id: 42 })
      expect(result1).toBe('number')

      const result2 = await test.client.call('zod:union', {
        id: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result2).toBe('string')
    })
  })

  describe('coercion', () => {
    it('coerces string to number', async () => {
      test.server.addMethod('zod:coerce:number', ({ value }) => value * 2, {
        schema: z.object({
          value: z.coerce.number(),
        }),
      })

      const result = await test.client.call('zod:coerce:number', {
        value: '21',
      })
      expect(result).toBe(42)
    })
  })

  describe('refinement', () => {
    it('validates custom refinements', async () => {
      test.server.addMethod('zod:refine', ({ password }) => 'ok', {
        schema: z
          .object({
            password: z.string(),
            confirm: z.string(),
          })
          .refine(data => data.password === data.confirm, {
            message: 'Passwords must match',
          }),
      })

      await expect(
        test.client.call('zod:refine', {
          password: 'secret',
          confirm: 'different',
        }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:refine', {
        password: 'secret',
        confirm: 'secret',
      })
      expect(result).toBe('ok')
    })
  })

  describe('schema transforms data', () => {
    it('applies transforms and passes transformed data to handler', async () => {
      test.server.addMethod('zod:transform', params => params, {
        schema: z.object({
          email: z.string().toLowerCase(),
          name: z.string().trim(),
        }),
      })

      const result = await test.client.call('zod:transform', {
        email: 'TEST@EXAMPLE.COM',
        name: '  John Doe  ',
      })

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'John Doe',
      })
    })
  })

  describe('default values', () => {
    it('uses default values when field is undefined', async () => {
      test.server.addMethod('zod:defaults', params => params, {
        schema: z.object({
          name: z.string(),
          count: z.number().default(10),
          active: z.boolean().default(true),
        }),
      })

      const result = await test.client.call('zod:defaults', {
        name: 'Test',
      })

      expect(result).toEqual({
        name: 'Test',
        count: 10,
        active: true,
      })
    })
  })

  describe('URL validation (common pattern in codebase)', () => {
    it('validates URL fields', async () => {
      test.server.addMethod('zod:url', ({ url }) => new URL(url).hostname, {
        schema: z.object({
          url: z.string().url(),
        }),
      })

      await expect(
        test.client.call('zod:url', { url: 'not-a-url' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:url', {
        url: 'https://example.com/path',
      })
      expect(result).toBe('example.com')
    })

    it('allows empty string with union pattern', async () => {
      test.server.addMethod('zod:url:optional', ({ url }) => url || 'empty', {
        schema: z.object({
          url: z.string().url().or(z.literal('')),
        }),
      })

      const result1 = await test.client.call('zod:url:optional', { url: '' })
      expect(result1).toBe('empty')

      const result2 = await test.client.call('zod:url:optional', {
        url: 'https://example.com',
      })
      expect(result2).toBe('https://example.com')
    })
  })

  describe('email validation (common pattern in codebase)', () => {
    it('validates email fields', async () => {
      test.server.addMethod('zod:email', ({ email }) => email.split('@')[1], {
        schema: z.object({
          email: z.string().email(),
        }),
      })

      await expect(
        test.client.call('zod:email', { email: 'invalid' }),
      ).rejects.toThrow(Errors.INVALID_PARAMS)

      const result = await test.client.call('zod:email', {
        email: 'test@example.com',
      })
      expect(result).toBe('example.com')
    })
  })
})
