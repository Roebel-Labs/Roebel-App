import { Check, Dumbbell, Heart, PartyPopper, Store, Users } from 'lucide-react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Avatar, C, Card, Coin, FONT, FlyingCoin, Pill, Reveal, Shadow, Tile, at, ramp, smooth, usePop, useRamp } from './parts';
import type { SceneId } from './script';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Scene 1: the places of the town, then everyone who shows up. */
function Town() {
  const visitors = [140, 260, 380, 500, 620, 740, 860];
  return (
    <>
      <Tile x={190} y={390} icon={Store} label="Laden" start={10} activeAt={96} />
      <Tile x={500} y={390} icon={Dumbbell} label="Verein" start={20} activeAt={134} />
      <Tile x={810} y={390} icon={PartyPopper} label="Fest" start={30} activeAt={172} />
      {visitors.map((x, i) => (
        <Avatar key={x} x={x} y={800} size={110} start={224 + i * 5} shift={90} />
      ))}
    </>
  );
}

/** Scene 2: the answer to the question is one Münze. */
function Question() {
  const frame = useCurrentFrame();
  const drop = usePop(62, 11);
  const y = interpolate(drop, [0, 1], [-260, 430]);
  const squash = 1 + Math.sin(Math.min(1, Math.max(0, (frame - 74) / 10)) * Math.PI) * 0.06;
  const float = Math.sin((frame - 90) / 14) * 8 * Math.min(1, Math.max(0, (frame - 90) / 20));
  return (
    <>
      <Shadow x={500} y={690} width={360 * (0.5 + 0.5 * drop)} strength={drop} />
      <Coin x={500} y={y + float} size={400} scale={squash} rotate={(1 - drop) * -28} opacity={Math.min(1, drop * 5)} glint={ramp(frame, 96, 30, smooth)} />
      <div style={at(500, 850)}>
        <Reveal text="Röbel Münzen" start={98} size={120} style={{ whiteSpace: 'nowrap' }} />
      </div>
    </>
  );
}

const WEEK = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_TICKS = [70, 125, 180, 235];

