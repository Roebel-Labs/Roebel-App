import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Compress and resize image to fit within size limit
 * Target: ~3.5 MB raw image = ~4.6 MB base64 (under 5 MB limit)
 */
export async function compressImageForVisionAPI(
  localUri: string,
  maxSizeBytes: number = 3670016 // 3.5 MB raw = ~4.6 MB base64
): Promise<string> {
  try {
    console.log('Compressing image for Vision API:', localUri);

    // Start with 80% quality and max width of 2048px
    let quality = 0.8;
    let maxWidth = 2048;

    let compressed = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Check actual file size on disk (not URI string length)
    let attempts = 0;
    while (attempts < 3) {
      const fileInfo = await FileSystem.getInfoAsync(compressed.uri);
      const fileSize = (fileInfo as any).size || 0;

      if (fileSize > 0 && fileSize < maxSizeBytes) {
        console.log(`Image compressed successfully to ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        return compressed.uri;
      }

      // Reduce quality or size further
      attempts++;
      quality = Math.max(0.5, quality - 0.15);
      maxWidth = Math.max(1024, maxWidth - 512);

      console.log(`Attempt ${attempts}: file ${(fileSize / 1024 / 1024).toFixed(2)} MB, reducing to quality ${quality}, width ${maxWidth}`);

      compressed = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: maxWidth } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );
    }

    // Return best attempt
    console.log('Image compressed to smallest possible size');
    return compressed.uri;

  } catch (error) {
    console.error('Image compression error:', error);
    // Return original if compression fails
    return localUri;
  }
}
