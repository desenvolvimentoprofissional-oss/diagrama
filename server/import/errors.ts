export class ImportError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'ImportError'; }
}
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_BLOCKS = 6000;
export const IMPORT_MAX_PAGES = 150;
export const IMPORT_MAX_TEXT = 2_000_000;
