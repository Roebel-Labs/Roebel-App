/**
 * Hidden WebView that makes Semaphore proofs (lib/zk/prover.ts). Zero size, no UI. Loads the
 * committed prover page (zk/prover-html.generated.ts) with the self-hosted artifact folder as
 * base URL, so artifact fetches are same-origin. Restarts the WebView after a crash or a timed
 * out request; in-flight requests then fail with `crashed`.
 *
 * Task 1 mounts it only in the dev benchmark (app/dev/zk-bench.tsx); the root mount comes with
 * Task 6, after the owner gate.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PROVER_HTML } from '@/zk/prover-html.generated';
import {
  ARTIFACT_BASE_URL,
  failAllPending,
  handleProverMessage,
  onProverTimeout,
  setProverTransport,
} from '@/lib/zk/prover';

let restarts = 0;
/** How often a host restarted its WebView since the app started (benchmark readout). */
export function proverRestarts(): number {
  return restarts;
}

export default function ZkProverHost() {
  const ref = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);

  const restart = useCallback((reason: string) => {
    setProverTransport(null);
    failAllPending(reason);
    restarts += 1;
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => onProverTimeout(() => restart('timeout')), [restart]);
  useEffect(() => () => setProverTransport(null), []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const data = e.nativeEvent.data;
    if (data === '{"type":"ready"}') {
      setProverTransport((msg) => {
        ref.current?.injectJavaScript(`window.__zkReceive(${JSON.stringify(msg)});true;`);
      });
      return;
    }
    handleProverMessage(data);
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={generation}
        ref={ref}
        source={{ html: PROVER_HTML, baseUrl: ARTIFACT_BASE_URL }}
        originWhitelist={['about:*', `${ARTIFACT_BASE_URL}*`]}
        javaScriptEnabled
        onMessage={onMessage}
        onContentProcessDidTerminate={() => restart('crashed')}
        onRenderProcessGone={() => restart('crashed')}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' },
});
