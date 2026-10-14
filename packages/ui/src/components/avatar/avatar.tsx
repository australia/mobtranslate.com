'use client';
import * as React from 'react';
import {Avatar as BaseAvatar} from '@base-ui-components/react/avatar';
import {cn} from '../../utils/cn';
export type AvatarLoadingStatus='idle'|'loading'|'loaded'|'error';
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?:'sm'|'md'|'lg'|'xl';
  src?:string;
  alt?:string;
  fallback?:string;
  retryKey?:string|number;
  onLoadingStatusChange?:(status:AvatarLoadingStatus)=>void;
  referrerPolicy?:React.HTMLAttributeReferrerPolicy;
  crossOrigin?:''|'anonymous'|'use-credentials';
}
export const Avatar=React.forwardRef<HTMLDivElement,AvatarProps>(
  ({className,size='md',src,alt,fallback,retryKey=0,onLoadingStatusChange,referrerPolicy,crossOrigin,'aria-label':ariaLabel,'aria-labelledby':labelledBy,...props},ref)=>{
    const label=ariaLabel??alt;
    const named=Boolean(label||labelledBy);
    const glyph=fallback||(alt?Array.from(alt)[0]?.toLocaleUpperCase():'?');
    return <div ref={ref} className={cn('mt-avatar',`mt-avatar-${size}`,className)} role={named?'img':undefined} aria-label={label||undefined} aria-labelledby={labelledBy} aria-hidden={!named?true:undefined} {...props}>
      <BaseAvatar.Root key={JSON.stringify([src??'',retryKey,referrerPolicy??'',crossOrigin??''])} className="mt-avatar-content">
        {src&&<BaseAvatar.Image src={src} alt="" aria-hidden="true" referrerPolicy={referrerPolicy} crossOrigin={crossOrigin} className="mt-avatar-image" onLoadingStatusChange={onLoadingStatusChange} />}
        <BaseAvatar.Fallback className="mt-avatar-fallback" aria-hidden="true">{glyph}</BaseAvatar.Fallback>
      </BaseAvatar.Root>
    </div>;
  }
);
Avatar.displayName='Avatar';
