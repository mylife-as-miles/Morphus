import { RepeatWrapping, SRGBColorSpace, TextureLoader } from "three";

/** 1×1 PNG used as a neutral multiply for multi-layer UV masks. */
export const WHITE_PREVIEW_TEXTURE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=";

const previewTextureCache = new Map<string, ReturnType<TextureLoader["load"]>>();

export function loadPreviewTexture(source: string, isColor: boolean) {
  const cacheKey = `${isColor ? "color" : "data"}:${source}`;
  const cached = previewTextureCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const texture = new TextureLoader().load(source);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  if (isColor) {
    texture.colorSpace = SRGBColorSpace;
  }

  previewTextureCache.set(cacheKey, texture);

  return texture;
}
