import Image from 'next/image';

export function RacePhoto({
  photo,
  className = '',
}: {
  photo?: string | null;
  className?: string;
}) {
  if (!photo) return null;
  return (
    <Image
      src={photo}
      alt=""
      width={960}
      height={640}
      unoptimized
      className={`trail-race-photo ${className}`}
    />
  );
}
