import qrcode from 'qrcode-generator'

export function createPosterShareUrl(origin: string): string {
  return origin.replace(/\/$/, '') + '/pages/play/play?id=first-npe&source=poster'
}

export function createQrDataUrl(value: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(value, 'Byte')
  qr.make()
  return qr.createDataURL(4, 16)
}
