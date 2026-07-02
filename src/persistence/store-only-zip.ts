export interface StoreOnlyZipEntry {
  data: Uint8Array;
  path: string;
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const STORE_ONLY_METHOD = 0;
const UTF8_FILE_NAME_FLAG = 0x0800;
const ZIP_VERSION_NEEDED = 20;
const MAX_ZIP_COMMENT_LENGTH = 0xffff;

interface CentralDirectoryRecord {
  compressedSize: number;
  fileName: string;
  localHeaderOffset: number;
  uncompressedSize: number;
}

export async function createStoreOnlyZipBlob(
  entries: readonly StoreOnlyZipEntry[],
): Promise<Blob> {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let localFileOffset = 0;

  for (const entry of entries) {
    const fileNameBytes = encodeText(normalizeZipPath(entry.path));
    const data = entry.data;
    const crc32 = computeCrc32(data);
    const localFileHeader = createLocalFileHeader({
      compressedSize: data.byteLength,
      crc32,
      fileNameBytes,
      uncompressedSize: data.byteLength,
    });
    const centralDirectoryHeader = createCentralDirectoryHeader({
      compressedSize: data.byteLength,
      crc32,
      fileNameBytes,
      localHeaderOffset: localFileOffset,
      uncompressedSize: data.byteLength,
    });

    localFileParts.push(localFileHeader, fileNameBytes, data);
    centralDirectoryParts.push(centralDirectoryHeader, fileNameBytes);
    localFileOffset +=
      localFileHeader.byteLength + fileNameBytes.byteLength + data.byteLength;
  }

  const centralDirectoryOffset = localFileOffset;
  const centralDirectorySize = centralDirectoryParts.reduce(
    (size, part) => size + part.byteLength,
    0,
  );
  const endOfCentralDirectory = createEndOfCentralDirectory({
    centralDirectoryOffset,
    centralDirectorySize,
    entryCount: entries.length,
  });

  return new Blob(
    [...localFileParts, ...centralDirectoryParts, endOfCentralDirectory].map(
      toArrayBuffer,
    ),
    { type: "application/zip" },
  );
}

export async function readStoreOnlyZipBlob(
  blob: Blob,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(
    endOfCentralDirectoryOffset + 16,
    true,
  );
  let cursor = centralDirectoryOffset;
  const records: CentralDirectoryRecord[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error("Invalid ZIP central directory.");
    }

    const compressionMethod = view.getUint16(cursor + 10, true);

    if (compressionMethod !== STORE_ONLY_METHOD) {
      throw new Error("Only store-only ZIP bundles are supported.");
    }

    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const fileCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    records.push({
      compressedSize,
      fileName: decodeText(bytes.slice(fileNameStart, fileNameEnd)),
      localHeaderOffset,
      uncompressedSize,
    });
    cursor = fileNameEnd + extraFieldLength + fileCommentLength;
  }

  const entries = new Map<string, Uint8Array>();

  for (const record of records) {
    if (record.compressedSize !== record.uncompressedSize) {
      throw new Error("Invalid store-only ZIP entry size.");
    }

    if (
      view.getUint32(record.localHeaderOffset, true) !==
      LOCAL_FILE_HEADER_SIGNATURE
    ) {
      throw new Error("Invalid ZIP local file header.");
    }

    const fileNameLength = view.getUint16(record.localHeaderOffset + 26, true);
    const extraFieldLength = view.getUint16(record.localHeaderOffset + 28, true);
    const dataStart =
      record.localHeaderOffset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + record.compressedSize;

    entries.set(record.fileName, bytes.slice(dataStart, dataEnd));
  }

  return entries;
}

function createLocalFileHeader({
  compressedSize,
  crc32,
  fileNameBytes,
  uncompressedSize,
}: {
  compressedSize: number;
  crc32: number;
  fileNameBytes: Uint8Array;
  uncompressedSize: number;
}): Uint8Array {
  const header = new Uint8Array(30);
  const view = createView(header);

  view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_NEEDED, true);
  view.setUint16(6, UTF8_FILE_NAME_FLAG, true);
  view.setUint16(8, STORE_ONLY_METHOD, true);
  view.setUint32(14, crc32, true);
  view.setUint32(18, compressedSize, true);
  view.setUint32(22, uncompressedSize, true);
  view.setUint16(26, fileNameBytes.byteLength, true);
  view.setUint16(28, 0, true);

  return header;
}

function createCentralDirectoryHeader({
  compressedSize,
  crc32,
  fileNameBytes,
  localHeaderOffset,
  uncompressedSize,
}: {
  compressedSize: number;
  crc32: number;
  fileNameBytes: Uint8Array;
  localHeaderOffset: number;
  uncompressedSize: number;
}): Uint8Array {
  const header = new Uint8Array(46);
  const view = createView(header);

  view.setUint32(0, CENTRAL_DIRECTORY_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_NEEDED, true);
  view.setUint16(6, ZIP_VERSION_NEEDED, true);
  view.setUint16(8, UTF8_FILE_NAME_FLAG, true);
  view.setUint16(10, STORE_ONLY_METHOD, true);
  view.setUint32(16, crc32, true);
  view.setUint32(20, compressedSize, true);
  view.setUint32(24, uncompressedSize, true);
  view.setUint16(28, fileNameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);

  return header;
}

function createEndOfCentralDirectory({
  centralDirectoryOffset,
  centralDirectorySize,
  entryCount,
}: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
}): Uint8Array {
  const header = new Uint8Array(22);
  const view = createView(header);

  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return header;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(
    0,
    view.byteLength - 22 - MAX_ZIP_COMMENT_LENGTH,
  );

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("Invalid ZIP bundle.");
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(path: string): string {
  const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+/u, "");

  if (!normalizedPath || normalizedPath.split("/").includes("..")) {
    throw new Error("Invalid ZIP entry path.");
  }

  return normalizedPath;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeText(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function createView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);
  return copy.buffer;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});
