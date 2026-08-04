import assert from 'node:assert/strict'
import { escapeRegex } from '../escape-regex'

// Test negativo: patrones adversariales se escapan
assert.equal(escapeRegex('.*'), '\\.\\*', 'wildcard injection')
assert.equal(escapeRegex('(a|b)'), '\\(a\\|b\\)', 'alternation injection')
assert.equal(escapeRegex('(a+)+$'), '\\(a\\+\\)\\+\\$', 'ReDoS pattern')
assert.equal(escapeRegex('^test$'), '\\^test\\$', 'anchor injection')

// Test positivo: búsqueda normal no se rompe
assert.equal(escapeRegex('Gonzalo'), 'Gonzalo', 'normal name')
assert.equal(escapeRegex('pizza margherita'), 'pizza margherita', 'normal phrase')
assert.equal(escapeRegex('test.*name'), 'test\\.\\*name', 'mixed')

console.log('All escapeRegex tests passed ✅')
