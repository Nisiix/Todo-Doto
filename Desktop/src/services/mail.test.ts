import { describe, expect, it } from 'vitest'
import { openSecret, sealSecret } from './mail'
import { isEmail, isTeamsWebhook, mailtoLink } from './office'

describe('email e Teams: regole', () => {
  it('password SMTP: si apre solo con la password del workspace', async () => {
    const sealed = await sealSecret('pw-smtp', 'segreto1')
    expect(sealed).not.toContain('pw-smtp')
    expect(await openSecret(sealed, 'segreto1')).toBe('pw-smtp')
    expect(await openSecret(sealed, 'altra')).toBeNull()
    expect(await openSecret('spazzatura', 'segreto1')).toBeNull()
  })
  it('solo indirizzi dei Workflow di Teams, in https', () => {
    expect(isTeamsWebhook('https://prod-01.westeurope.logic.azure.com:443/workflows/x/triggers/manual/paths/invoke?sig=1')).toBe(true)
    expect(isTeamsWebhook('https://default1234.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x')).toBe(true)
    expect(isTeamsWebhook('https://studio.webhook.office.com/webhookb2/x')).toBe(true)
    expect(isTeamsWebhook('http://prod-01.westeurope.logic.azure.com/x')).toBe(false)
    expect(isTeamsWebhook('https://logic.azure.com.evil.it/x')).toBe(false)
    expect(isTeamsWebhook('https://user:pw@prod.logic.azure.com/x')).toBe(false)
  })
  it('indirizzi email e link mailto con testo limitato', () => {
    expect(isEmail('mario.rossi@studio.it')).toBe(true)
    expect(isEmail('mario@studio')).toBe(false)
    expect(isEmail('a@b.it\nBcc: x@y.it')).toBe(false)
    const link = mailtoLink(['a@b.it'], 'Oggetto & co', 'x'.repeat(5000))
    expect(link.startsWith('mailto:a%40b.it?subject=Oggetto%20%26%20co&body=')).toBe(true)
    expect(decodeURIComponent(link.split('body=')[1]!).length).toBeLessThan(1900)
  })
})
