const MAX_EXPORT_IMAGES = 30;
const MAX_EXPORT_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_EXPORT_IMAGE_TOTAL_SIZE = 50 * 1024 * 1024;
const IMAGE_MARKDOWN_PATTERN = /!\[((?:\\.|[^\]])*)\]\(([^)\s]+)(?:\s+("(?:[^"\\]|\\.)*"))?\)/g;
const IMAGE_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function latin1Bytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function zipStore(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  const { time, day } = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const name = latin1Bytes(entry.name);
    const data = entry.content instanceof Uint8Array ? entry.content : encoder.encode(entry.content);
    const checksum = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // UTF-8 filenames.
    header.setUint16(8, 0, true); // Store; images are already compressed.
    header.setUint16(10, time, true);
    header.setUint16(12, day, true);
    header.setUint32(14, checksum, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true);
    chunks.push(new Uint8Array(header.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 0x0314, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }

  let directorySize = 0;
  for (const entry of directory) directorySize += entry.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

function outsideCodeFence(value, callback) {
  let fence = null;
  return value.split('\n').map((line) => {
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker && (!fence || marker[1].startsWith(fence))) {
      fence = fence ? null : marker[1];
      return line;
    }
    if (fence) return line;
    return callback(line);
  }).join('\n');
}

function markdownImageUrls(markdown) {
  const urls = [];
  const seen = new Set();
  outsideCodeFence(markdown, (line) => {
    for (const match of line.matchAll(IMAGE_MARKDOWN_PATTERN)) {
      if (!match[2] || seen.has(match[2])) continue;
      seen.add(match[2]);
      urls.push(match[2]);
    }
  });
  return urls.slice(0, MAX_EXPORT_IMAGES);
}

async function exportImage(url, index) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  let response;
  try {
    response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const extension = IMAGE_MIME_TYPES.get(mimeType);
  if (!extension) return null;
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { return null; }
  if (!bytes.length || bytes.length > MAX_EXPORT_IMAGE_SIZE) return null;
  const name = `assets/image-${String(index + 1).padStart(3, '0')}${extension}`;
  return { name, bytes };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  return Promise.resolve(chrome.downloads.download({ url, filename, saveAs: false }))
    .finally(() => setTimeout(() => URL.revokeObjectURL(url), 60_000));
}

export function exportFilename(title, extension) {
  const safe = String(title || '').normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.-]+|[.-]+$/g, '');
  return `${(safe || 'shiye-article').slice(0, 100)}${extension}`;
}

export function exportMarkdownFile({ title, markdown }) {
  return downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), exportFilename(title, '.md'));
}

export async function exportZipFile({ title, markdown }) {
  const replacements = new Map();
  const images = [];
  let totalSize = 0;

  for (const [index, url] of markdownImageUrls(markdown).entries()) {
    if (totalSize >= MAX_EXPORT_IMAGE_TOTAL_SIZE) break;
    const image = await exportImage(url, index);
    if (!image || totalSize + image.bytes.length > MAX_EXPORT_IMAGE_TOTAL_SIZE) continue;
    totalSize += image.bytes.length;
    images.push(image);
    replacements.set(url, image.name);
  }

  const localizedMarkdown = replacements.size
    ? outsideCodeFence(markdown, (line) =>
        line.replace(IMAGE_MARKDOWN_PATTERN, (match, alt, url, titlePart = '') => {
          const replacement = replacements.get(url);
          return replacement ? `![${alt}](${replacement}${titlePart ? ` ${titlePart}` : ''})` : match;
        }))
    : markdown;
  const entries = [{ name: 'article.md', content: localizedMarkdown }, ...images.map((image) => ({ name: image.name, content: image.bytes }))];
  return downloadBlob(zipStore(entries), exportFilename(title, '.zip'));
}
