from pathlib import Path
path = Path('functions/index.js')
text = path.read_text(encoding='utf-8')
replacements = [
    ('const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=1&t=${invoiceRef.id}`;',
     'const diagnosticComment = `${CRM_SIGNATURE}${invoiceRef.id}`;\n            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=1&t=${encodeURIComponent(diagnosticComment)}`;'),
    ('const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=ID:${d.adsId || d.clientId}`;',
     'const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=${encodeURIComponent(`${CRM_SIGNATURE}${d.adsId || d.clientId}`)}`;')
]
for old, new in replacements:
    if old not in text:
        raise RuntimeError(f'OLD string not found:\n{old}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('patched')
