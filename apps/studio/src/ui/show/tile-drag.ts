// Drag & drop for the Show tab tile strips: tiles are reordered by dragging; files dropped from the
// file manager onto the strip are handed to `onFiles` (only strips that pass it accept files).

import { useState, type DragEvent } from 'react';

const MIME = 'application/x-ortis-tile';

export function useTileDrag(group: string, onMove: (id: string, to: number) => void, onFiles?: (files: File[]) => void) {
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const isTile = (e: DragEvent) => e.dataTransfer.types.includes(`${MIME}-${group}`);
  const isFile = (e: DragEvent) => !!onFiles && e.dataTransfer.types.includes('Files');

  const tileProps = (id: string, index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(`${MIME}-${group}`, id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent) => {
      if (!isTile(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overIndex !== index) setOverIndex(index);
    },
    onDrop: (e: DragEvent) => {
      if (!isTile(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOverIndex(null);
      const dragged = e.dataTransfer.getData(`${MIME}-${group}`);
      if (dragged && dragged !== id) onMove(dragged, index);
    },
    onDragEnd: () => setOverIndex(null),
  });

  const stripProps = {
    onDragOver: (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!fileOver) setFileOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setFileOver(false);
      setOverIndex(null);
    },
    onDrop: (e: DragEvent) => {
      setFileOver(false);
      if (!isFile(e)) return;
      e.preventDefault();
      onFiles!(Array.from(e.dataTransfer.files));
    },
  };

  return { tileProps, stripProps, overIndex, fileOver };
}
