import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { art } from '../tokens';

export interface DishArtProps {
  /** Picks one of the illustrations, always the same for the same seed (a recipe id). */
  seed: string;
}

const LINE = 4;
const DISHES = [Tinga, Soup, Enchiladas] as const;

/** Stand-in for a recipe photo: a flat, outlined plate on a pastel. Fills its parent. */
export function DishArt({ seed }: DishArtProps) {
  const Dish = DISHES[hash(seed) % DISHES.length]!;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Dish />
    </Svg>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Tinga() {
  return (
    <>
      <Rect width={400} height={260} fill={art.oat} />
      <Circle cx={342} cy={38} r={54} fill={art.clay} stroke={art.ink} strokeWidth={LINE} />
      <Circle cx={208} cy={138} r={104} fill={art.ink} />
      <Circle cx={200} cy={130} r={104} fill={art.paper} stroke={art.ink} strokeWidth={LINE} />
      <Circle cx={200} cy={130} r={76} fill={art.oat} stroke={art.ink} strokeWidth={LINE} />
      <Path
        d="M146 128 C146 94 192 82 222 92 C252 104 258 140 240 160 C222 180 176 182 160 166 C150 156 146 142 146 128 Z"
        fill={art.clay}
        stroke={art.ink}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <Path d="M162 150 Q182 136 202 150 T242 148" fill="none" stroke={art.paper} strokeWidth={7} strokeLinecap="round" />
      <Ellipse cx={180} cy={112} rx={22} ry={10} rotation={-24} origin="180, 112" fill={art.sage} stroke={art.ink} strokeWidth={3} />
      <Ellipse cx={216} cy={106} rx={22} ry={10} rotation={14} origin="216, 106" fill={art.sage} stroke={art.ink} strokeWidth={3} />
      <Ellipse cx={232} cy={134} rx={20} ry={9} rotation={62} origin="232, 134" fill={art.sage} stroke={art.ink} strokeWidth={3} />
    </>
  );
}

function Soup() {
  return (
    <>
      <Rect width={400} height={260} fill={art.mist} />
      <Circle cx={52} cy={226} r={62} fill={art.oat} stroke={art.ink} strokeWidth={LINE} />
      <Path d="M104 128 L312 128 C312 194 266 230 208 230 C150 230 104 194 104 128 Z" fill={art.ink} />
      <Path
        d="M96 120 L304 120 C304 186 258 222 200 222 C142 222 96 186 96 120 Z"
        fill={art.paper}
        stroke={art.ink}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <Ellipse cx={200} cy={120} rx={104} ry={24} fill={art.clay} stroke={art.ink} strokeWidth={LINE} />
      <Path d="M140 118 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke={art.oat} strokeWidth={5} strokeLinecap="round" />
      <Path d="M168 84 q-12 -14 0 -28 q12 -14 0 -28" fill="none" stroke={art.ink} strokeWidth={5} strokeLinecap="round" />
      <Path d="M200 84 q-12 -14 0 -28 q12 -14 0 -28" fill="none" stroke={art.ink} strokeWidth={5} strokeLinecap="round" />
      <Path d="M232 84 q-12 -14 0 -28 q12 -14 0 -28" fill="none" stroke={art.ink} strokeWidth={5} strokeLinecap="round" />
    </>
  );
}

function Enchiladas() {
  return (
    <>
      <Rect width={400} height={260} fill={art.blush} />
      <Circle cx={360} cy={220} r={70} fill={art.stone} stroke={art.ink} strokeWidth={LINE} />
      <Ellipse cx={208} cy={144} rx={152} ry={88} fill={art.ink} />
      <Ellipse cx={200} cy={136} rx={152} ry={88} fill={art.paper} stroke={art.ink} strokeWidth={LINE} />
      <Rect x={104} y={86} width={190} height={32} rx={16} rotation={-10} origin="200, 102" fill={art.oat} stroke={art.ink} strokeWidth={LINE} />
      <Rect x={104} y={120} width={190} height={32} rx={16} rotation={-10} origin="200, 136" fill={art.oat} stroke={art.ink} strokeWidth={LINE} />
      <Rect x={104} y={154} width={190} height={32} rx={16} rotation={-10} origin="200, 170" fill={art.oat} stroke={art.ink} strokeWidth={LINE} />
      <Path d="M110 140 Q150 112 200 134 T290 112" fill="none" stroke={art.sage} strokeWidth={16} strokeLinecap="round" />
      <Circle cx={160} cy={126} r={7} fill={art.paper} stroke={art.ink} strokeWidth={3} />
      <Circle cx={214} cy={128} r={7} fill={art.paper} stroke={art.ink} strokeWidth={3} />
      <Circle cx={252} cy={116} r={7} fill={art.paper} stroke={art.ink} strokeWidth={3} />
    </>
  );
}
