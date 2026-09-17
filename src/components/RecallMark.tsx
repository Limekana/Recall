import type { SVGProps } from 'react';

export function RecallMark({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={`recall-mark${className ? ` ${className}` : ''}`}
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        className="recall-mark__letter"
        fill="currentColor"
        fillRule="evenodd"
        d="M32 28h33c16.75 0 28 9.75 28 25 0 11.25-6.25 19.25-16.75 22.75l20 24.25h-22l-17-21.5H51V100H32V28Zm19 16.25V63h12.5C70.25 63 74 59.5 74 53.5c0-5.75-3.75-9.25-10.5-9.25H51Z"
      />
      <circle className="recall-mark__spark" cx="94" cy="30" r="6" />
    </svg>
  );
}
