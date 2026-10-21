import Image from 'next/image';
import { raceCategory, type UtmbCategory } from '@/lib/trail/category';

export function CategoryBadge({
  category,
  estimated = false,
}: {
  category: UtmbCategory;
  estimated?: boolean;
}) {
  const label = estimated
    ? `Format estimé ${category} selon le km-effort · homologation UTMB non vérifiée`
    : `Catégorie UTMB ${category}`;
  const assetPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/utmb/${category.toLowerCase()}`;
  return (
    <span className="trail-category-badge" title={label} role="img" aria-label={label}>
      <Image
        className="trail-category-light"
        src={`${assetPath}.svg`}
        alt=""
        width={106}
        height={34}
      />
      <Image
        className="trail-category-dark"
        src={`${assetPath}-dark.svg`}
        alt=""
        width={106}
        height={34}
      />
      {estimated && <span className="trail-category-estimate">estimé</span>}
    </span>
  );
}

export function RaceCategoryBadge({ race }: { race: Parameters<typeof raceCategory>[0] }) {
  const result = raceCategory(race);
  return result ? <CategoryBadge {...result} /> : null;
}
