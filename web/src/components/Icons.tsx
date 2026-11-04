type P = { className?: string };

const svg = (className: string | undefined, children: React.ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);

/** Folha com o canto dobrado. */
export const IconFile = ({ className }: P) =>
  svg(
    className,
    <>
      <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
      <path d="M9.25 1.75V5h3.25" />
    </>,
  );

export const IconChevron = ({ className }: P) => svg(className, <path d="M6 4l4 4-4 4" />);

export const IconPlus = ({ className }: P) => svg(className, <path d="M8 3.5v9M3.5 8h9" />);

export const IconClose = ({ className }: P) => svg(className, <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />);

export const IconComment = ({ className }: P) =>
  svg(className, <path d="M2.75 3.25h10.5v7.5H8l-3.25 2.5v-2.5h-2z" />);

export const IconSend = ({ className }: P) => svg(className, <path d="M2.5 8h9M8 4.5L11.5 8 8 11.5" />);

export const IconUndo = ({ className }: P) => svg(className, <path d="M6 3.5L3 6.5l3 3M3.5 6.5h5a3.5 3.5 0 010 7H6" />);

export const IconUpload = ({ className }: P) => svg(className, <path d="M8 11V2.75M4.75 5.75L8 2.5l3.25 3.25M2.75 10.5v2.75h10.5V10.5" />);
