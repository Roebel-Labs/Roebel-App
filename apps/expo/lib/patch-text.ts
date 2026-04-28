import React from 'react';
import { Text, StyleSheet } from 'react-native';

const TextAny = Text as any;
const originalRender = TextAny.render;

TextAny.render = function patchedRender(...args: any[]) {
  const element = originalRender.apply(this, args);
  const flat = StyleSheet.flatten(element.props.style) as
    | { fontSize?: number; fontFamily?: string }
    | undefined;

  if (flat && flat.fontSize && flat.fontSize > 16 && flat.fontFamily === 'Inter-Regular') {
    return React.cloneElement(element, {
      style: [element.props.style, { fontFamily: 'Inter-Medium' }],
    });
  }
  return element;
};

export {};
