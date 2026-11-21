/**
 * Full-screen photo gallery opened from a detail hero. Kept as a thin wrapper
 * so existing callers keep their props — the actual lightbox (header, rounded
 * frames, parallax paging, zoom) is the shared ImageZoomModal.
 */
import React from 'react';
import ImageZoomModal from '@/components/ImageZoomModal';

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  title?: string;
  onShowOverview?: () => void;
  onClose: () => void;
};

export default function ImageGalleryModal({ visible, images, initialIndex = 0, title, onShowOverview, onClose }: Props) {
  return (
    <ImageZoomModal
      visible={visible}
      images={images}
      initialIndex={initialIndex}
      title={title}
      onShowOverview={onShowOverview}
      onClose={onClose}
    />
  );
}
