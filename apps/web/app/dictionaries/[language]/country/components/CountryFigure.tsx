import type { CountryImage } from '@/lib/country/schema';

const LICENCE_LABEL = (licence: string) => {
  if (licence === 'PD') return 'Public domain';
  if (licence === 'AI-generated') return 'AI illustration';
  if (licence === 'CC0-1.0') return 'CC0';
  return licence.replace(/^CC-BY-SA-/, 'CC BY-SA ').replace(/^CC-BY-/, 'CC BY ');
};

const LICENCE_URL = (licence: string): string | undefined => {
  if (licence === 'CC0-1.0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  const match = licence.match(/^CC-BY(-SA)?-(\d\.\d)$/);
  return match ? `https://creativecommons.org/licenses/by${match[1] ? '-sa' : ''}/${match[2]}/` : undefined;
};

// One captioned, credited image. AI illustrations are always labelled as such.
export function CountryFigure({ image, compact = false }: { image: CountryImage; compact?: boolean }) {
  const licenceUrl = LICENCE_URL(image.licence);
  return (
    <figure className="m-0">
      <a href={image.src} className="block overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- static pre-sized assets */}
        <img
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          className="h-auto w-full object-cover"
        />
      </a>
      <figcaption className={`mt-1.5 text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
        {image.kind === 'illustration' && (
          <span className="mr-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-foreground">
            AI illustration, not a photograph
          </span>
        )}
        <span className="text-foreground">{image.caption}</span>
        {image.location && <span> {image.location}.</span>}{' '}
        <span className="text-xs">
          {image.credit}
          {' · '}
          {licenceUrl ? (
            <a href={licenceUrl} className="underline underline-offset-2" rel="noopener noreferrer">
              {LICENCE_LABEL(image.licence)}
            </a>
          ) : (
            LICENCE_LABEL(image.licence)
          )}
          {image.sourceUrl && (
            <>
              {' · '}
              <a href={image.sourceUrl} className="underline underline-offset-2" rel="noopener noreferrer">
                source
              </a>
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
