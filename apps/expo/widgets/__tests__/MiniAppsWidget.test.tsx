/**
 * Android widget layout: Erkunden-style tiles, 4 columns, last tile "Alle" (store),
 * unread dot, empty state.
 */
import React from 'react';
import { MiniAppsWidget } from '../MiniAppsWidget';
import type { WidgetPayload } from '@/lib/widget-payload';

jest.mock('react-native-android-widget', () => {
  const mk = (n: string) => Object.assign((_: any) => null, { displayName: n });
  return {
    FlexWidget: mk('FlexWidget'),
    TextWidget: mk('TextWidget'),
    ImageWidget: mk('ImageWidget'),
    OverlapWidget: mk('OverlapWidget'),
  };
});

/** Expands our own function components; stops at the library's widget primitives. */
function expand(node: any): any {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function' && !node.type.displayName) return expand(node.type(node.props));
  return [node, ...expand(node.props?.children)];
}

const clickUris = (tree: any) =>
  expand(tree)
    .filter((n: any) => n.props?.clickAction === 'OPEN_URI')
    .map((n: any) => n.props.clickActionData.uri);

function payload(n: number, unread: string[] = []): WidgetPayload {
  return {
    v: 1,
    updatedAt: 0,
    apps: Array.from({ length: n }, (_, i) => ({
      slug: `a${i}`,
      name: `App ${i}`,
      color: '#123456',
      icon: i === 0 ? 'QUJD' : null,
      unread: unread.includes(`a${i}`),
      url: `roebel://mini-app/a${i}?open=1`,
    })),
  };
}

it('4×4: 15 apps plus the Alle tile last', () => {
  const uris = clickUris(<MiniAppsWidget payload={payload(15)} width={320} height={340} dark={false} />);
  expect(uris).toHaveLength(16);
  expect(uris[0]).toBe('roebel://mini-app/a0?open=1');
  expect(uris[15]).toBe('roebel://mini-apps');
});

it('4×2: 7 apps plus Alle', () => {
  const uris = clickUris(<MiniAppsWidget payload={payload(15)} width={320} height={170} dark={false} />);
  expect(uris).toEqual([...Array.from({ length: 7 }, (_, i) => `roebel://mini-app/a${i}?open=1`), 'roebel://mini-apps']);
});

it('fewer apps than slots: Alle follows the last app', () => {
  const uris = clickUris(<MiniAppsWidget payload={payload(2)} width={320} height={340} dark={false} />);
  expect(uris).toEqual(['roebel://mini-app/a0?open=1', 'roebel://mini-app/a1?open=1', 'roebel://mini-apps']);
});

it('icons render as data URIs, missing icons as a letter', () => {
  const nodes = expand(<MiniAppsWidget payload={payload(2)} width={320} height={170} dark={false} />);
  expect(nodes.some((n: any) => n.props?.image === 'data:image/png;base64,QUJD')).toBe(true);
  expect(nodes.some((n: any) => n.type.displayName === 'TextWidget' && n.props.text === 'A')).toBe(true);
});

it('an app with unread notifications gets the red dot', () => {
  const dots = (p: WidgetPayload) =>
    expand(<MiniAppsWidget payload={p} width={320} height={170} dark={false} />).filter(
      (n: any) => n.props?.style?.backgroundColor === '#FF3B30',
    ).length;
  expect(dots(payload(3, ['a1']))).toBe(1);
  expect(dots(payload(3))).toBe(0);
});

it('empty payload asks to choose apps and opens the settings', () => {
  const nodes = expand(<MiniAppsWidget payload={null} width={320} height={170} dark />);
  expect(nodes.some((n: any) => n.props?.text === 'Mini Apps auswählen')).toBe(true);
  expect(clickUris(<MiniAppsWidget payload={null} width={320} height={170} dark />)).toEqual(['roebel://settings/widget']);
});
