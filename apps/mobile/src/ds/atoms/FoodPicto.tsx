import type { Category } from '@mesa/shared';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tintColor } from '../theme';
import { art, size } from '../tokens';

export interface FoodPictoProps {
  category: Category;
  /** sm 32 (rows) · md 40 (Use soon cards). */
  size?: 'sm' | 'md';
}

type Shape = 'produce' | 'dairy' | 'meat' | 'jar' | 'home';

const SHAPE: Record<Category, Shape> = {
  produce: 'produce',
  bakery: 'jar',
  meat: 'meat',
  dairy: 'dairy',
  frozen: 'dairy',
  cupboard: 'jar',
  drinks: 'dairy',
  household: 'home',
  other: 'jar',
};

const PIXELS = { sm: size.pictoSm, md: size.pictoMd } as const;
const LINE = 3;

/** A food category as a small outlined sticker in its pastel. Decorative: the row names the food. */
export function FoodPicto({ category, size: sizeName = 'sm' }: FoodPictoProps) {
  const fill = tintColor(category);
  const px = PIXELS[sizeName];
  return (
    <Svg width={px} height={px} viewBox="0 0 56 56" accessible={false}>
      <PictoShape shape={SHAPE[category]} fill={fill} />
    </Svg>
  );
}

function PictoShape({ shape, fill }: { shape: Shape; fill: string }) {
  const ink = art.ink;
  switch (shape) {
    case 'produce':
      return (
        <>
          <Circle cx={30} cy={34} r={17} fill={ink} />
          <Circle cx={27} cy={31} r={17} fill={fill} stroke={ink} strokeWidth={LINE} />
          <Path d="M18 15 Q27 8 36 15 Q27 21 18 15 Z" fill={ink} />
          <Path d="M27 14 L27 8" stroke={ink} strokeWidth={LINE} strokeLinecap="round" />
          <Path d="M17 29 Q18 23 23 21" fill="none" stroke={art.paper} strokeWidth={LINE} strokeLinecap="round" opacity={0.75} />
        </>
      );
    case 'dairy':
      return (
        <>
          <Path d="M20 22 L25 12 L37 12 L42 22 L42 48 L20 48 Z" fill={ink} />
          <Path d="M17 19 L22 9 L34 9 L39 19 L39 45 L17 45 Z" fill={fill} stroke={ink} strokeWidth={LINE} strokeLinejoin="round" />
          <Path d="M17 19 L39 19" stroke={ink} strokeWidth={LINE} />
          <Rect x={22} y={26} width={12} height={11} rx={3} fill={art.paper} stroke={ink} strokeWidth={LINE} />
        </>
      );
    case 'meat':
      return (
        <>
          <Path d="M15 30 C15 18 30 12 38 19 C45 25 42 38 32 40 C25 41 15 40 15 30 Z" fill={ink} />
          <Path d="M32 33 L43 44" stroke={ink} strokeWidth={5} strokeLinecap="round" />
          <Circle cx={45} cy={42} r={4} fill={art.paper} stroke={ink} strokeWidth={LINE} />
          <Circle cx={41} cy={46} r={4} fill={art.paper} stroke={ink} strokeWidth={LINE} />
          <Path
            d="M12 27 C12 15 27 9 35 16 C42 22 39 35 29 37 C22 38 12 37 12 27 Z"
            fill={fill}
            stroke={ink}
            strokeWidth={LINE}
            strokeLinejoin="round"
          />
          <Path d="M18 24 Q20 18 26 16" fill="none" stroke={art.paper} strokeWidth={LINE} strokeLinecap="round" opacity={0.75} />
        </>
      );
    case 'jar':
      return (
        <>
          <Rect x={17} y={19} width={26} height={31} rx={8} fill={ink} />
          <Rect x={14} y={16} width={26} height={31} rx={8} fill={fill} stroke={ink} strokeWidth={LINE} />
          <Rect x={17} y={8} width={20} height={8} rx={3} fill={ink} />
          <Rect x={19} y={26} width={16} height={11} rx={3} fill={art.paper} stroke={ink} strokeWidth={LINE} />
        </>
      );
    case 'home':
      return (
        <>
          <Rect x={18} y={23} width={24} height={27} rx={8} fill={ink} />
          <Rect x={15} y={20} width={24} height={27} rx={8} fill={fill} stroke={ink} strokeWidth={LINE} />
          <Rect x={22} y={11} width={10} height={9} rx={2} fill={ink} />
          <Path d="M27 11 L27 7 L38 7" fill="none" stroke={ink} strokeWidth={LINE} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={22} cy={32} r={3} fill={art.paper} />
          <Circle cx={29} cy={38} r={2} fill={art.paper} />
        </>
      );
  }
}
