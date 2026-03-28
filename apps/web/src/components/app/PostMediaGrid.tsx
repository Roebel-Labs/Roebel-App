"use client";

import Image from "next/image";

interface PostMediaGridProps {
  mediaUrls: string[];
  onImageClick: (index: number) => void;
}

export function PostMediaGrid({ mediaUrls, onImageClick }: PostMediaGridProps) {
  if (mediaUrls.length === 0) return null;

  if (mediaUrls.length === 1) {
    return (
      <div
        className="relative w-full aspect-[4/3] max-h-[75vw] sm:max-h-[400px] overflow-hidden cursor-pointer"
        onClick={() => onImageClick(0)}
      >
        <Image
          src={mediaUrls[0]}
          alt=""
          fill
          className="object-cover blur-xl scale-110"
          aria-hidden="true"
          sizes="(max-width: 640px) 100vw, 640px"
        />
        <Image
          src={mediaUrls[0]}
          alt="Beitragsbild"
          fill
          className="object-contain relative z-10"
          sizes="(max-width: 640px) 100vw, 640px"
        />
      </div>
    );
  }

  if (mediaUrls.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden">
        {mediaUrls.map((url, i) => (
          <div
            key={i}
            className="relative aspect-square cursor-pointer overflow-hidden"
            onClick={() => onImageClick(i)}
          >
            <Image
              src={url}
              alt={`Bild ${i + 1}`}
              fill
              className="object-cover hover:scale-105 transition-transform duration-200"
              sizes="(max-width: 640px) 50vw, 320px"
            />
          </div>
        ))}
      </div>
    );
  }

  if (mediaUrls.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden">
        <div
          className="relative row-span-2 cursor-pointer overflow-hidden"
          onClick={() => onImageClick(0)}
        >
          <Image
            src={mediaUrls[0]}
            alt="Bild 1"
            fill
            className="object-cover hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 640px) 50vw, 320px"
          />
        </div>
        {mediaUrls.slice(1).map((url, i) => (
          <div
            key={i}
            className="relative aspect-square cursor-pointer overflow-hidden"
            onClick={() => onImageClick(i + 1)}
          >
            <Image
              src={url}
              alt={`Bild ${i + 2}`}
              fill
              className="object-cover hover:scale-105 transition-transform duration-200"
              sizes="(max-width: 640px) 50vw, 320px"
            />
          </div>
        ))}
      </div>
    );
  }

  // 4+ images: 2x2 grid with +N overlay
  const visibleImages = mediaUrls.slice(0, 4);
  const remaining = mediaUrls.length - 4;

  return (
    <div className="grid grid-cols-2 gap-0.5 overflow-hidden">
      {visibleImages.map((url, i) => (
        <div
          key={i}
          className="relative aspect-square cursor-pointer overflow-hidden"
          onClick={() => onImageClick(i)}
        >
          <Image
            src={url}
            alt={`Bild ${i + 1}`}
            fill
            className="object-cover hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 640px) 50vw, 320px"
          />
          {i === 3 && remaining > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
              <span className="text-white text-2xl font-semibold">
                +{remaining}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
