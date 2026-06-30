export async function sendWhatsApp(number: string, body: string) {
  const to = number.replace(/[^\d-]/g, '')
  const payload = JSON.stringify({ to, body })
  const res = await fetch('https://gate.whapi.cloud/messages/text', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('[Whapi] error:', text)
  }
}
