/** Keep photos small enough to travel with local backups and season sync. */
export async function prepareRacePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choisis une photo au format JPG, PNG ou WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La photo dépasse 15 Mo.');
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossible de lire cette photo.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error('Cette image est illisible. Choisis une autre photo.');
  }
  const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('La préparation de la photo est indisponible.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.6, 0.4, 0.25]) {
    const photo = canvas.toDataURL('image/jpeg', quality);
    if (photo.length <= 100000) return photo;
  }
  throw new Error('Cette photo reste trop volumineuse. Choisis une image plus simple.');
}
