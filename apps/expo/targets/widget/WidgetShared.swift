// Helpers shared by the Röbel widgets (Mini Apps, Mittagstisch, Events).
import SwiftUI
import UIKit
import WidgetKit

let widgetAppGroup = "group.com.maxbrych.roebelonchain.widgets"

/// Payload image: base64 JPEG/PNG from the app, or "asset:<name>" for the bundled
/// gallery samples. Downsampled so WidgetKit never rejects it for its pixel size
/// (archival fails when an image has more pixels than the widget itself).
func widgetImage(_ source: String?, maxSide: CGFloat = 420) -> UIImage? {
  guard let source, !source.isEmpty else { return nil }
  let image: UIImage?
  if source.hasPrefix("asset:") {
    image = UIImage(named: String(source.dropFirst(6)))
  } else if let data = Data(base64Encoded: source) {
    image = UIImage(data: data)
  } else {
    image = nil
  }
  guard let image else { return nil }
  let longest = max(image.size.width, image.size.height) * image.scale
  guard longest > maxSide else { return image }
  let factor = maxSide / longest
  let target = CGSize(
    width: (image.size.width * image.scale * factor).rounded(),
    height: (image.size.height * image.scale * factor).rounded()
  )
  return image.preparingThumbnail(of: target) ?? image
}

/// Rows of `rowHeight` (gap between rows) that fit completely — never a half row.
/// Same as rowsThatFit in apps/expo/lib/widget-layout.ts.
func widgetRowsThatFit(_ available: CGFloat, rowHeight: CGFloat, gap: CGFloat) -> Int {
  guard available > 0, rowHeight > 0 else { return 0 }
  return max(0, Int(((available + gap) / (rowHeight + gap)).rounded(.down)))
}

/// The app icon in the corner of the events widget.
struct AppBadge: View {
  var size: CGFloat = 18
  var body: some View {
    Image("appBadge")
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
  }
}