/** Scene 3: every verified citizen receives the same, every day. */
function Belonging() {
  const frame = useCurrentFrame();
  const today = DAY_TICKS.filter((tick) => frame >= tick).length - 1;
  const people = Array.from({ length: 16 }, (_, i) => ({ x: 185 + (i % 4) * 210, y: 330 + Math.floor(i / 4) * 185, i }));
  return (
    <>
      <div style={{ ...at(500, 120), display: 'flex', gap: 18 }}>
        {WEEK.map((day, i) => {
          const on = i === today;
          const done = i < today;
          return (
            <div
              key={day}
              style={{
                width: 92,
                height: 92,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.body,
                fontWeight: 600,
                fontSize: 34,
                background: on ? C.navy : C.card,
                color: on ? C.white : done ? C.ink : C.faint,
                border: on ? 'none' : `2px solid ${C.line}`,
                boxSizing: 'border-box',
                opacity: ramp(frame, 20 + i * 3, 16),
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
      {people.map((p) => (
        <Avatar key={p.i} x={p.x} y={p.y} size={112} start={6 + p.i * 2} verifiedAt={40 + p.i * 2} />
      ))}
      {people.map((p) =>
        DAY_TICKS.map((tick, d) => (
          <FlyingCoin key={`${p.i}-${d}`} from={[p.x + 8, p.y - 150]} to={[p.x + 50, p.y + 46 - d * 11]} start={tick + (p.i % 4) * 2 + Math.floor(p.i / 4) * 2} duration={18} lift={0} size={46} keep />
        )),
      )}
    </>
  );
}

/** Scene 4: helping with a project is rewarded; a good contribution can be thanked. */
function TakingPart() {
  const frame = useCurrentFrame();
  const progress = ramp(frame, 40, 60, smooth);
  const done = usePop(100, 11);
  const post = 212;
  const heart = usePop(post + 78, 10);
  return (
    <>
      <Card x={500} y={210} width={760} height={270} start={8}>
        <div style={{ padding: '44px 52px', fontFamily: FONT.body }}>
          <div style={{ fontWeight: 500, fontSize: 32, color: C.muted }}>Vorhaben</div>
          <div style={{ fontFamily: FONT.heading, fontWeight: 700, fontSize: 64, color: C.ink, marginTop: 6 }}>Stadtfest aufbauen</div>
          <div style={{ marginTop: 30, height: 14, borderRadius: 7, background: C.line, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 7, background: C.navy }} />
          </div>
        </div>
        <div style={{ position: 'absolute', right: 44, top: 44, width: 72, height: 72, borderRadius: '50%', background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${done})` }}>
          <Check size={42} color={C.white} strokeWidth={3} />
        </div>
      </Card>

      <Avatar x={230} y={640} size={190} start={22} verifiedAt={34} />
      {[0, 1, 2].map((i) => (
        <FlyingCoin key={i} from={[800, 250]} to={[392 + i * 58, 668]} start={112 + i * 9} duration={30} lift={150} size={86} keep={frame < post + 50 || i < 2} />
      ))}

      <Card x={745} y={790} width={410} height={250} start={post}>
        <div style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', border: `3px solid ${C.ink}`, boxSizing: 'border-box' }} />
            <div style={{ height: 16, width: 150, borderRadius: 8, background: C.ink }} />
          </div>
          <div style={{ height: 14, borderRadius: 7, background: C.line }} />
          <div style={{ height: 14, width: '78%', borderRadius: 7, background: C.line }} />
          <div style={{ height: 14, width: '52%', borderRadius: 7, background: C.line }} />
        </div>
        <div style={{ position: 'absolute', right: 30, bottom: 26, transform: `scale(${heart})` }}>
          <Heart size={44} color={C.navy} fill={C.navy} />
        </div>
      </Card>
      <FlyingCoin from={[508, 668]} to={[880, 700]} start={post + 50} duration={28} lift={130} size={86} keep />
      <Pill x={610} y={640} text="Danke!" start={post + 82} accent />
    </>
  );
}

const RING = { cx: 500, cy: 500, r: 300 };
const onRing = (deg: number, r = RING.r): [number, number] => [RING.cx + Math.cos((deg * Math.PI) / 180) * r, RING.cy + Math.sin((deg * Math.PI) / 180) * r];

/** Scene 5: Münzen pass from hand to hand and stay in town. */
function StaysLocal() {
  const frame = useCurrentFrame();
  const draw = ramp(frame, 6, 44, smooth);
  const turn = interpolate(frame, [56, 420], [0, 560], clamp);
  const centre = usePop(300, 12);
  const circumference = 2 * Math.PI * RING.r;
  const [topX, topY] = onRing(-90);
  const [rightX, rightY] = onRing(0);
  const [bottomX, bottomY] = onRing(90);
  const [leftX, leftY] = onRing(180);
  return (
    <>
      <svg viewBox="0 0 1000 1000" style={{ position: 'absolute', inset: 0, width: 1000, height: 1000 }}>
        <circle cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" stroke={C.line} strokeWidth={6} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - draw)} transform={`rotate(-90 ${RING.cx} ${RING.cy})`} />
      </svg>
      {[0, 1, 2, 3].map((i) => {
        const visible = ramp(frame, 56 + i * 10, 14);
        if (visible <= 0) return null;
        return [10, 5, 0].map((lag) => {
          const [x, y] = onRing(turn - lag + i * 90 - 60);
          return <Coin key={`${i}-${lag}`} x={x} y={y} size={72} opacity={visible * (lag === 0 ? 1 : lag === 5 ? 0.25 : 0.1)} scale={lag === 0 ? 1 : 0.92} />;
        });
      })}
      <Avatar x={topX} y={topY} size={150} start={26} verifiedAt={40} />
      <Avatar x={rightX} y={rightY} size={150} start={40} verifiedAt={54} />
      <Avatar x={bottomX} y={bottomY} size={150} start={196} dashed icon={Store} />
      <Avatar x={leftX} y={leftY} size={150} start={214} dashed icon={Users} />
      <Pill x={topX} y={topY - 118} text="Du" start={34} />
      <Pill x={rightX} y={rightY + 118} text="Nachbarin" start={48} />
      <Pill x={bottomX} y={bottomY + 118} text="Geschäfte · bald" start={204} muted />
      <Pill x={leftX} y={leftY + 118} text="Vereine · bald" start={222} muted />
      <Shadow x={500} y={640} width={200 * centre} strength={centre} />
      <Coin x={500} y={500} size={210} scale={centre} glint={ramp(frame, 318, 30, smooth)} />
    </>
  );
}

const polar = (deg: number, r: number): [number, number] => [500 + Math.cos((deg * Math.PI) / 180) * r, 500 + Math.sin((deg * Math.PI) / 180) * r];
const INNER = [-90, 30, 150];
const OUTER = INNER.flatMap((deg, parent) => [deg - 30, deg + 30].map((angle) => ({ angle, parent })));

/** Scene 6: the circle grows from neighbour to neighbour. */
function Neighbours() {
  const frame = useCurrentFrame();
  const pull = interpolate(ramp(frame, 0, 200, smooth), [0, 1], [1.16, 1]);
  const link = (from: [number, number], to: [number, number], start: number, key: string) => {
    const t = ramp(frame, start, 22, smooth);
    const mid: [number, number] = [(from[0] + to[0]) / 2 + (to[1] - from[1]) * 0.12, (from[1] + to[1]) / 2 - (to[0] - from[0]) * 0.12];
    return <path key={key} d={`M ${from[0]} ${from[1]} Q ${mid[0]} ${mid[1]} ${to[0]} ${to[1]}`} fill="none" stroke={C.faint} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} opacity={t > 0 ? 1 : 0} />;
  };
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${pull})`, transformOrigin: '500px 500px' }}>
      <svg viewBox="0 0 1000 1000" style={{ position: 'absolute', inset: 0, width: 1000, height: 1000 }}>
        {INNER.map((deg, i) => link([500, 500], polar(deg, 215), 28 + i * 12, `i${i}`))}
        {OUTER.map((o, i) => link(polar(INNER[o.parent], 215), polar(o.angle, 410), 104 + i * 9, `o${i}`))}
      </svg>
      <Avatar x={500} y={500} size={150} start={4} verifiedAt={14} />
      <Coin x={556} y={552} size={58} scale={usePop(18)} />
      {INNER.map((deg, i) => {
        const [x, y] = polar(deg, 215);
        return <Member key={deg} x={x} y={y} size={124} start={44 + i * 12} />;
      })}
      {OUTER.map((o, i) => {
        const [x, y] = polar(o.angle, 410);
        return <Member key={o.angle} x={x} y={y} size={104} start={120 + i * 9} />;
      })}
    </div>
  );
}

function Member({ x, y, size, start }: { x: number; y: number; size: number; start: number }) {
  const coin = usePop(start + 12, 10);
  return (
    <>
      <Avatar x={x} y={y} size={size} start={start} verifiedAt={start + 8} />
      <Coin x={x + size * 0.38} y={y + size * 0.36} size={size * 0.42} scale={coin} />
    </>
  );
}

const OUTRO_LINES = ['Mehr Leute auf den Festen.', 'Mehr Leben in den Läden.', 'Mehr Stimmen für Röbel.'];

/** Scene 7: what it is for, then the name. */
function Outro() {
  const frame = useCurrentFrame();
  const leave = useRamp(226, 18, smooth);
  const drop = usePop(248, 11);
  const float = Math.sin((frame - 270) / 14) * 7 * Math.min(1, Math.max(0, (frame - 270) / 20));
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - leave, transform: `translateY(${-leave * 60}px)` }}>
        {OUTRO_LINES.map((line, i) => (
          <div key={line} style={{ ...at(500, 330 + i * 150), width: 1000 }}>
            <Reveal text={line} start={14 + i * 62} size={84} color={C.white} />
          </div>
        ))}
      </div>
      <Shadow x={500} y={560} width={300 * drop} strength={drop} dark />
      <Coin x={500} y={interpolate(drop, [0, 1], [-240, 350]) + float} size={330} rotate={(1 - drop) * -28} opacity={Math.min(1, drop * 5)} glint={ramp(frame, 276, 30, smooth)} />
      <div style={{ ...at(500, 700), width: 1000 }}>
        <Reveal text="Röbel Münzen" start={266} size={132} color={C.white} />
      </div>
      <div style={{ ...at(500, 810), width: 1000 }}>
        <Reveal text="Unser Dankeschön fürs Mitmachen." start={288} size={48} color={C.sky} family={FONT.body} weight={500} stagger={2} />
      </div>
    </>
  );
}

export const SCENE_VIEWS: Record<SceneId, () => JSX.Element> = {
  town: Town,
  question: Question,
  belonging: Belonging,
  takingPart: TakingPart,
  staysLocal: StaysLocal,
  neighbours: Neighbours,
  outro: Outro,
};
