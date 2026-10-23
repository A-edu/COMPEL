// Hand-built minimal single-page PDF (no pdf library dependency) so seeded
// documents are recognizably synthetic without pulling in a rendering stack.

function encodeWinAnsi(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch === '—' ? 0x97 : ch.charCodeAt(0);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      bytes.push(0x5c, code); // escape ( ) \
    } else {
      bytes.push(code);
    }
  }
  return Buffer.from(bytes);
}

export function buildPlaceholderPdf(lines: string[]): Buffer {
  const textOps = lines
    .map((line, i) => {
      const positioning = i === 0 ? '72 700 Td' : '0 -28 Td';
      return `${positioning} (${encodeWinAnsi(line).toString('binary')}) Tj`;
    })
    .join('\n');
  const content = Buffer.from(`BT /F1 24 Tf\n${textOps}\nET`, 'binary');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ].map((s) => Buffer.from(s, 'binary'));

  const streamObject = Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'binary'),
    content,
    Buffer.from('\nendstream', 'binary'),
  ]);
  objects.push(streamObject);

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (buf: Buffer) => {
    chunks.push(buf);
    pos += buf.length;
  };

  push(Buffer.from('%PDF-1.4\n', 'binary'));
  objects.forEach((obj, i) => {
    offsets.push(pos);
    push(Buffer.from(`${i + 1} 0 obj\n`, 'binary'));
    push(obj);
    push(Buffer.from('\nendobj\n', 'binary'));
  });

  const xrefOffset = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  push(Buffer.from(xref, 'binary'));
  push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
      'binary',
    ),
  );

  return Buffer.concat(chunks);
}
