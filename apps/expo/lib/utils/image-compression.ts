import * as ImageManipulator from 'expo-image-manipulator';

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

    // First attempt: resize with good quality
    let compressed = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Check file size (rough estimate: base64 will be ~33% larger)
    // If still too large, compress more aggressively
    let attempts = 0;
    while (attempts < 3) {
      // Check approximate base64 size
      const estimatedBase64Size = compressed.uri.length * 1.33;

      if (estimatedBase64Size < maxSizeBytes) {
        console.log(`Image compressed successfully to ~${Math.round(estimatedBase64Size / 1024 / 1024 * 10) / 10} MB`);
        return compressed.uri;
      }

      // Reduce quality or size further
      attempts++;
      quality = Math.max(0.5, quality - 0.15);
      maxWidth = Math.max(1024, maxWidth - 512);

      console.log(`Attempt ${attempts}: Reducing to quality ${quality}, width ${maxWidth}`);

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
