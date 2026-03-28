"use client"

import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useEffect } from "react"

export function EventsHero() {
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false)
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect if device is mobile
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])
  return (
    <section className="bg-card py-8 md:py-12 lg:py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col lg:flex-row items-center gap-6 md:gap-8 lg:gap-12">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-5xl sm:text-5xl md:text-5xl lg:text-7xl tracking-tight font-medium mb-4 md:mb-6 text-foreground leading-tight"> 
              Entdecke Veranstaltungen
              <br />
              <span className="text-primary tracking-tight">in Röbel/Müritz</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-6 md:mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Finde lokale Veranstaltungen in deiner Nähe und verpasse nie wieder ein Event.
            </p>

            <div className="flex flex-row justify-center items-center gap-3 max-w-md mx-auto lg:mx-0 lg:justify-start">
              {/* Google Play Button */}
              {isMobile ? (
                <a
                  href="https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-12 w-auto cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image
                    src="/GetItOnGooglePlay_Badge_Web_color_German.png"
                    alt="Jetzt bei Google Play"
                    width={135}
                    height={48}
                    className="h-12 w-auto"
                  />
                </a>
              ) : (
                <button
                  onClick={() => setIsAndroidModalOpen(true)}
                  className="relative h-12 w-auto cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image
                    src="/GetItOnGooglePlay_Badge_Web_color_German.png"
                    alt="Jetzt bei Google Play"
                    width={135}
                    height={48}
                    className="h-12 w-auto"
                  />
                </button>
              )}

              {/* App Store Button */}
              {isMobile ? (
                <a
                  href="https://apps.apple.com/de/app/r%C3%B6bel/id6754984699"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-12 w-auto cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image
                    src="/Download_on_the_App_Store_Badge_DK_RGB_blk_100217.svg"
                    alt="Download on the App Store"
                    width={120}
                    height={48}
                    className="h-12 w-auto"
                  />
                </a>
              ) : (
                <button
                  onClick={() => setIsIOSModalOpen(true)}
                  className="relative h-12 w-auto cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image
                    src="/Download_on_the_App_Store_Badge_DK_RGB_blk_100217.svg"
                    alt="Download on the App Store"
                    width={120}
                    height={48}
                    className="h-12 w-auto"
                  />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex justify-center lg:justify-center">
            <div className="relative w-72 sm:w-80 md:w-96 lg:w-[560px] aspect-square">
              <Image
                src="/hero-img.png"
                alt="Röbel/Müritz Events"
                fill
                className="object-contain rounded-2xl"
                sizes="(max-width: 640px) 288px, (max-width: 768px) 320px, (max-width: 1024px) 384px, 560px"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      {/* Android QR Code Modal */}
      <Dialog open={isAndroidModalOpen} onOpenChange={setIsAndroidModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">App herunterladen</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-center text-muted-foreground">
              Scanne den QR-Code, um die App auf Android herunterzuladen.
            </p>
            <div className="relative w-64 h-64">
              <Image
                src="/qr-android.png"
                alt="Android QR Code"
                fill
                className="object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* iOS QR Code Modal */}
      <Dialog open={isIOSModalOpen} onOpenChange={setIsIOSModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">App herunterladen</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-center text-muted-foreground">
              Scanne den QR-Code, um die App auf iOS herunterzuladen.
            </p>
            <div className="relative w-64 h-64">
              <Image
                src="/qr-ios.png"
                alt="iOS QR Code"
                fill
                className="object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
