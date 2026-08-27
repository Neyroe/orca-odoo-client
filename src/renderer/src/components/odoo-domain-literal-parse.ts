// Text → value for a raw Odoo domain, in both notations one arrives in: the
// Python literal Odoo itself prints in filters, server actions and views, and the
// JSON older builds of this box stored.
//
// Hand-written rather than `eval` or `new Function`. This text comes from a
// filter box and travels inside a shared saved filter, so evaluating it would run
// whatever that filter carries.
//
// Text layer only: operators, arity and leaf shape are `parseOdooDomain`'s job,
// and its message is the one the main process repeats. What is refused here is
// what the domain layer never sees — an unclosed bracket, an unterminated quote,
// a bare word that is not a literal.
import { translate } from '@/i18n/i18n'

export type OdooDomainLiteralResult = { ok: true; value: unknown } | { ok: false; error: string }

/**
 * Nesting a literal may reach, above `MAX_DOMAIN_VALUE_DEPTH` so a domain deep
 * enough to be refused is refused with the domain layer's own words. Bounded at
 * all because this parser recurses on text nobody wrote by hand.
 */
const MAX_LITERAL_DEPTH = 64

/** Python spellings first; the JSON ones read a domain copied out of storage. */
const LITERAL_WORDS = new Map<string, unknown>([
  ['True', true],
  ['False', false],
  ['None', null],
  ['true', true],
  ['false', false],
  ['null', null]
])

const STRING_ESCAPES = new Map<string, string>([
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t']
])

const CLOSERS = new Map<string, string>([
  ['[', ']'],
  ['(', ')']
])

const ANY_CLOSER = new Set([']', ')'])

const NUMBER_PATTERN = /[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const WORD_PATTERN = /[A-Za-z_]\w*/y
const SPACE_PATTERN = /\s*/y

type Cursor = { text: string; at: number }

/** 1-based, so a message counts the way the user counts. */
function character(at: number): number {
  return at + 1
}

function failed(error: string): OdooDomainLiteralResult {
  return { ok: false, error }
}

function unclosed(open: string, openAt: number): OdooDomainLiteralResult {
  return failed(
    translate(
      'auto.components.odoo.domain.literal.parse.unclosed',
      'The "{{open}}" opened at character {{at}} is never closed.',
      { open, at: character(openAt) }
    )
  )
}

function mismatched(open: string, openAt: number, found: string): OdooDomainLiteralResult {
  return failed(
    translate(
      'auto.components.odoo.domain.literal.parse.mismatched',
      'The "{{open}}" opened at character {{at}} is closed by "{{found}}".',
      { open, at: character(openAt), found }
    )
  )
}

function skipSpace(cursor: Cursor): void {
  SPACE_PATTERN.lastIndex = cursor.at
  SPACE_PATTERN.exec(cursor.text)
  cursor.at = SPACE_PATTERN.lastIndex
}

/**
 * The quoted text, single- or double-quoted. An unknown escape keeps the
 * character it introduced, so `\d` reads as `d` rather than failing on a sequence
 * Odoo's own repr never emits.
 */
function readString(cursor: Cursor): OdooDomainLiteralResult {
  const quote = cursor.text.charAt(cursor.at)
  const openedAt = cursor.at
  cursor.at += 1
  let read = ''
  while (cursor.at < cursor.text.length) {
    const char = cursor.text.charAt(cursor.at)
    if (char === '\\') {
      const escaped = cursor.text.charAt(cursor.at + 1)
      if (!escaped) {
        break
      }
      read += STRING_ESCAPES.get(escaped) ?? escaped
      cursor.at += 2
      continue
    }
    if (char === quote) {
      cursor.at += 1
      return { ok: true, value: read }
    }
    read += char
    cursor.at += 1
  }
  return failed(
    translate(
      'auto.components.odoo.domain.literal.parse.unterminated',
      'The quote opened at character {{at}} is never closed.',
      { at: character(openedAt) }
    )
  )
}

function readNumber(cursor: Cursor): OdooDomainLiteralResult {
  NUMBER_PATTERN.lastIndex = cursor.at
  const match = NUMBER_PATTERN.exec(cursor.text)
  if (!match) {
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.notANumber',
        'The number at character {{at}} is incomplete.',
        { at: character(cursor.at) }
      )
    )
  }
  cursor.at = NUMBER_PATTERN.lastIndex
  return { ok: true, value: Number(match[0]) }
}

