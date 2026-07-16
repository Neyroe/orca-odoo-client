import { describe, expect, it } from 'vitest'
import { chatterHtmlToMarkdown, markdownToChatterHtml } from './chatter-html-markdown'

describe('chatterHtmlToMarkdown', () => {
  it("converts the tag set Odoo's editor emits", () => {
    expect(chatterHtmlToMarkdown('<p>Bonjour <b>depuis</b> Orca</p>')).toBe(
      'Bonjour **depuis** Orca'
    )
    expect(chatterHtmlToMarkdown('<p>Voir <a href="https://odoo.com">le site</a></p>')).toBe(
      'Voir [le site](https://odoo.com)'
    )
    expect(chatterHtmlToMarkdown('<h2>Titre</h2><p>Corps</p>')).toBe('## Titre\n\nCorps')
  })

  it('numbers ordered lists and keeps unordered markers', () => {
    expect(chatterHtmlToMarkdown('<ol><li>un</li><li>deux</li></ol>')).toBe('1. un\n2. deux')
    expect(chatterHtmlToMarkdown('<ul><li>un</li><li>deux</li></ul>')).toBe('- un\n- deux')
  })

  it('decodes entities, including the accents Odoo escapes', () => {
    expect(chatterHtmlToMarkdown('<p>Cr&eacute;&eacute; &amp; test&hellip;</p>')).toBe(
      'Créé & test…'
    )
    expect(chatterHtmlToMarkdown('<p>&#233;t&#xe9;</p>')).toBe('été')
  })

  it('drops script and style bodies rather than emitting their source', () => {
    expect(chatterHtmlToMarkdown('<p>ok</p><script>alert(1)</script>')).toBe('ok')
  })

  it('escapes markdown markers so chatter text cannot restructure the render', () => {
    expect(chatterHtmlToMarkdown('<p>a * b _c_ [d]</p>')).toBe('a \\* b \\_c\\_ \\[d\\]')
  })

  it('returns empty string for empty input', () => {
    expect(chatterHtmlToMarkdown('')).toBe('')
  })
})

describe('markdownToChatterHtml', () => {
  // Why: Odoo's message_post escapes plain strings, so a body that is not real
  // HTML renders with visible tags in the chatter.
  it('produces HTML Odoo can store with body_is_html', () => {
    expect(markdownToChatterHtml('Bonjour **depuis** Orca')).toBe(
      '<p>Bonjour <strong>depuis</strong> Orca</p>'
    )
  })

  it('round-trips bold text back to markdown', () => {
    expect(chatterHtmlToMarkdown(markdownToChatterHtml('Bonjour **depuis** Orca'))).toBe(
      'Bonjour **depuis** Orca'
    )
  })

  it('returns empty string for blank input', () => {
    expect(markdownToChatterHtml('   ')).toBe('')
  })
})
