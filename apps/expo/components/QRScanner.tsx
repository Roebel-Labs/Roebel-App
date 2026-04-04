/**
 * QR Scanner Component
 *
 * Camera-based QR code scanner for verification requests
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import ErrorDrawer from './ErrorDrawer';

export type QRScanResult = {
  type: 'verification' | 'checkpoint' | 'stamp' | 'unknown';
  data: string;
  id?: string;
  nftType?: string;
};

interface QRScannerProps {
  onScan?: (result: QRScanResult) => void;
  /** Restrict to specific QR types. If omitted, all types are handled. */
  allowedTypes?: QRScanResult['type'][];
}

function parseQRCode(data: string): QRScanResult {
  // Verification: hometownevents://verification/request/{id}?type=citizen
  const verificationMatch = data.match(/hometownevents:\/\/verification\/request\/(\d+)\?type=(\w+)/);
  if (verificationMatch) {
    return { type: 'verification', data, id: verificationMatch[1], nftType: verificationMatch[2] };
  }

  // Explorer checkpoint: roebel-checkpoint:<qr_code>
  if (data.startsWith('roebel-checkpoint:')) {
    return { type: 'checkpoint', data, id: data.replace('roebel-checkpoint:', '') };
  }

  // Stamp card: roebel-stamp:<partner_id>
  if (data.startsWith('roebel-stamp:')) {
    return { type: 'stamp', data, id: data.replace('roebel-stamp:', '') };
  }

  return { type: 'unknown', data };
}

export default function QRScanner({ onScan, allowedTypes }: QRScannerProps) {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    const result = parseQRCode(data);

    // Check if this type is allowed
    if (allowedTypes && !allowedTypes.includes(result.type)) {
      const typeLabels: Record<string, string> = {
        verification: 'Verifizierung',
        checkpoint: 'Explorer-Checkpoint',
        stamp: 'Stempelkarte',
      };
      const expected = allowedTypes.map(t => typeLabels[t] || t).join(' oder ');
      setErrorDrawer({
        visible: true,
        message: `Dieser QR-Code ist kein ${expected}-Code.`,
      });
      setScanned(false);
      return;
    }

    if (result.type === 'unknown') {
      setErrorDrawer({
        visible: true,
        message: 'Dieser QR-Code wird nicht erkannt.',
      });
      setScanned(false);
      return;
    }

    if (onScan) {
      onScan(result);
      return;
    }

    // Default navigation based on type
    if (result.type === 'verification' && result.id) {
      router.push(`/verification/request/${result.id}?type=${result.nftType}` as any);
    } else if (result.type === 'checkpoint') {
      // Handled by parent via onScan
      setScanned(false);
    } else if (result.type === 'stamp') {
      // Handled by parent via onScan
      setScanned(false);
    }
  };

  // No automatic error drawer for camera permission
  // The UI already shows a message and button to request permission

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Lade Kamera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Kamera-Berechtigung erforderlich</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Berechtigung erteilen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top overlay */}
          <View style={styles.overlayTop} />

          {/* Middle section with scanning frame */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanFrame}>
              {/* Corner indicators */}
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.overlaySide} />
          </View>

          {/* Bottom overlay with instructions */}
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionText}>
              QR-Code in den Rahmen positionieren
            </Text>
            {scanned && (
              <Pressable
                style={styles.scanAgainButton}
                onPress={() => setScanned(false)}
              >
                <Text style={styles.scanAgainButtonText}>Erneut scannen</Text>
              </Pressable>
            )}
          </View>
        </View>
      </CameraView>

      {/* Error Drawer */}
      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: 250,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#ffffff',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  instructionText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  scanAgainButton: {
    backgroundColor: '#194383',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  scanAgainButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  message: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    textAlign: 'center',
    padding: 32,
  },
  button: {
    backgroundColor: '#194383',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginHorizontal: 32,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    textAlign: 'center',
  },
});
