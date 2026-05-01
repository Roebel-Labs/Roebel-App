import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { softShadow } from '@/lib/shadow';

interface CitizenPassportCardProps {
  verifiedSince?: string;
  attestedBy?: number;
  verificationRequestId?: number | null;
  // Optional height override; default matches the in-place version on profile
  height?: number;
}

export default function CitizenPassportCard({
  verifiedSince,
  attestedBy = 0,
  verificationRequestId,
  height = 240,
}: CitizenPassportCardProps) {
  return (
    <View style={[styles.card, { height }, softShadow(2)]}>
      {/* Gradient + decorative pattern */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="passportGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#194383" />
              <Stop offset="0.4" stopColor="#0f2b55" />
              <Stop offset="0.7" stopColor="#194383" />
              <Stop offset="1" stopColor="#2563eb" />
            </LinearGradient>
          </Defs>
          <Rect width="400" height="200" fill="url(#passportGrad)" />
          <Path d="M0,35 Q100,15 200,45 T400,25" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,60 Q80,40 160,70 T400,50" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,85 Q120,65 240,95 T400,75" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,110 Q90,90 180,120 T400,100" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,135 Q110,115 220,145 T400,125" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,160 Q100,140 200,170 T400,150" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Path d="M0,185 Q80,165 160,195 T400,175" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
          <Rect x="260" y="50" width="50" height="70" rx="3" fill="none" stroke="white" strokeWidth="0.8" opacity="0.08" />
          <Line x1="285" y1="50" x2="285" y2="120" stroke="white" strokeWidth="0.8" opacity="0.08" />
          <Line x1="260" y1="85" x2="310" y2="85" stroke="white" strokeWidth="0.8" opacity="0.08" />
        </Svg>
      </View>

      <View style={styles.content}>
        <View>
          <Text style={styles.title}>Bürgerausweis</Text>
          <Text style={styles.subtitle}>STADT RÖBEL/MÜRITZ</Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.info}>
            {verifiedSince ? (
              <>
                <Text style={styles.label}>VERIFIZIERT SEIT</Text>
                <Text style={styles.value}>{verifiedSince}</Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>STATUS</Text>
                <Text style={styles.value}>Nicht verifiziert</Text>
              </>
            )}
            {attestedBy > 0 && (
              <>
                <Text style={[styles.label, { marginTop: 10 }]}>ATTESTIERT DURCH</Text>
                <Text style={styles.value}>{attestedBy} Bürger</Text>
              </>
            )}
          </View>

          <View style={styles.qr}>
            {verificationRequestId ? (
              <QRCode
                value={`roebel://verification/request/${verificationRequestId}?type=citizen`}
                size={76}
                backgroundColor="white"
                color="#194383"
              />
            ) : (
              <Text style={styles.qrPlaceholder}>QR</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#194383',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  qr: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  qrPlaceholder: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#194383',
  },
});
