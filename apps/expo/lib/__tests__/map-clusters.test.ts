import { boundsSpanMeters, groupPins, project } from '@/lib/map/clusters';
import type { MapFeatureProperties, MapGeoJSON } from '@/lib/map/geojson';

const pin = (
  fid: string,
  lon: number,
  lat: number,
  rank = 20
): MapGeoJSON['features'][number] => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { fid, id: fid, title: fid, rank } as MapFeatureProperties,
});

const collection = (...features: MapGeoJSON['features']): MapGeoJSON => ({
  type: 'FeatureCollection',
  features,
});

describe('project', () => {
  it('doubles screen distance per zoom level', () => {
    const [x1] = project(12.6, 53.37, 14);
    const [x2] = project(12.61, 53.37, 14);
    const [y1] = project(12.6, 53.37, 15);
    const [y2] = project(12.61, 53.37, 15);
    expect(y2 - y1).toBeCloseTo(2 * (x2 - x1), 6);
  });
});

describe('groupPins', () => {
  // ~0.0005° lon ≈ 33 m at Röbel's latitude.
  const a = pin('a', 12.6, 53.37, 20);
  const b = pin('b', 12.6005, 53.37, 30);
  const far = pin('far', 12.7, 53.37);

  it('groups close pins and leaves distant ones single', () => {
    const { singles, groups } = groupPins(collection(a, b, far), 14, 52);
    expect(groups).toHaveLength(1);
    expect(singles.features.map((f) => f.properties.fid)).toEqual(['far']);
  });

  it('lets the highest rank anchor the group and lead its members', () => {
    const { groups } = groupPins(collection(a, b), 14, 52);
    expect(groups[0].members.map((m) => m.fid)).toEqual(['b', 'a']);
    expect(groups[0].coordinate).toEqual([12.6005, 53.37]);
  });

  it('separates the same pins once zoomed in far enough', () => {
    const { singles, groups } = groupPins(collection(a, b), 18, 52);
    expect(groups).toHaveLength(0);
    expect(singles.features).toHaveLength(2);
  });

  it('keeps pins on the very same spot grouped at max zoom', () => {
    const twin = pin('twin', 12.6, 53.37);
    expect(groupPins(collection(a, twin), 18, 52).groups).toHaveLength(1);
  });

  it('never swallows the selected pin', () => {
    const { singles, groups } = groupPins(collection(a, b), 14, 52, 'a');
    expect(groups).toHaveLength(0);
    expect(singles.features.map((f) => f.properties.fid).sort()).toEqual(['a', 'b']);
  });

  it('gives a group a key that does not depend on member order', () => {
    const one = groupPins(collection(a, b), 14, 52).groups[0].key;
    const two = groupPins(collection(b, a), 14, 52).groups[0].key;
    expect(one).toBe(two);
  });

  it('reports the ground span of a group', () => {
    const { groups } = groupPins(collection(a, b), 14, 52);
    expect(boundsSpanMeters(groups[0].bounds)).toBeGreaterThan(25);
    expect(boundsSpanMeters(groups[0].bounds)).toBeLessThan(40);
  });
});
