/* global JSZip */
const ZamerZip = (() => {
  const maxBytes = 256 * 1024 * 1024;
  const maxEntries = 2000;
  const manifestLimit = 1024 * 1024;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const imageTypes = /^image\/(?:jpeg|png|webp|gif|avif|heic|heif|bmp|tiff|x-icon|vnd\.microsoft\.icon)$/i;
  const digest = async bytes => {
    if (!globalThis.crypto?.subtle) {
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return sha256js(binary, true);
    }
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  };

  async function encode(project, settings, readPhoto, documents = []) {
    const zip = new JSZip();
    const manifest = {format: 'zamer-project', version: 1, files: {}, media: []};
    let size = 0;
    async function add(path, bytes) {
      size += bytes.length;
      if (size > maxBytes || Object.keys(manifest.files).length >= maxEntries - 1) {
        throw Error('Проект слишком большой для ZIP');
      }
      manifest.files[path] = {size: bytes.length, sha256: await digest(bytes)};
      zip.file(path, bytes, {createFolders: false});
    }
    await add('project.json', encoder.encode(JSON.stringify({projects: [project], settings})));
    for (const room of project.rooms) {
      for (const photo of room.photos || []) {
        const record = await readPhoto(photo.id);
        if (!record?.data && !record?.original) throw Error('Отсутствует фото ' + photo.id);
        const prefix = 'media/' + manifest.media.length;
        const entry = {room: room.id, photo: photo.id};
        if (record.data) {
          entry.preview = prefix + '-preview.jpg';
          if (!/^data:image\/jpeg[;,]/i.test(record.data)) throw Error('Повреждено изображение сцены: ' + photo.id);
          const preview = await fetch(record.data);
          const bytes = new Uint8Array(await preview.arrayBuffer());
          if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw Error('Повреждено изображение сцены: ' + photo.id);
          await add(entry.preview, bytes);
        }
        if (record.original) {
          if (!record.original.size || record.original.size > maxBytes - size) {
            throw Error('Пустой или слишком большой файл фото: ' + photo.id);
          }
          const ext = (/^image\/(jpeg|png|webp|gif|avif|heic|heif|bmp|tiff)$/i.exec(record.original.type)?.[1] || 'bin').toLowerCase();
          entry.original = prefix + '-original.' + (ext === 'jpeg' ? 'jpg' : ext);
          entry.type = record.original.type || 'application/octet-stream';
          entry.name = record.name || '';
          await add(entry.original, new Uint8Array(await record.original.arrayBuffer()));
        }
        manifest.media.push(entry);
      }
    }
    manifest.documents = [];
    for (const document of documents) {
      if (!/^documents\/[A-Za-z0-9_/-]+\.[a-z0-9]+$/.test(document.path) ||
          document.path.includes('..') || manifest.files[document.path]) throw Error('Некорректный путь документа');
      await add(document.path, document.bytes);
      manifest.documents.push(document.path);
    }
    const metadata = encoder.encode(JSON.stringify(manifest, null, 2));
    if (metadata.length > manifestLimit || size + metadata.length > maxBytes) {
      throw Error('Проект слишком большой для ZIP');
    }
    zip.file('manifest.json', metadata);
    return zip.generateAsync({type: 'uint8array', compression: 'STORE'});
  }

  async function decode(file) {
    if (file.size > maxBytes + 1024 * 1024) throw Error('ZIP слишком большой');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    let total = 0;
    if (entries.length > maxEntries || entries.some(entry => {
      // JSZip 3.10.1 exposes the central directory size here before inflation.
      const size = entry._data?.uncompressedSize;
      total += size;
      return entry.dir || entry.name !== entry.unsafeOriginalName ||
        !Number.isSafeInteger(size) || size < 0 || total > maxBytes;
    })) throw Error('Недопустимая структура ZIP');
    const read = async (entry, limit) => {
      if (!entry || entry._data.uncompressedSize > limit) throw Error('Недопустимый размер файла ZIP');
      // Bound output even if the central directory claims a smaller size.
      const chunks = [];
      let length = 0;
      const stream = entry.internalStream('uint8array');
      return new Promise((resolve, reject) => {
        stream.on('data', chunk => {
          length += chunk.length;
          if (length > limit) {
            stream.pause();
            reject(Error('Недопустимый размер файла ZIP'));
          } else chunks.push(chunk);
        }).on('error', reject).on('end', () => {
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(bytes);
        }).resume();
      });
    };
    const header = zip.file('manifest.json');
    const metadata = await read(header, manifestLimit);
    // The manifest carries the room/photo mapping. Its ZIP CRC also covers names and MIME types.
    let crc = -1;
    for (const value of metadata) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((~crc) !== header._data.crc32) throw Error('Нарушена целостность: manifest.json');
    const manifest = JSON.parse(decoder.decode(metadata));
    if (manifest.format !== 'zamer-project' || manifest.version !== 1 ||
        !Array.isArray(manifest.media) || manifest.media.length >= maxEntries ||
        !manifest.files || entries.length !== Object.keys(manifest.files).length + 1) {
      throw Error('Неизвестный формат ZIP проекта');
    }
    const used = new Set(['manifest.json']);
    async function verify(path) {
      if (typeof path !== 'string' || used.has(path) || !Object.hasOwnProperty.call(manifest.files, path)) {
        throw Error('Некорректный файл ZIP');
      }
      used.add(path);
      const {size, sha256} = manifest.files[path];
      if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw Error('Недопустимый размер файла ZIP');
      const entry = zip.file(path);
      if (entry?._data?.uncompressedSize !== size) throw Error('Нарушена целостность: ' + path);
      const bytes = await read(entry, size);
      if (bytes.length !== size || await digest(bytes) !== sha256) throw Error('Нарушена целостность: ' + path);
      return bytes;
    }
    const backup = JSON.parse(decoder.decode(await verify('project.json')));
    if (backup.projects?.length !== 1) throw Error('Ожидался один проект');
    const records = new Map();
    for (const [i, entry] of manifest.media.entries()) {
      const prefix = 'media/' + i;
      if ((!entry.preview && !entry.original) ||
          (entry.preview && entry.preview !== prefix + '-preview.jpg') ||
          (entry.original && !new RegExp('^' + prefix + '-original\\.[a-z]{2,4}$').test(entry.original))) {
        throw Error('Некорректный путь к фото');
      }
      let data;
      if (entry.preview) {
        const bytes = await verify(entry.preview);
        if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw Error('Повреждено изображение сцены');
        data = 'data:image/jpeg;base64,' + b64Bytes(bytes);
      }
      const type = imageTypes.test(entry.type) ? entry.type : 'application/octet-stream';
      const original = entry.original ? new Blob([await verify(entry.original)], {type}) : null;
      const key = JSON.stringify([entry.room, entry.photo]);
      if (records.has(key)) throw Error('Повторяющееся фото в ZIP');
      records.set(key, {data, original, name: typeof entry.name === 'string' ? entry.name : ''});
    }
    if (manifest.documents !== undefined && !Array.isArray(manifest.documents)) throw Error('Повреждён список документов');
    for (const path of manifest.documents || []) {
      if (typeof path !== 'string' || !/^documents\/[A-Za-z0-9_/-]+\.[a-z0-9]+$/.test(path) || path.includes('..')) throw Error('Некорректный путь документа');
      await verify(path);
    }
    if (used.size !== entries.length) throw Error('В ZIP есть лишние файлы');
    return {backup, records};
  }

  return {encode, decode};
})();
