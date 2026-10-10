import { describe, it, expect } from 'vitest'
import {
  resolveMongoDbName,
  assertMongoDbName,
} from '@takeasygo/business'

describe('resolveMongoDbName', () => {
  it('extrae el nombre de base declarado', () => {
    expect(
      resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/takeasygo-staging?retryWrites=true&w=majority')
    ).toBe('takeasygo-staging')
    expect(resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/test?retryWrites=true')).toBe('test')
    expect(resolveMongoDbName('mongodb://localhost:27017/takeasygo-staging')).toBe('takeasygo-staging')
    expect(resolveMongoDbName('mongodb://localhost:27017/mydb?authSource=admin')).toBe('mydb')
    expect(resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/mydb')).toBe('mydb')
    expect(resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/mydb/')).toBe('mydb')
  })

  it('devuelve "" si el URI no declara nombre de base', () => {
    expect(resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net/?retryWrites=true')).toBe('')
    expect(resolveMongoDbName('mongodb+srv://user:pass@takeasygo.ssjlhfw.mongodb.net')).toBe('')
    expect(resolveMongoDbName('mongodb://localhost:27017/')).toBe('')
    expect(resolveMongoDbName('mongodb://localhost:27017')).toBe('')
    expect(resolveMongoDbName('mongodb://localhost:27017/?authSource=admin')).toBe('')
  })

  it('devuelve "" si no hay URI', () => {
    expect(resolveMongoDbName('')).toBe('')
    expect(resolveMongoDbName(undefined)).toBe('')
    expect(resolveMongoDbName(null)).toBe('')
  })
})

describe('assertMongoDbName', () => {
  it('no falla y devuelve el nombre cuando está declarado', () => {
    expect(assertMongoDbName('mongodb+srv://u:p@cluster.example/takeasygo-staging?x=1')).toBe('takeasygo-staging')
    expect(assertMongoDbName('mongodb://localhost:27017/db')).toBe('db')
  })

  it('falla con mensaje claro si no hay nombre de base', () => {
    expect(() => assertMongoDbName('mongodb+srv://u:p@cluster.example/?retryWrites=true')).toThrow(/no incluye un nombre de base/)
    expect(() => assertMongoDbName('mongodb+srv://u:p@cluster.example/?retryWrites=true')).toThrow(/PRODUCC/)
    expect(() => assertMongoDbName('mongodb+srv://u:p@cluster.example/?retryWrites=true')).toThrow(/takeasygo-staging/)
    expect(() => assertMongoDbName('mongodb://localhost:27017/?authSource=admin')).toThrow(/no incluye un nombre de base/)
  })

  it('falla si no hay URI', () => {
    expect(() => assertMongoDbName('')).toThrow(/no incluye un nombre de base/)
    expect(() => assertMongoDbName(undefined)).toThrow(/no incluye un nombre de base/)
    expect(() => assertMongoDbName(null)).toThrow(/no incluye un nombre de base/)
  })
})