function readWord(cursor: Cursor): OdooDomainLiteralResult {
  WORD_PATTERN.lastIndex = cursor.at
  const match = WORD_PATTERN.exec(cursor.text)
  const word = match?.[0] ?? cursor.text.charAt(cursor.at)
  if (!match || !LITERAL_WORDS.has(word)) {
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.unknownWord',
        '"{{word}}" at character {{at}} is not a value. Quote it, or write True, False or None.',
        { word, at: character(cursor.at) }
      )
    )
  }
  cursor.at = WORD_PATTERN.lastIndex
  return { ok: true, value: LITERAL_WORDS.get(word) }
}

/** A list `[…]` or a tuple `(…)`; Odoo writes both and means the same thing. */
function readSequence(cursor: Cursor, depth: number, closer: string): OdooDomainLiteralResult {
  const open = cursor.text.charAt(cursor.at)
  const openedAt = cursor.at
  if (depth >= MAX_LITERAL_DEPTH) {
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.tooDeep',
        'The domain nests too deeply at character {{at}}.',
        { at: character(openedAt) }
      )
    )
  }
  cursor.at += 1
  const items: unknown[] = []
  for (;;) {
    skipSpace(cursor)
    if (cursor.at >= cursor.text.length) {
      return unclosed(open, openedAt)
    }
    // Loop head, so a trailing comma before the closer is legal — Odoo's own
    // multi-line domains carry one.
    if (cursor.text.charAt(cursor.at) === closer) {
      cursor.at += 1
      return { ok: true, value: items }
    }
    const item = readValue(cursor, depth + 1)
    if (!item.ok) {
      return item
    }
    items.push(item.value)
    skipSpace(cursor)
    const next = cursor.text.charAt(cursor.at)
    if (next === ',') {
      cursor.at += 1
      continue
    }
    if (next === closer) {
      cursor.at += 1
      return { ok: true, value: items }
    }
    if (!next) {
      return unclosed(open, openedAt)
    }
    if (ANY_CLOSER.has(next)) {
      return mismatched(open, openedAt, next)
    }
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.expectedSeparator',
        'Character {{at}} should be "," or "{{closer}}", not "{{found}}".',
        { at: character(cursor.at), closer, found: next }
      )
    )
  }
}

function readValue(cursor: Cursor, depth: number): OdooDomainLiteralResult {
  skipSpace(cursor)
  const char = cursor.text.charAt(cursor.at)
  if (!char) {
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.missingValue',
        'A value is missing at character {{at}}.',
        { at: character(cursor.at) }
      )
    )
  }
  const closer = CLOSERS.get(char)
  if (closer) {
    return readSequence(cursor, depth, closer)
  }
  if (char === '"' || char === "'") {
    return readString(cursor)
  }
  if (char === '+' || char === '-' || (char >= '0' && char <= '9')) {
    return readNumber(cursor)
  }
  if (/[A-Za-z_]/.test(char)) {
    return readWord(cursor)
  }
  return failed(
    translate(
      'auto.components.odoo.domain.literal.parse.unexpected',
      'Character {{at}} ("{{found}}") cannot start a value.',
      { at: character(cursor.at), found: char }
    )
  )
}

/**
 * The value `text` spells, or why it spells none. Never throws and never returns
 * a half-read value: an error means nothing of `text` was kept.
 *
 * Whether that value is a domain is not asked here — a tuple, a number or a
 * string all parse, and `parseOdooDomain` is what refuses them.
 */
export function parseOdooDomainLiteral(text: string): OdooDomainLiteralResult {
  const cursor: Cursor = { text, at: 0 }
  const parsed = readValue(cursor, 0)
  if (!parsed.ok) {
    return parsed
  }
  skipSpace(cursor)
  if (cursor.at < cursor.text.length) {
    return failed(
      translate(
        'auto.components.odoo.domain.literal.parse.trailing',
        'The domain ends at character {{at}}; remove what follows it.',
        { at: character(cursor.at) }
      )
    )
  }
  return parsed
}
